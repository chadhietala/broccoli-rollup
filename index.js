var CachingWriter = require('broccoli-caching-writer');
var rollup = require('rollup').rollup;
var path = require('path');
var fs = require('fs');

// Keys to remove from options for main call to Rollup
var bundleOnlyKeys = ['sourceMapFile'];

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

  var rollupOptions = options.rollup;

  // Pull out config for sourceMapFile (sets path/name of source map top-level)
  this.rollupSourceMapFile = rollupOptions.sourceMapFile || rollupOptions.moduleName || rollupOptions.dest;

  // Remove keys which Rollup main call won't accept
  bundleOnlyKeys.forEach(function(key) {
    delete rollupOptions[key];
  });

  this.rollupOptions = rollupOptions;
  this.rollupBundleOptions = Object.create(this.rollupOptions);

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

  // Set sourceMapFile relative to source directory to avoid temporary directory path in source map
  this.rollupBundleOptions.sourceMapFile = path.join(this.inputPaths[0], this.rollupSourceMapFile);

  return rollup(this.rollupOptions).then(function(bundle) {
    return bundle.write(this.rollupBundleOptions);
  }.bind(this)).catch(function(err) {
    throw new Error(err);
  });
};