import 'regenerator-runtime/runtime';
import chai from 'chai';
import walkSync from 'walk-sync';
import fixture from 'fixturify';
import Rollup from '../';
import broccoli from 'broccoli';
import fs from 'fs-extra';

const { expect } = chai;

chai.use(require('chai-fs'));
describe('BroccoliRollup', function() {
  const input = 'tmp/fixture-input';
  let node, pipeline;

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

    expect(directory + '/out.js').
      to.have.content('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');
  });

  describe('rebuild', function() {
    it('simple', async function() {

      let { directory } = await pipeline.build();

      fixture.writeSync(input, { 'minus.js':  'export default x => x - x;' });

      expect(directory + '/out.js').
        to.have.content('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');

      await pipeline.build();

      expect(directory + '/out.js').
        to.have.content('var add = x => x + x;\n\nconst two = add(1);\n\nexport default two;');

      fixture.writeSync(input, {
        'index.js': 'import add from "./add"; import minus from "./minus"; export default { a: add(1), b: minus(1) };'
      });

      await pipeline.build();

      expect(directory + '/out.js').
        to.have.content('var add = x => x + x;\n\nvar minus = x => x - x;\n\nvar index = { a: add(1), b: minus(1) };\n\nexport default index;');

      fixture.writeSync(input, { 'minus.js':  null });

      let errorWasThrown = false;
      try {
        await pipeline.build();
      } catch (e) {
        errorWasThrown = true;
        expect(e).to.have.property('message');
        expect(e.message).to.match(/Could not resolve/);
      }

      fixture.writeSync(input, {
        'index.js': 'import add from "./add"; export default add(1);'
      });

      await pipeline.build();

      expect(directory + '/out.js').
        to.have.content('var add = x => x + x;\n\nvar index = add(1);\n\nexport default index;');
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
  // TODO:
  // hinting
  // code coverage
  // config reloads
  // supports multiple targets
});
