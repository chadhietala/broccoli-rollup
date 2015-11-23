var CachingWriter = require('broccoli-caching-writer');
var rollup = require('rollup').rollup;
var path = require('path');
var fs = require('fs');

module.exports = Rollup;
Rollup.prototype = Object.create(CachingWriter.prototype);
Rollup.prototype.constructor = Rollup;

function Rollup(inputNode, options) {
  if (!(this instanceof Rollup)) {
    return new Rollup(inputNode, options);
  }
  
  if (!options || !options.rollup.dest || !options.inputFiles) {
    throw new Error('inputFiles and rollup.dest options are required');
  }
  
  CachingWriter.call(this, [inputNode], {
    inputFiles: options.inputFiles,
    annotation: options.annotation
  });
  
  this.inputFiles = options.inputFiles;
  this.rollupOptions = options.rollup;
  this.rollupEntry = null;
  this.rollupDest = null;
}

Rollup.prototype.build = function() {
  if (!this.rollupEntry || !this.rollupDest) {
    this.rollupEntry = path.join(this.inputPaths[0], this.rollupOptions.entry);
    this.rollupDest =  path.join(this.outputPath, this.rollupOptions.dest);
  }
  
  this.rollupOptions.entry = this.rollupEntry 
  this.rollupOptions.dest = this.rollupDest;

  return rollup(this.rollupOptions).then(function(bundle) {
    return bundle.write(this.rollupOptions);
  }.bind(this)).catch(function(err) {
    throw new Error(err);
  });
};