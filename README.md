# Usage

Broccoli-rollup is a simple wrapper around [Rollup](https://github.com/rollup/rollup). In the options object pass the [rollup options](https://github.com/rollup/rollup/wiki/JavaScript-API#rolluprollup-options-).

#### basic

```js
var Rollup = require('broccoli-rollup');
var lib = 'lib';

module.exports = new Rollup(lib, {
  // nodeModulesPath: string Defaults to process.cwd()
  rollup: {
    input: 'lib/index.js',
    output: {
      file: 'my-lib.js',
      format: 'es',
    },
    // cache: true|false Defaults to true
  }
})
```

#### \w targets

```js
var Rollup = require('broccoli-rollup');
var lib = 'lib';

module.exports = new Rollup(lib, {
  rollup: {
    input: 'lib/index.js',
    output: [
      {
        file: 'my-lib.amd.js'
        format: 'amd',
      },
      {
        file: 'my-lib.iife.js'
        format: 'iife',
      }
    ]
  }
})
```
