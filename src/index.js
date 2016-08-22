import fs from 'fs-extra';
import Plugin from 'broccoli-plugin';
import md5Hex from 'md5-hex';
import path from 'path';
import { default as _logger } from 'heimdalljs-logger';
import heimdall from 'heimdalljs';

const logger = _logger('broccoli-rollup');

export default class Rollup extends Plugin {
  constructor(node, options = {}) {
    super([node], options);

    this._persistentOutput = true;
    this.rollupOptions  = options.rollup || {};

    this._lastBundle = null;

    // TODO: maybe extract
    this._fileToChecksumMap = Object.create(null);
  }

  writeFileIfContentChanged(fullPath, content) {
    let previous = this._fileToChecksumMap[fullPath];
    let next = md5Hex(content);

    if (previous === next) {
      logger.debug('cache hit, no change to: %s', fullPath);
      // hit
    } else {
      logger.debug('cache miss, write to: %s', fullPath);
      fs.writeFileSync(fullPath, content);
      this._fileToChecksumMap[fullPath] = next; // update map
    }
  }

  _loadOptions() {
    // TODO: support rollup config files
    let options = this.rollupOptions;
    options.cache = this._lastBundle;

    if (options.targets) {
      return options;
    } else {
      options.targets = [
        {
          format: options.format,
          dest: options.dest,
          moduleName: options.moduleName
        }
      ];
      delete options.format;
      delete options.dest;
      delete options.moduleName;
      return options;
    }
  }

  build() {
    const options = this._loadOptions();

    if (options.entry && options.entry.charAt(0) !== '/') {
      // if entry is not absolute, make it absolute relative to the inputPath
      options.entry = this.inputPaths[0] + '/' + options.entry;
    }

    return heimdall.node('rollup', () => {
      return require('rollup').rollup(options)
        .then(bundle => {
          this._lastBundle = bundle;

          options.targets.forEach(target => {
            let dest = target.dest;
            let format = target.format;
            let output = bundle.generate(target).code;
            let outputPath = this.outputPath + '/'+ dest;

            fs.mkdirpSync(path.dirname(outputPath)); // needs dependency stuff :P

            this.writeFileIfContentChanged(outputPath, output);
          });
        });
    });
  }
}
