const { createBuilder, createTempDir } = require('broccoli-test-helper');
const mergeTrees = require('broccoli-merge-trees');
const { default: rollup } = require('../index');
const { using } = require('./test-helpers');

const { module: describe, test: it } = QUnit;

describe('broccoli-merge-trees input', () => {
  it('builds from merged changes', async assert => {
    await using(async use => {
      const input1 = use(await createTempDir());
      const input2 = use(await createTempDir());
      const node = rollup(mergeTrees([input1.path(), input2.path()]), {
        rollup: {
          input: 'index.js',
          output: {
            file: 'out.js',
            format: 'es',
          },
        },
      });
      const output = use(createBuilder(node));

      input1.write({
        'add.js': 'export const add = num => num++;',
        'index.js':
          'import two from "./two"; import { add } from "./add"; const result = add(two); export default result;',
        node_modules: {},
      });

      input2.write({
        'minus.js': 'export const minus = num => num--;',
        'two.js':
          'import { minus } from "./minus"; const two = minus(3); export default two;',
      });

      await output.build();

      assert.deepEqual(output.read(), {
        'out.js':
          'const minus = num => num--;\n\nconst two = minus(3);\n\nconst add = num => num++;\n\nconst result = add(two);\n\nexport default result;\n',
      });
    });
  });
});
