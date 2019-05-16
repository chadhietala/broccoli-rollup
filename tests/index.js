const { createBuilder, createTempDir } = require('broccoli-test-helper');
const mergeTrees = require('broccoli-merge-trees');
const { default: rollup } = require('../index');

const describe = QUnit.module;
const it = QUnit.test;

/** @typedef {import('broccoli-test-helper').Disposable} Disposable */
/** @typedef {import('broccoli-test-helper').TempDir} TempDir */

describe('Staging files smoke tests', () => {
  it('handles merged trees and building from staging', async assert => {
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

describe('BroccoliRollup', () => {
  it('test build: initial update noop', async assert => {
    await using(async use => {
      const input = use(await createTempDir());
      const subject = rollup(input.path(), {
        rollup: {
          input: 'index.js',
          output: {
            file: 'out.js',
            format: 'es',
          },
        },
      });
      const output = use(createBuilder(subject));
      // INITIAL
      input.write({
        'add.js': 'export default x => x + x;',
        'index.js':
          'import add from "./add"; const two = add(1); export default two;',
      });
      await output.build();

      assert.deepEqual(output.read(), {
        'out.js': `var add = x => x + x;

const two = add(1);

export default two;
`,
      });
      assert.deepEqual(output.changes(), {
        'out.js': 'create',
      });

      // UPDATE
      input.write({
        'minus.js': `export default x => x - x;`,
      });
      await output.build();

      assert.deepEqual(output.read(), {
        'out.js': `var add = x => x + x;

const two = add(1);

export default two;
`,
      });
      assert.deepEqual(output.changes(), {});

      input.write({
        'index.js':
          'import add from "./add"; import minus from "./minus"; export default { a: add(1), b: minus(1) };',
      });

      await output.build();

      assert.deepEqual(output.read(), {
        'out.js': `var add = x => x + x;

var minus = x => x - x;

var index = { a: add(1), b: minus(1) };

export default index;
`,
      });
      assert.deepEqual(output.changes(), {
        'out.js': 'change',
      });

      input.write({ 'minus.js': null });

      let errorWasThrown = false;
      try {
        await output.build();
      } catch (e) {
        errorWasThrown = true;
        assert.ok(
          /Could not.*minus\.js/.test(e.message),
          `expected error about minus.js missing but got ${e.message}`,
        );
      }
      assert.ok(errorWasThrown, 'error was thrown');

      input.write({
        'index.js': 'import add from "./add"; export default add(1);',
      });

      await output.build();

      assert.deepEqual(output.read(), {
        'out.js': `var add = x => x + x;

var index = add(1);

export default index;
`,
      });
      assert.deepEqual(output.changes(), {
        'out.js': 'change',
      });

      // NOOP
      await output.build();

      assert.deepEqual(output.changes(), {});
    });
  });

  describe('targets', hooks => {
    /** @type {TempDir} */
    let input;
    hooks.beforeEach(async () => {
      input = await createTempDir();
      input.write({
        'add.js': 'export default x => x + x;',
        'index.js':
          'import add from "./add"; const two = add(1); export default two;',
      });
    });

    hooks.afterEach(async () => {
      await input.dispose();
    });

    // supports multiple targets
    it('works with one explicit target', async assert => {
      const node = rollup(input.path(), {
        rollup: {
          input: 'index.js',
          output: [
            {
              file: 'dist/out.umd.js',
              format: 'umd',
              name: 'thing',
            },
          ],
        },
      });
      const output = createBuilder(node);
      try {
        await output.build();

        assert.deepEqual(output.read(), {
          dist: {
            'out.umd.js':
              "(function (global, factory) {\n\ttypeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :\n\ttypeof define === 'function' && define.amd ? define(factory) :\n\t(global = global || self, global.thing = factory());\n}(this, function () { 'use strict';\n\n\tvar add = x => x + x;\n\n\tconst two = add(1);\n\n\treturn two;\n\n}));\n",
          },
        });
      } finally {
        await output.dispose();
      }
    });

    it('works with many targets', async assert => {
      const node = rollup(input.path(), {
        rollup: {
          input: 'index.js',
          output: [
            {
              file: 'dist/out.umd.js',
              format: 'umd',
              name: 'thing',
            },
            {
              file: 'dist/out.js',
              format: 'es',
              sourcemap: true,
            },
          ],
        },
      });

      const output = createBuilder(node);
      try {
        await output.build();

        assert.deepEqual(output.read(), {
          dist: {
            'out.js': `var add = x => x + x;

const two = add(1);

export default two;
//# sourceMappingURL=out.js.map
`,
            'out.js.map':
              '{"version":3,"file":"out.js","sources":["../add.js","../index.js"],"sourcesContent":["export default x => x + x;","import add from \\"./add\\"; const two = add(1); export default two;"],"names":[],"mappings":"AAAA,UAAe,CAAC,IAAI,CAAC,GAAG,CAAC;;qBAAC,rBCAD,MAAM,GAAG,GAAG,GAAG,CAAC,CAAC,CAAC,CAAC;;;;"}',
            'out.umd.js':
              "(function (global, factory) {\n\ttypeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :\n\ttypeof define === 'function' && define.amd ? define(factory) :\n\t(global = global || self, global.thing = factory());\n}(this, function () { 'use strict';\n\n\tvar add = x => x + x;\n\n\tconst two = add(1);\n\n\treturn two;\n\n}));\n",
          },
        });
      } finally {
        await output.dispose();
      }
    });
  });

  describe('passing nodeModulesPath', () => {
    it('should throw if nodeModulesPath is relative', assert => {
      assert.throws(
        () =>
          rollup('lib', {
            nodeModulesPath: './',
            rollup: {
              input: 'index.js',
              output: {
                file: 'out.js',
                format: 'es',
              },
            },
          }),
        new Error(
          'nodeModulesPath must be fully qualified and you passed a relative path',
        ),
      );
    });
  });

  describe('tree shaking', () => {
    it('can code split', async assert => {
      await using(async use => {
        const input = use(await createTempDir());
        const subject = rollup(input.path(), {
          rollup: {
            input: ['a.js', 'b.js', 'f.js'],
            output: {
              dir: 'chunks',
              format: 'es',
            },
          },
        });

        const output = use(createBuilder(subject));

        input.write({
          'a.js':
            'import c from "./c"; import e from "./e"; export const out = c + e;',
          'b.js':
            'import d from "./d";import e from "./e"; export const out = d + e;',
          'c.js': 'const num1 = 1; export default num1;',
          'd.js': 'const num2 = 2; export default num2;',
          'e.js': 'const num3 = 3; export default num3;',
          'f.js': 'export const num4 = 4;',
        });

        await output.build();

        assert.deepEqual(output.read(), {
          chunks: {
            'a.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num1 = 1;\n\nconst out = num1 + e;\n\nexport { out };\n",
            'b.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num2 = 2;\n\nconst out = num2 + e;\n\nexport { out };\n",
            'chunk-9db0917b.js': 'const num3 = 3;\n\nexport { num3 as a };\n',
            'f.js': 'const num4 = 4;\n\nexport { num4 };\n',
          },
        });

        await output.build();

        assert.deepEqual(output.changes(), {}, 'no op build');

        input.write({
          'd.js':
            'const num2 = 2; export default num2; export const foo = "bar"',
        });

        await output.build();

        assert.deepEqual(output.changes(), {}, 'no changes from unused export');

        input.write({
          'foo.css': 'unrelated file',
        });

        await output.build();

        assert.deepEqual(
          output.changes(),
          {},
          'no changes from unrelated input',
        );

        input.write({
          'f.js': 'export { foo } from "./other"',
        });

        try {
          await output.build();
        } catch (e) {
          assert.ok(
            /Could not.*other/.test(e.message),
            `expected error about other missing but got ${e.message}`,
          );
        }

        input.write({
          'other.js': '',
        });

        try {
          await output.build();
        } catch (e) {
          assert.ok(
            /foo.*not exported.*other/.test(e.message),
            `expected error about foo not exported from other but got ${
              e.message
            }`,
          );
        }

        // our output should still be the same as before noops and errors
        assert.deepEqual(output.read(), {
          chunks: {
            'a.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num1 = 1;\n\nconst out = num1 + e;\n\nexport { out };\n",
            'b.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num2 = 2;\n\nconst out = num2 + e;\n\nexport { out };\n",
            'chunk-9db0917b.js': 'const num3 = 3;\n\nexport { num3 as a };\n',
            'f.js': 'const num4 = 4;\n\nexport { num4 };\n',
          },
        });

        input.write({
          'other.js': 'export function foo() {};',
        });

        await output.build();

        assert.deepEqual(
          output.changes(),
          {
            'chunks/f.js': 'change',
          },
          'only the entry point affected by the change should change',
        );

        assert.deepEqual(output.read(), {
          chunks: {
            'a.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num1 = 1;\n\nconst out = num1 + e;\n\nexport { out };\n",
            'b.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num2 = 2;\n\nconst out = num2 + e;\n\nexport { out };\n",
            'chunk-9db0917b.js': 'const num3 = 3;\n\nexport { num3 as a };\n',
            'f.js': 'function foo() {}\n\nexport { foo };\n',
          },
        });

        input.write({
          'other.js': 'export { foo } from "./d";',
        });

        await output.build();

        assert.deepEqual(
          output.changes(),
          {
            'chunks/b.js': 'change',
            'chunks/chunk-2f73092a.js': 'create',
            'chunks/f.js': 'change',
          },
          'only the entry point affected by the change should change',
        );

        assert.deepEqual(output.read(), {
          chunks: {
            'a.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num1 = 1;\n\nconst out = num1 + e;\n\nexport { out };\n",
            'b.js':
              "import { a as e } from './chunk-9db0917b.js';\nimport { a as d } from './chunk-2f73092a.js';\n\nconst out = d + e;\n\nexport { out };\n",
            'chunk-2f73092a.js':
              'const num2 = 2; const foo = "bar";\n\nexport { num2 as a, foo as b };\n',
            'chunk-9db0917b.js': 'const num3 = 3;\n\nexport { num3 as a };\n',
            'f.js': "export { b as foo } from './chunk-2f73092a.js';\n",
          },
        });

        // undo
        input.write({
          'other.js': 'export function foo() {};',
        });

        await output.build();

        assert.deepEqual(
          output.changes(),
          {
            'chunks/b.js': 'change',
            'chunks/chunk-2f73092a.js': 'unlink',
            'chunks/f.js': 'change',
          },
          'only the entry point affected by the change should change',
        );

        assert.deepEqual(output.read(), {
          chunks: {
            'a.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num1 = 1;\n\nconst out = num1 + e;\n\nexport { out };\n",
            'b.js':
              "import { a as e } from './chunk-9db0917b.js';\n\nconst num2 = 2;\n\nconst out = num2 + e;\n\nexport { out };\n",
            'chunk-9db0917b.js': 'const num3 = 3;\n\nexport { num3 as a };\n',
            'f.js': 'function foo() {}\n\nexport { foo };\n',
          },
        });
      });
    });
  });
});

/** @typedef {<T extends Disposable>(disposable: T) => T} UseCallback */

/**
 * @param {(use: UseCallback) => Promise<void>} body
 */
async function using(body) {
  /** @type {Disposable[]} */
  const disposables = [];
  /** @type {UseCallback} */
  const use = disposable => {
    disposables.push(disposable);
    return disposable;
  };
  try {
    await body(use);
  } finally {
    let disposable = disposables.pop();
    while (disposable !== undefined) {
      await disposable.dispose();
      disposable = disposables.pop();
    }
  }
}
