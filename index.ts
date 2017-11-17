import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Bundle, ConfigFileOptions, GenerateOptions, SourceMap, WriteOptions } from 'rollup';
import { instrument, logger } from './lib/heimdall';
import OutputPatcher from './lib/output-patcher';
import Plugin from './lib/plugin';
import { IEntry, ITree, treeFromEntries, treeFromPath } from './lib/tree-diff';

// tslint:disable-next-line:no-var-requires
const symlinkOrCopySync: (src: string, dst: string) => void = require('symlink-or-copy').sync;
// tslint:disable-next-line:no-var-requires
const nodeModulesPath: (cwd: string) => string = require('node-modules-path');

const deref = typeof copyFileSync === 'function' ?
(srcPath: string, destPath: string) => {
  try {
    unlinkSync(destPath);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  copyFileSync(srcPath, destPath, fsConstants.COPYFILE_EXCL);
} :
(srcPath: string, destPath: string) => {
  const content = readFileSync(srcPath);
  writeFileSync(destPath, content);
};

export = class Rollup extends Plugin {
  public rollupOptions: ConfigFileOptions;
  public cache: boolean;
  public linkedModules: boolean;
  public nodeModulesPath: string;

  private _lastBundle: Bundle | null;
  private lastTree: ITree;
  private _output: OutputPatcher | null;

  constructor(node: any, options: {
    annotation?: string;
    name?: string;
    rollup: ConfigFileOptions;
    cache?: boolean;
    nodeModulesPath?: string;
  }) {
    super([node], {
      annotation: options.annotation,
      name: options.name,
      persistentOutput: true,
    });
    this.rollupOptions = options.rollup;
    this._lastBundle = null;
    this._output = null;
    this.lastTree = treeFromEntries([]);
    this.linkedModules = false;
    this.cache = options.cache === undefined ? true : options.cache;

    if (options.nodeModulesPath !== undefined && !path.isAbsolute(options.nodeModulesPath)) {
      throw new Error(`nodeModulesPath must be fully qualified and you passed a relative path`);
    }

    this.nodeModulesPath = options.nodeModulesPath || nodeModulesPath(process.cwd());
  }

  public build() {
    const lastTree = this.lastTree;
    const linkedModules = this.linkedModules;

    if (!linkedModules) {
      symlinkOrCopySync(this.nodeModulesPath, `${this.cachePath}/node_modules`);
      this.linkedModules = true;
    }

    const newTree = this.lastTree = treeFromPath(this.inputPaths[0]);
    const patches = lastTree.calculatePatch(newTree);

    patches.forEach((change) => {
      const op = change[0];
      const relativePath = change[1];
      switch (op) {
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

    // If this a noop post initial build, just bail out
    if (this._lastBundle && patches.length === 0) { return; }

    const options = this._loadOptions();
    options.input = this.cachePath + '/' + options.input;
    return instrument('rollup', () => {
      return require('rollup').rollup(options)
        .then((bundle: Bundle) => {
          if (this.cache) {
            this._lastBundle = bundle;
          }
          return this._buildTargets(bundle, options);
        });
    });
  }

  private _loadOptions(): ConfigFileOptions {
    // TODO: support rollup config files
    const options = Object.assign({
      cache: this._lastBundle,
    }, this.rollupOptions);
    return options;
  }

  private _targetsFor(options: ConfigFileOptions): WriteOptions[] {
    return Array.isArray(options.output) ? options.output : [options.output];
  }

  private async _buildTargets(bundle: Bundle, options: ConfigFileOptions) {
    const output = this._getOutput();

    const targets = this._targetsFor(options);
    for (let i = 0; i < targets.length; i++) {
      await this._buildTarget(bundle, targets[i], output);
    }

    output.patch();
  }

  private async _buildTarget(bundle: Bundle, options: WriteOptions, output: OutputPatcher) {
    // const { dest, sourceMap, sourceMapFile } = options;
    const file = options.file;
    const sourcemap = options.sourcemap;
    const sourcemapFile = options.sourcemapFile;

    // ensures "file" entry and relative "sources" entries
    // are correct in the source map.
    if (sourcemapFile) {
      options.sourcemapFile = this.cachePath + '/' + sourcemapFile;
    } else {
      options.sourcemapFile = this.cachePath + '/' + file;
    }

    const result = await bundle.generate(Object.assign({}, options, {
      sourcemap: !!sourcemap,
    }));

    let code = result.code;
    const map = result.map;

    if (sourcemap && map !== null) {
      let url;
      if (sourcemap === 'inline') {
        url = map.toUrl();
      } else {
        url = this._addSourceMap(map, file, output);
      }
      code += '//# sourceMap';
      code += `pingURL=${url}`;
    }
    output.add(file, code);
  }

  private _addSourceMap(map: SourceMap, relativePath: string, output: OutputPatcher) {
    const url = path.basename(relativePath) + '.map';
    output.add(relativePath + '.map', map.toString());
    return url;
  }

  private _getOutput() {
    let output = this._output;
    if (!output) {
      output = this._output = new OutputPatcher(this.outputPath, logger);
    }
    return output;
  }
};
