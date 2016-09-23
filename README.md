# Usage

Broccoli-rollup is a simple wrapper around [Rollup](https://github.com/rollup/rollup). In the options object pass the rollup options.

#### basic

```js
var Rollup = require('broccoli-rollup');
var lib = 'lib';

module.exports = new Rollup(lib, {
  rollup: {
    entry: 'lib/index.js',
    dest: 'my-lib.js'
  }
})
```

#### \w targets

```js
var Rollup = require('broccoli-rollup');
var lib = 'lib';

module.exports = new Rollup(lib, {
  rollup: {
    entry: 'lib/index.js',
    targets: [
      {
        dest: 'my-lib.amd.js'
        format: 'amd',
      },
      {
        dest: 'my-lib.iife.js'
        format: 'iife',
      }
    ]
  }
})
```
