import 'regenerator-runtime/runtime';
import chai from 'chai';
import chaiFiles from 'chai-files';
import walkSync from 'walk-sync';
import fixture from 'fixturify';
import Rollup from '../';
import broccoli from 'broccoli';
import fs from 'fs-extra';

const { expect } = chai;
const { file } = chaiFiles;

chai.use(chaiFiles);

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
        .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');
    });

    describe('rebuild', function() {
      it('simple', async function() {

        expect(node._lastBundle).to.be.null;

        let { directory } = await pipeline.build();

        expect(Object.keys(node._lastBundle)).to.not.be.empty;

        fixture.writeSync(input, { 'minus.js':  'export default x => x - x;' });

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');

        await pipeline.build();

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');

        fixture.writeSync(input, {
          'index.js': 'import add from "./add"; import minus from "./minus"; export default { a: add(1), b: minus(1) };'
        });

        await pipeline.build();

        expect(file(directory + '/out.js'))
          .to.equal('var add = x => x + x;\n\nvar minus = x => x - x;\n\nvar index = { a: add(1), b: minus(1) };\n\nexport default index;');

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
          .to.equal('var add = x => x + x;\n\nvar index = add(1);\n\nexport default index;');
      });

      describe('stability', function(){
        it('is stable on idempotent rebuild', async function() {
          let { directory } = await pipeline.build();

          let beforeStat = fs.statSync(directory + '/out.js');

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

})));`);

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
              dest: 'dist/out.js'
            }
          ]
        }
      });

      pipeline = new broccoli.Builder(node);

      let { directory } = await pipeline.build();

      expect(walkSync(directory + '/dist')).to.eql([
        'out.js',
        'out.umd.js'
      ]);

      expect(file(directory + '/dist/out.js'))
        .to.equal(`var add = x => x + x;

const two = add(1);

export default two;`);

      expect(file(directory + '/dist/out.umd.js'))
        .to.equal(`(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.thing = factory());
}(this, (function () { 'use strict';

var add = x => x + x;

const two = add(1);

return two;

})));`);


    });
  })
});
