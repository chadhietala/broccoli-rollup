import FSTree from 'fs-tree-diff';
import md5Hex from 'md5-hex';
import fs from 'fs-extra';

export default class OutputPatcher {
  constructor(outputPath, logger) {
    this.outputPath = outputPath;
    this.entries = [];
    this.contents = Object.create(null);
    this.lastTree = FSTree.fromEntries([]);
    this.isUnchanged = (entryA, entryB) => {
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
  }

  // relativePath should be without leading '/' and use forward slashes
  add(relativePath, content) {
    this.entries.push(new Entry(relativePath, md5Hex(content)));
    this.contents[relativePath] = content;
  }

  patch() {
    try {
      this.lastTree = this._patch();
    } catch (e) {
      // next build just output everything
      this.lastTree = FSTree.fromEntries([]);
      throw e;
    } finally {
      this.entries = [];
      this.contents = Object.create(null);
    }
  }

  _patch() {
    let { entries, lastTree, isUnchanged, outputPath, contents } = this;
    let nextTree = FSTree.fromEntries(entries, {
      sortAndExpand: true
    });
    let patch = lastTree.calculatePatch(nextTree, isUnchanged);
    patch.forEach(([op, path, entry]) => {
      switch (op) {
        case 'mkdir':
          fs.mkdirpSync(outputPath + '/' + path);
          break;
        case 'rmdir':
          fs.rmdirSync(outputPath + '/' + path);
          break;
        case 'unlink':
          fs.unlinkSync(outputPath + '/' + path);
          break;
        case 'create':
        case 'change':
          fs.writeFileSync(outputPath + '/' + path, contents[path]);
          break;
      }
    });
    return nextTree;
  }
}

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
