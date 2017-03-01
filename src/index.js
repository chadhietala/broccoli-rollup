import Plugin from 'broccoli-plugin';
import path from 'path';
import { default as _logger } from 'heimdalljs-logger';
import heimdall from 'heimdalljs';
import OutputPatcher from './output-patcher';
import FSTree from 'fs-tree-diff';
import {
  mkdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  readFileSync
} from 'fs';
import { tmpdir } from 'os';
import { entries } from 'walk-sync';
import { sync as symlinkOrCopySync } from 'symlink-or-copy';
import nodeModulesPath from 'node-modules-path';

// rollup requires this, so old version of node need it
import 'es6-map/implement';

const logger = _logger('broccoli-rollup');

function deref(srcPath, destPath) {
  let content = readFileSync(srcPath);
  writeFileSync(destPath, content);
}

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
    this.lastTree = FSTree.fromEntries([]);
    this.linkedModules = false;
  }

  build() {
    let { lastTree, linkedModules } = this;

    if (!linkedModules) {
      symlinkOrCopySync(nodeModulesPath(process.cwd()), `${this.cachePath}/node_modules`);
      this.linkedModules = true;
    }

    let newTree = this.lastTree = FSTree.fromEntries(entries(this.inputPaths[0]));
    let patches = lastTree.calculatePatch(newTree);

    patches.forEach(([op, relativePath]) => {
      switch(op) {
        case 'mkdir':
          mkdirSync(`${this.cachePath}/${relativePath}`);
          break;
        case 'unlink':
          unlinkSync(`${this.cachePath}/${relativePath}`);
          break;
        case 'rmdir':
          rmdirSync(`${this.cachePath}/${relativePath}`);
          break;
        case 'create':
          deref(`${this.inputPaths[0]}/${relativePath}`, `${this.cachePath}/${relativePath}`);
          break;
        case 'change':
          deref(`${this.inputPaths[0]}/${relativePath}`, `${this.cachePath}/${relativePath}`);
          break;
      }
    });

    let options = this._loadOptions();
    options.entry = this.cachePath + '/' + options.entry;
    return heimdall.node('rollup', () => {
      return require('rollup').rollup(options)
        .then(bundle => {
          this._lastBundle = bundle;
          this._buildTargets(bundle, options);
        });
    });
  }

  _loadOptions() {
    // TODO: support rollup config files
    let options = assign({}, this.rollupOptions);
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

  _buildTargets(bundle, options) {
    let output = this._getOutput();
    this._targetsFor(options).forEach(options => {
      this._buildTarget(bundle, options, output);
    });
    output.patch();
  }

  _buildTarget(bundle, options, output) {
    let { dest, sourceMap, sourceMapFile } = options;
    // ensures "file" entry and relative "sources" entries
    // are correct in the source map.
    if (sourceMapFile) {
      options.sourceMapFile = this.cachePath + '/' + sourceMapFile;
    } else {
      options.sourceMapFile = this.cachePath + '/' + dest;
    }

    let { code, map } = bundle.generate(options);
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
