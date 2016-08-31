import Plugin from 'broccoli-plugin';
import path from 'path';
import { default as _logger } from 'heimdalljs-logger';
import heimdall from 'heimdalljs';
import { Promise } from 'rsvp';
import OutputPatcher from './output-patcher';

// rollup requires this, so old version of node need it
import 'es6-map/implement';

const logger = _logger('broccoli-rollup');

export default class Rollup extends Plugin {
  constructor(node, options = {}) {
    super([node], {
      name: options && options.name,
      annotation: options && options.annotation,
      persistentOutput: true
    });
    this.rollupOptions  = options.rollup || {};
    this._lastBundle = null;
    this._output = null;
  }

  build() {
    let options = this._loadOptions();
    return heimdall.node('rollup', () => {
      return this._withInputPath(() => {
        return require('rollup').rollup(options)
          .then(bundle => {
            this._lastBundle = bundle;
            this._buildTargets(bundle, options);
          });
      });
    });
  }

  _loadOptions() {
    // TODO: support rollup config files
    let options = this.rollupOptions;
    options.cache = this._lastBundle;
    return options;
  }

  _targetsFor(options) {
    if (options.dest) {
      return [options];
    }
    if (options.targets) {
      return options.targets.map(target => assign({}, options, target));
    }
    throw new Error('missing targets or dest in options');
  }

  _withInputPath(cb) {
    const dir = process.cwd();
    return Promise.resolve().then(() => {
      process.chdir(this.inputPaths[0]);
    }).then(cb).finally(() => {
      process.chdir(dir);
    });
  }

  _buildTargets(bundle, options) {
    let output = this._getOutput();
    this._targetsFor(options).forEach(options => {
      this._buildTarget(bundle, options, output);
    });
    output.patch();
  }

  _buildTarget(bundle, options, output) {
    let { code, map } = bundle.generate(options);
    let { dest, sourceMap } = options;
    if (sourceMap) {
      let url;
      if (sourceMap === 'inline') {
        url = map.toUrl();
      } else {
        url = this._addSourceMap(map, dest, output);
      }
      code += '\n//# sourceMap';
      code += `pingURL=${url}\n`;
    }
    output.add(dest, code);
  }

  _addSourceMap(map, relativePath, output) {
    let url = path.basename(relativePath) + '.map';
    output.add(relativePath + '.map', map.toString());
    return url;
  }

  _getOutput() {
    let output = this._output;
    if (!output) {
      output = this._output = new OutputPatcher(this.outputPath, logger);
    }
    return output;
  }
}

// for old node
function assign(target) {
  for (let i = 1; i < arguments.length; i++) {
    let source = arguments[i];
    let keys = Object.keys(source);
    for (let j = 0; j < keys.length; j++) {
      let key = keys[j];
      target[key] = source[key];
    }
  }
  return target;
}
