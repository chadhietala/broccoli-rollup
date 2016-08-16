import 'regenerator-runtime/runtime';
import chai from 'chai';
import walkSync from 'walk-sync';
import fixture from 'fixturify';
import Rollup from '../';
import broccoli from 'broccoli';
import fs from 'fs-extra';

const { expect } = chai;

chai.use(require('chai-fs'));
describe('BroccoliRollup', () => {
  const input = 'tmp/fixture-input';
  fs.mkdirpSync(input);

  let node, pipeline;

  beforeEach(() => {
    fixture.writeSync(input, {
      'add.js': 'function add(a) { return a + 1; }\n export { add };',
      'index.js': 'import { add } from "./add"; const two = add(1); export default two;'
    });

    node = new Rollup(input, {
      rollup: {
        entry: 'index.js',
        dest: 'out.js'
      }
    });

    pipeline = new broccoli.Builder(node);
  });

  afterEach(() => {
    fixture.writeSync(input, null);
  });

  it('simple', async () => {
    const { directory } = await pipeline.build();

    expect(directory + '/out.js').
      to.have.content('function add(a) { return a + 1; }\n\nconst two = add(1);\n\nexport default two;')
  });

  describe('rebuild', () => {
    it('simple', async () => {

      let { directory } = await pipeline.build();

      fixture.writeSync(input, { 'minus.js':  'function minus(a) { return a - 1;}\n export { minus };' });

      expect(directory + '/out.js').
        to.have.content('function add(a) { return a + 1; }\n\nconst two = add(1);\n\nexport default two;')

      await pipeline.build();

      expect(directory + '/out.js').
        to.have.content('function add(a) { return a + 1; }\n\nconst two = add(1);\n\nexport default two;')
    });
  });
  // TODO:
  // hinting
  // code coverage
  // config reloads
  // is stable
  // supports multiple targets
});
