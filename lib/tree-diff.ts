// tslint:disable:no-var-requires
const fsTreeDiff: IFsTreeDiff = require('fs-tree-diff');
const walkSync: IWalkSync = require('walk-sync');

interface IFsTreeDiff {
  fromEntries(entries: IEntry[], options?: {
    sortAndExpand?: boolean;
  }): ITree;
}

interface IWalkSync {
  entries(path: string): IEntry[];
}

export type ChangeOp = 'unlink' | 'create' | 'mkdir' | 'rmdir' | 'change';

export type Change = [ChangeOp, string, IEntry];

export interface ITree {
  calculatePatch(next: ITree, isUnchanged?: (a: IEntry, b: IEntry) => boolean): Change[];
}

export interface IEntry {
  relativePath: string;
  basePath: string;
  fullPath: string;
  mode: number;
  size: number;
  mtime: Date | undefined;
  isDirectory(): boolean;
}

export function treeFromEntries(entries: IEntry[], options?: {
  sortAndExpand?: boolean;
}): ITree {
  return fsTreeDiff.fromEntries(entries, options);
}

export function treeFromPath(path: string): ITree {
  return fsTreeDiff.fromEntries(walkSync.entries(path));
}
