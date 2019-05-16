import { createHash } from 'crypto';
import {
  closeSync,
  futimesSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'fs';
import FSTree = require('fs-tree-diff');
import { sep } from 'path';
import walkSync = require('walk-sync');

export type Entry = import('fs-tree-diff').Entry;
export type Operation = import('fs-tree-diff').Operation;
export type Tree = FSTree;

export function syncFiles(
  src: string,
  dest: string,
  changes: Operation[],
  digests?: Map<string, string>,
) {
  changes.forEach(change => {
    const op = change[0];
    const relativePath = change[1];
    const entry = change[2];
    switch (op) {
      case 'mkdir':
        mkdirSync(`${dest}/${relativePath}`);
        break;
      case 'unlink':
        unlinkSync(`${dest}/${relativePath}`);
        if (digests !== undefined) {
          digests.delete(relativePath);
        }
        break;
      case 'rmdir':
        rmdirSync(`${dest}/${relativePath}`);
        break;
      case 'create':
      case 'change':
        // mtime is a Date for FSEntry
        writeFile(src, dest, entry!, digests);
        break;
    }
  });
}

export function writeFile(
  src: string,
  dest: string,
  entry: Entry,
  digests?: Map<string, string>,
) {
  const relativePath = entry.relativePath;
  const content = readFileSync(`${src}/${relativePath}`);

  if (!shouldWrite(relativePath, content, digests)) {
    return;
  }

  const fd = openSync(`${dest}/${relativePath}`, 'w', entry.mode);
  try {
    let offset = 0;
    let length = content.byteLength;
    while (length > 0) {
      const written = writeSync(fd, content, offset, length);
      offset += written;
      length -= written;
    }

    const mtime = new Date(entry.mtime!);
    futimesSync(fd, mtime, mtime);
  } finally {
    closeSync(fd);
  }
}

export function realpath(path: string) {
  return normalize(realpathSync(path));
}

export function normalize(path: string) {
  if (sep !== '/') {
    return path.split(sep).join('/');
  }
  return path;
}

function shouldWrite(
  relativePath: string,
  content: Buffer,
  digests?: Map<string, string>,
) {
  if (digests === undefined) {
    return true;
  }
  const oldDigest = digests.get(relativePath);
  const newDigest =
    createHash('md5')
      .update(content)
      .digest('hex') + content.byteLength;
  digests.set(relativePath, newDigest);
  return newDigest !== oldDigest;
}

export function treeFromPath(path: string) {
  return treeFromEntries(walkSync.entries(path));
}

export function treeFromEntries(
  entries: Entry[],
  options?: {
    sortAndExpand?: boolean;
  },
): FSTree {
  const tree = new FSTree();
  tree.addEntries(entries, options);
  return tree;
}

export function normalizeArray<T>(arr: T | T[]) {
  return Array.isArray(arr) ? arr : [arr];
}

// tslint:disable:no-var-requires
export const nodeModulesPath: (
  cwd: string,
) => string = require('node-modules-path');
// tslint:enable:no-var-requires
