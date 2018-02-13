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
import { InputOptions, OutputChunk, OutputOptions } from 'rollup';
import { instrument, logger } from './lib/heimdall';
import OutputPatcher from './lib/output-patcher';
import Plugin from './lib/plugin';
import resolver from './lib/resolver';
import { IGeneratedResult, IRollupOptions } from './lib/rollup';
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
  public rollupOptions: IRollupOptions;
  public cache: boolean;
  public linkedModules: boolean;
  public nodeModulesPath: string;

  private _lastChunk: OutputChunk | null;
  private lastTree: ITree;
  private _output: OutputPatcher | null;

  constructor(node: any, options: {
    annotation?: string;
    name?: string;
    rollup: IRollupOptions;
    cache?: boolean;
    nodeModulesPath?: string;
  }) {
    super([node], {
      annotation: options.annotation,
      name: options.name,
      persistentOutput: true,
    });
    this.rollupOptions = options.rollup;
    this._lastChunk = null;
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
    if (this._lastChunk && patches.length === 0) { return; }

    const options = this._loadOptions();
    options.input = this._mapInput(options.input);
    return instrument('rollup', () => {
      return require('rollup').rollup(options)
        .then((chunk: OutputChunk) => {
          if (this.cache) {
            this._lastChunk = chunk;
          }
          return this._buildTargets(chunk, options);
        });
    });
  }

  private _mapInput(input: string | string[]) {
    if (Array.isArray(input)) {
      return input.map((entry) => `${this.cachePath}/${entry}`);
    }

    return `${this.cachePath}/${input}`;
  }

  private _loadOptions(): IRollupOptions {
    // TODO: support rollup config files
    const options = Object.assign({
      cache: this._lastChunk,
    }, this.rollupOptions);
    return options;
  }

  private _targetsFor(options: IRollupOptions): OutputOptions[] {
    return Array.isArray(options.output) ? options.output : [options.output];
  }

  private async _buildTargets(chunk: OutputChunk, options: IRollupOptions) {
    const output = this._getOutput();

    const targets = this._targetsFor(options);
    for (let i = 0; i < targets.length; i++) {
      await this._buildTarget(chunk, targets[i], output);
    }

    output.patch();
  }

  private async _buildTarget(chunk: OutputChunk, options: OutputOptions, output: OutputPatcher) {
    let generateOptions;

    if (this.rollupOptions.experimentalCodeSplitting) {
      const results = await chunk.generate(Object.assign({}, options, {
        sourcemap: !!options.sourcemap,
      })) as any;

      Object.keys(results).forEach((file) => {
        const fileName = resolver.moduleResolve(file, options.dir! + '/');
        this._writeFile(fileName, options.sourcemap!, results[file] as IGeneratedResult, output);
      });

    } else {
      generateOptions = this._generateSourceMapOptions(options);
      const result = await chunk.generate(generateOptions);
      this._writeFile(options.file!, options.sourcemap!, result, output);
    }
  }

  private _generateSourceMapOptions(options: OutputOptions): OutputOptions {
    const sourcemap = options.sourcemap;
    const file = options.file;
    const sourcemapFile = options.sourcemapFile;
    if (sourcemapFile) {
      options.sourcemapFile = this.cachePath + '/' + sourcemapFile;
    } else {
      options.sourcemapFile = this.cachePath + '/' + file;
    }

    return Object.assign({}, options, {
      sourcemap: !!sourcemap,
    });
  }

  private _writeFile(filePath: string, sourcemap: boolean | 'inline', result: IGeneratedResult, output: OutputPatcher) {
    let { code } = result;
    const { map } = result;
    if (sourcemap && map !== null) {
      let url;
      if (sourcemap === 'inline') {
        url = map.toUrl();
      } else {
        url = this._addSourceMap(map, filePath, output);
      }
      code += '//# sourceMap';
      code += `pingURL=${url}`;
    }

    output.add(filePath, code);
  }

  private _addSourceMap(map: any, relativePath: string, output: OutputPatcher) {
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
