# `broccoli-rollup`

[![Build Status](https://travis-ci.org/chadhietala/broccoli-rollup.svg?branch=master)](https://travis-ci.org/chadhietala/broccoli-rollup)

A [broccoli](https://broccoli.build/) plugin that uses [rollup.js](https://rollupjs.org/) on its input.

## Usage

### Basic

```js
// Brocfile.js
import rollup from 'broccoli-rollup';

export default () =>
  rollup('lib', {
    // nodeModulesPath: string Defaults to process.cwd()
    rollup: {
      input: 'index.js',
      output: {
        file: 'bundle.js',
        format: 'es',
      },
    },
  });
```

### Code Splitting

```js
// Brocfile.js
import rollup from 'broccoli-rollup';

export default () =>
  rollup('lib', {
    // nodeModulesPath: string Defaults to process.cwd()
    rollup: {
      input: 'index.js',
      output: {
        dir: 'chunks',
        format: 'es',
      },
    },
  });
```

### Multiple Output

```js
// Brocfile.js
import rollup from 'broccoli-rollup';

export default () =>
  rollup('lib', {
    // nodeModulesPath: string Defaults to process.cwd()
    rollup: {
      input: 'index.js',
      output: [
        {
          file: 'my-lib.amd.js',
          format: 'amd',
        },
        {
          file: 'my-lib.iife.js',
          name: 'MyLib',
          format: 'iife',
        },
      ],
    },
  });
```

## Notes and Caveats

Broccoli is designed around immutable input and although rollup does expose enough
in the build output for us to write it to disk, this doesn't work with the `onwrite` plugin hook
and requires a significant amount of code to get feature parity with rollup's
`buildOutput.write(outputOptions)`.

We use the following build flow to achieve compatibility and feature parity with rollup's cli
while still adhering to broccoli's immutable input constraints.

1. sync `node.inputPaths[0]` to `${node.cachePath}/build`
2. symlink `options.nodeModulesPath` to `${node.cachePath}/node_modules`
3. change the working directory to `${node.cachePath}/build` (rollup doesn't allow this to be passed in and plugins may also the use cwd)
4. run rollup
5. restore the working directory
6. sync `${node.cachePath}/build` to `node.outputPath` for all files that are different from the input.

If you have any plugins that require hard-coded paths into `node_modules`,
please note that `node_modules` is symlinked above the build path.

So instead of doing `node_modules/x` you need to do `../node_modules/x`.
