var babel = require('broccoli-babel-transpiler');
var merge = require('broccoli-merge-trees');
var mv = require('broccoli-stew').mv;

module.exports = merge([
  mv(babel('tests'), 'tests'),
  babel('src'),
]);
