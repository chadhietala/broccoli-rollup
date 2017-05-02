import 'es6-promise'; // for regenerator
import 'regenerator-runtime/runtime'; // only for tests, because async/await tests are very nice
import chai from 'chai';
import chaiFiles from 'chai-files';
import walkSync from 'walk-sync';
import fixture from 'fixturify';
import Rollup from '../';
import broccoli from 'broccoli';
import fs from 'fs-extra';
import MergeTrees from 'broccoli-merge-trees';

const { expect } = chai;
const { file } = chaiFiles;

chai.use(chaiFiles);


describe('Staging files smoke tests', function() {
  let input1 = 'tmp/fixture-input-1';
  let input2 = 'tmp/fixture-input-2';
  let node;
  let pipeline;

  beforeEach(function() {
    fs.mkdirpSync(input1);
    fs.mkdirpSync(input2);
    fixture.writeSync(input1, {
      'add.js': 'export const add = num => num++;',
      'index.js': 'import two from "./two"; import { add } from "./add"; const result = add(two); export default result;'
    });

    fixture.writeSync(input2, {
      'minus.js': 'export const minus = num => num--;',
      'two.js': 'import { minus } from "./minus"; const two = minus(3); export default two;'
    });

    node = new Rollup(new MergeTrees([input1, input2]), {
      rollup: {
        entry: 'index.js',
        dest: 'out.js'
      }
    });
    pipeline = new broccoli.Builder(node);
  });

  afterEach(function() {
    fs.removeSync(input1);
    fs.removeSync(input2);
    return pipeline.cleanup();
  });

  it('handles merged trees and building from staging', async function() {
    const { directory } = await pipeline.build();
    expect(file(directory + '/out.js'))
        .to.equal('const minus = num => num--;\n\nconst two = minus(3);\n\nconst add = num => num++;\n\nconst result = add(two);\n\nexport default result;\n');
  });
});

describe('BroccoliRollup', function() {
  const input = 'tmp/fixture-input';
  let node, pipeline;

  describe("basic usage", function() {
    beforeEach(function() {
      fs.mkdirpSync(input);
      fixture.writeSync(input, {
        'add.js': 'export default x => x + x;',
        'index.js': 'import add from "./add"; const two = add(1); export default two;'
      });

      node = new Rollup(input, {
        rollup: {
          entry: 'index.js',
          dest: 'out.js'
        }
      });

      pipeline = new broccoli.Builder(node);
    });

    afterEach(function() {
      fs.removeSync(input);
      return pipeline.cleanup();
    });

    it('simple', async function() {
      const { directory } = await pipeline.build();
      expect(file(directory + '/out.js'))
        .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;\n');
    });

    describe('rebuild', function() {
      it('simple', async function() {

        expect(node._lastBundle).to.be.null;

        let { directory } = await pipeline.build();

        expect(Object.keys(node._lastBundle)).to.not.be.empty;

        fixture.writeSync(input, { 'minus.js':  'export default x => x - x;' });

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;\n');

        await pipeline.build();

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;\n');

        fixture.writeSync(input, {
          'index.js': 'import add from "./add"; import minus from "./minus"; export default { a: add(1), b: minus(1) };'
        });

        await pipeline.build();

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nvar minus = x => x - x;\n\nvar index = { a: add(1), b: minus(1) };\n\nexport default index;\n');

        fixture.writeSync(input, { 'minus.js':  null });

        let errorWasThrown = false;
        try {
          await pipeline.build();
        } catch (e) {
          errorWasThrown = true;
          expect(e).to.have.property('message');
          expect(e.message).to.match(/Could not (resolve|load)/);
        }

        fixture.writeSync(input, {
          'index.js': 'import add from "./add"; export default add(1);'
        });

        await pipeline.build();

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nvar index = add(1);\n\nexport default index;\n');
      });

      describe('stability', function(){
        it('is stable on idempotent rebuild', async function() {
          let { directory } = await pipeline.build();

          let beforeStat = fs.statSync(directory + '/out.js');

          // some filesystems dont have lower then 1s mtime resolution, so lets
          // wait
          await new Promise(resolve => setTimeout(resolve, 1000));
          await pipeline.build();

          let afterStat = fs.statSync(directory + '/out.js');

          expect(beforeStat).to.eql(afterStat);
        });
      });
    });
  });

  describe('targets', function() {

    beforeEach(function() {
      fs.mkdirpSync(input);
      fixture.writeSync(input, {
        'add.js': 'export default x => x + x;',
        'index.js': 'import add from "./add"; const two = add(1); export default two;'
      });
    });

    afterEach(function() {
      fs.removeSync(input);
      return pipeline.cleanup();
    });

    // supports multiple targets
    it('works with one explicit target', async function() {
      let node = new Rollup(input, {
        rollup: {
          entry: 'index.js',
          targets: [
            {
              format: 'umd',
              moduleName: 'thing',
              dest: 'dist/out.umd.js'
            }
          ]
        }
      });

      pipeline = new broccoli.Builder(node);

      let { directory } = await pipeline.build();
      expect(walkSync(directory + '/dist')).to.eql([
        'out.umd.js',
      ]);

      expect(file(directory + '/dist/out.umd.js'))
        .to.equal(`(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.thing = factory());
}(this, (function () { 'use strict';

var add = x => x + x;

const two = add(1);

return two;

})));\n`);

    });

    it('works with many targets', async function() {
      let node = new Rollup(input, {
        rollup: {
          entry: 'index.js',
          targets: [
            {
              format: 'umd',
              moduleName: 'thing',
              dest: 'dist/out.umd.js'
            },
            {
              format: 'es',
              sourceMap: true,
              dest: 'dist/out.js'
            }
          ]
        }
      });

      pipeline = new broccoli.Builder(node);

      let { directory } = await pipeline.build();

      expect(walkSync(directory + '/dist')).to.eql([
        'out.js',
        'out.js.map',
        'out.umd.js'
      ]);

      expect(file(directory + '/dist/out.js'))
        .to.equal(`var add = x => x + x;

const two = add(1);

export default two;

//# sourceMappingURL=out.js.map
`);

      expect(file(directory + '/dist/out.js.map'))
        .to.equal('{"version":3,"file":"out.js","sources":["../add.js","../index.js"],"sourcesContent":["export default x => x + x;","import add from \\"./add\\"; const two = add(1); export default two;"],"names":[],"mappings":"AAAA,UAAe,CAAC,IAAI,CAAC,GAAG,CAAC;;ACAA,MAAM,GAAG,GAAG,GAAG,CAAC,CAAC,CAAC,CAAC,AAAC,;;"}');

      expect(file(directory + '/dist/out.umd.js'))
        .to.equal(`(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.thing = factory());
}(this, (function () { 'use strict';

var add = x => x + x;

const two = add(1);

return two;

})));\n`);


    });
  });

  describe('passing nodeModulesPath', function() {
    it('should throw if nodeModulesPath is relative', function() {
      expect(function() {
        new Rollup('lib', {
          nodeModulesPath: './',
          rollup: {
            entry: 'index.js',
            dest: 'out.js'
          }
        });
      }).to.throw(/nodeModulesPath must be fully qualified and you passed a relative path/);
    });
  });
});
