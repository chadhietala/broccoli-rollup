# Usage
Broccoli-rollup is a simple wrapper around [Rollup](https://github.com/rollup/rollup). In the options object pass the rollup options.

```
var rollup = require('broccoli-rollup');
var lib = 'lib';

module.exports = rollup(lib, {
  inputFiles: ['**/*.js'],
  rollup: {
    entry: 'lib/index.js',
    dest: 'my-lib.js'
  }
})
```