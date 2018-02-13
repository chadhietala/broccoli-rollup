import * as crypto from 'crypto';
import * as fs from 'fs';
import { IEntry, ITree, treeFromEntries, treeFromPath } from './tree-diff';

export interface ILogger {
  debug(...args: any[]): void;
}

export default class OutputPatcher {
  private entries: IEntry[] = [];

  private contents: {
    [path: string]: string;
  } = Object.create(null);

  private checksums = new WeakMap<Entry, string>();

  private lastTree = treeFromEntries([]);

  constructor(private outputPath: string, private logger: ILogger) {
    this.isUnchanged = this.isUnchanged.bind(this);
  }

  // relativePath should be without leading '/' and use forward slashes
  public add(relativePath: string, content: string) {
    const entry = new Entry(relativePath);
    this.entries.push(entry);
    const checksum = crypto.createHash('md5').update(content).digest('hex');
    this.checksums.set(entry, checksum);
    this.contents[relativePath] = content;
  }

  public patch() {
    try {
      this.lastTree = this._patch();
    } catch (e) {
      this.lastTree = treeFromPath(this.outputPath);
      throw e;
    } finally {
      this.entries = [];
      this.contents = Object.create(null);
    }
  }

  private isUnchanged(a: IEntry, b: IEntry): boolean {
    if (a.isDirectory() && b.isDirectory()) {
      return true;
    }
    const checksums = this.checksums;
    if (a.mode === b.mode && checksums.get(a) === checksums.get(b)) {
      this.logger.debug('cache hit, no change to: %s', a.relativePath);
      return true;
    }
    this.logger.debug('cache miss, write to: %s', a.relativePath);
    return false;
  }

  private _patch() {
    const entries = this.entries;
    const lastTree = this.lastTree;
    const isUnchanged = this.isUnchanged;
    const outputPath = this.outputPath;
    const contents = this.contents;

    const nextTree = treeFromEntries(entries, { sortAndExpand: true });
    const patch = lastTree.calculatePatch(nextTree, isUnchanged);
    patch.forEach((change) => {
      const op = change[0];
      const path = change[1];
      switch (op) {
        case 'mkdir':
          fs.mkdirSync(outputPath + '/' + path);
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

// tslint:disable-next-line:max-classes-per-file
class Entry implements IEntry {
  public relativePath: string;
  public basePath: string = '';
  public fullPath: string = '';
  public mode: number;
  public size: number = -1;
  public mtime: Date | undefined;

  constructor(relativePath: string) {
    this.relativePath = relativePath;
    this.mode = 0;
  }

  public isDirectory() {
    return false;
  }
}
