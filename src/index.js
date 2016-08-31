import fs from 'fs';
import Plugin from 'broccoli-plugin';
import md5Hex from 'md5-hex';
import path from 'path';
import { default as _logger } from 'heimdalljs-logger';
import heimdall from 'heimdalljs';
import FSTree from 'fs-tree-diff';
import { Promise } from 'rsvp';

// rollup requires this, so old version of node need it
import 'es6-map/implement';

const logger = _logger('broccoli-rollup');

class Entry {
  constructor(dest, checksum) {
    this.relativePath = dest;
    this.mode = 0;
    this.checksum = checksum;
  }

  isDirectory() {
    return false;
  }
}

function isUnchanged(entryA, entryB) {
  if (entryA.isDirectory() && entryB.isDirectory()) {
    return true;
  }
  if (entryA.mode === entryB.mode && entryA.checksum === entryB.checksum) {
    logger.debug('cache hit, no change to: %s', entryA.relativePath);
    return true;
  }
  logger.debug('cache miss, write to: %s', entryA.relativePath);
  return false;
}

export default class Rollup extends Plugin {
  constructor(node, options = {}) {
    super([node], {
      name: options && options.name,
      annotation: options && options.annotation,
      persistentOutput: true
    });
    this.rollupOptions  = options.rollup || {};
    this._lastTree = FSTree.fromEntries([]);
    this._lastBundle = null;
    this._entries = null;
    this._contents = null;
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

  _patchOutput(nextTree) {
    let patch = this._lastTree.calculatePatch(nextTree, isUnchanged);
    this._lastTree = nextTree;
    patch.forEach(([op, path, entry]) => {
      switch (op) {
        case 'mkdir':
          fs.mkdirSync(this.outputPath + '/' + path);
          break;
        case 'rmdir':
          fs.rmdirSync(this.outputPath + '/' + path);
          break;
        case 'unlink':
          fs.unlinkSync(this.outputPath + '/' + path);
          break;
        case 'create':
        case 'change':
          fs.writeFileSync(this.outputPath + '/' + path, this._contents[path]);
          break;
      }
    });
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
    this._targetsFor(options).forEach(options => {
      this._buildTarget(bundle, options);
    });
    return FSTree.fromEntries(this._entries, {
      sortAndExpand: true
    });
  }

  _buildTarget(bundle, options) {
    let dest = options.dest;
    let { code, map } = bundle.generate(options);
    if (options.sourceMap) {
      let url = this._addSourceMap(map, options, dest);
      code += `\n//# sourceMappingURL=${url}\n`;
    }
    this._addEntry(dest, code);
  }

  _addSourceMap(map, options, relativePath) {
    if (options.sourceMap === 'inline') {
      return map.toUrl();
    }
    let url = path.basename(relativePath) + '.map';
    this._addEntry(relativePath + '.map', map.toString());
    return url;
  }

  _addEntry(relativePath, content) {
    this._entries.push(new Entry(relativePath, md5Hex(content)));
    this._contents[relativePath] = content;
  }

  _initEntries() {
    this._entries = [];
    this._contents = Object.create(null);
  }

  _clearEntries() {
    this._entries = null;
    this._contents = null;
  }

  build() {
    let options = this._loadOptions();
    return heimdall.node('rollup', () => {
      return this._withInputPath(() => {
        return require('rollup').rollup(options)
          .then(bundle => {
            this._lastBundle = bundle;
            this._initEntries();
            let nextTree = this._buildTargets(bundle, options);
            this._patchOutput(nextTree);
            this._clearEntries();
          });
      });
    });
  }
}

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
