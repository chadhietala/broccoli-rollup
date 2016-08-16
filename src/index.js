import fs from 'fs-extra';
import Plugin from 'broccoli-plugin';
import md5Hex from 'md5-hex';
import path from 'path';
import { default as _debug } from 'debug';

const debug = _debug('broccoli-rollup');

export default class Rollup extends Plugin {
  constructor(node, options = {}) {
    super([node], options);

    this._persistentOutput = true;
    this.rollupOptions  = options.rollup;;
    this.configPath = options.configPath;

    this._lastBundle = null;
    this._fileToChecksumMap = Object.create(null);
  }

  writeFileIfContentChanged(fullPath, content) {
    let previous = this._fileToChecksumMap[fullPath];
    let next = md5Hex(content);

    if (previous === next) {
      debug('cache hit, no change to: %s', fullPath);
      // hit
    } else {
      debug('cache miss, write to: %s', fullPath);
      fs.writeFileSync(fullPath, content);
      this._fileToChecksumMap[fullPath] = next; // update map
    }
  }

  _loadOptions() {
    let options;
    // TODO:
    if (this.configPath) {
      // TODO: quick solution :P
      // TODO: restore ES6 support to config
      delete require.cache[this.configPath];
      options = require(this.configPath);
      options.cache = this._lastBundle;
    } else {
      // if no configPath was specified, assume this.rollupOptions in its
      // entirely was the options.
      // TODO: support annotations
      options = this.rollupOptions;
    }

    if (options.targets) {
      return options;
    } else {
      options.targets = [
        { dest: options.dest }
      ];
      return options;
    }
  }

  build() {
    const options = this._loadOptions();

    if (options.entry && options.entry.charAt(0) !== '/') {
      // if entry is not absolute, make it absolute relative to the inputPath
      options.entry = this.inputPaths[0] + '/' + options.entry;
    }

    return require('rollup').rollup(options)
      .then(bundle => {
        this._lastBundle = bundle;

        options.targets.forEach(target => {
          let dest = target.dest;
          let format = target.format;

          let output = bundle.generate({
            format,
            moduleName: options.moduleName
          }).code;

          let outputPath = this.outputPath + '/'+ dest;
          fs.mkdirpSync(path.dirname(outputPath)); // needs dependency stuff :P

          this.writeFileIfContentChanged(outputPath, output);
        });
      });
  }
}
