var CachingWriter = require('broccoli-caching-writer');
var rollup = require('rollup').rollup;
var path = require('path');

module.exports = Rollup;
Rollup.prototype = Object.create(CachingWriter.prototype);
Rollup.prototype.constructor = Rollup;

function Rollup(inputNode, options) {
  if (!(this instanceof Rollup)) {
    return new Rollup(inputNode, options);
  }
  
  if (!options || !options.rollup.dest || !options.inputFiles) {
    throw new Error('inputFiles and rollupOptions.dest options ware required');
  }
  
  CachingWriter.call(this, [inputNode], {
    inputFiles: options.inputFiles,
    annotation: options.annotation
  });
  
  this.inputFiles = options.inputFiles;
  this.rollupOptions = options.rollup;
}

Rollup.prototype.build = function() {
  this.rollupOptions.entry = path.join(this.inputPaths[0], this.rollupOptions.entry);
  this.rollupOptions.dest = path.join(this.outputPath, this.rollupOptions.dest);
  console.log(this.rollupOptions);
  return rollup(this.rollupOptions).then(function(bundle) {
    return bundle.write(this.rollupOptions);
  }.bind(this));
};