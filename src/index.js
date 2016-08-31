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
  constructor(dest, content) {
    this.relativePath = dest;
    this.content = content;
    this.mode = 0;
    this.size = content.length;
    this.checksum = md5Hex(content);
  }

  isDirectory() {
    return false;
  }
}

function isEqual(entryA, entryB) {
  if (entryA.isDirectory() && entryB.isDirectory()) {
    return true;
  }
  if (entryA.mode === entryB.mode &&
      entryA.size === entryB.size &&
      entryA.checksum === entryB.checksum) {
    logger.debug('cache hit, no change to: %s', entryA.relativePath);
    return true;
  }
  logger.debug('cache miss, write to: %s', entryA.relativePath);
  return false;
}

export default class Rollup extends Plugin {
  constructor(node, options = {}) {
    super([node], options);

    this._persistentOutput = true;
    this.rollupOptions  = options.rollup || {};

    this._lastBundle = null;

    this._lastTree = FSTree.fromEntries([]);
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
      return options.targets.map(target => Object.assign({}, options, target));
    }
    throw new Error('missing targets or dest in options');
  }

  _patchOutput(nextTree) {
    let patch = this._lastTree.calculatePatch(nextTree, isEqual);
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
          fs.writeFileSync(this.outputPath + '/' + path, entry.content);
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
    let entries = [];
    this._targetsFor(options).forEach(options => {
      let dest = options.dest;
      let { code, map } = bundle.generate(options);
      if ( options.sourceMap ) {
        let url;
        if (options.sourceMap === 'inline') {
          url = map.toUrl();
        } else {
          url = path.basename(dest) + '.map';
          entries.push(new Entry(dest + '.map', map.toString()));
        }
        code += `\n//# sourceMappingURL=${url}\n`;
      }
      entries.push(new Entry(dest, code));
    });
    return FSTree.fromEntries(entries, {
      sortAndExpand: true
    });
  }

  build() {
    const options = this._loadOptions();
    return heimdall.node('rollup', () => {
      return this._withInputPath(() => {
        return require('rollup').rollup(options)
          .then(bundle => {
            this._lastBundle = bundle;
            let nextTree = this._buildTargets(bundle, options);
            this._patchOutput(nextTree);
          });
      });
    });
  }
}
