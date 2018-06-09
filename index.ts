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
import {
  InputOption,
  InputOptions,
  OutputChunk,
  OutputOptions,
  OutputOptionsDir,
  OutputOptionsFile,
  rollup,
  RollupBuild,
  RollupDirOptions,
  RollupFileOptions,
  RollupSingleFileBuild,
} from 'rollup';
import { instrument, logger } from './lib/heimdall';
import OutputPatcher from './lib/output-patcher';
import Plugin from './lib/plugin';
import resolver from './lib/resolver';
import { IGeneratedResult } from './lib/rollup';
import { IEntry, ITree, treeFromEntries, treeFromPath } from './lib/tree-diff';

// tslint:disable:no-var-requires
const symlinkOrCopySync: (
  src: string,
  dst: string
) => void = require('symlink-or-copy').sync;
const nodeModulesPath: (cwd: string) => string = require('node-modules-path');
// tslint:enable:no-var-requires

const deref =
  typeof copyFileSync === 'function'
    ? (srcPath: string, destPath: string) => {
        try {
          unlinkSync(destPath);
        } catch (e) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
        }
        copyFileSync(srcPath, destPath, fsConstants.COPYFILE_EXCL);
      }
    : (srcPath: string, destPath: string) => {
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      };

function isRollupFileOptions(
  options: RollupFileOptions | RollupDirOptions
): options is RollupFileOptions {
  return typeof options.input === 'string';
}

export = class Rollup extends Plugin {
  public rollupOptions: RollupFileOptions | RollupDirOptions;
  public cache: boolean;
  public innerCachePath = '';
  public nodeModulesPath: string;

  private _lastChunk: OutputChunk | null;
  private lastTree: ITree;
  private _output: OutputPatcher | null;

  constructor(
    node: any,
    options: {
      annotation?: string;
      name?: string;
      rollup: RollupFileOptions | RollupDirOptions;
      cache?: boolean;
      nodeModulesPath?: string;
    }
  ) {
    super([node], {
      annotation: options.annotation,
      name: options.name,
      persistentOutput: true,
    });
    this.rollupOptions = options.rollup;
    this._lastChunk = null;
    this._output = null;
    this.lastTree = treeFromEntries([]);
    this.cache = options.cache === undefined ? true : options.cache;

    if (
      options.nodeModulesPath !== undefined &&
      !path.isAbsolute(options.nodeModulesPath)
    ) {
      throw new Error(
        `nodeModulesPath must be fully qualified and you passed a relative path`
      );
    }

    this.nodeModulesPath =
      options.nodeModulesPath || nodeModulesPath(process.cwd());
  }

  public build() {
    const lastTree = this.lastTree;

    if (!this.innerCachePath) {
      symlinkOrCopySync(this.nodeModulesPath, `${this.cachePath}/node_modules`);
      mkdirSync((this.innerCachePath = `${this.cachePath}/build`));
    }

    const newTree = (this.lastTree = treeFromPath(this.inputPaths[0]));
    const patches = lastTree.calculatePatch(newTree);

    patches.forEach(change => {
      const op = change[0];
      const relativePath = change[1];
      switch (op) {
        case 'mkdir':
          mkdirSync(`${this.innerCachePath}/${relativePath}`);
          break;
        case 'unlink':
          unlinkSync(`${this.innerCachePath}/${relativePath}`);
          break;
        case 'rmdir':
          rmdirSync(`${this.innerCachePath}/${relativePath}`);
          break;
        case 'create':
          deref(
            `${this.inputPaths[0]}/${relativePath}`,
            `${this.innerCachePath}/${relativePath}`
          );
          break;
        case 'change':
          deref(
            `${this.inputPaths[0]}/${relativePath}`,
            `${this.innerCachePath}/${relativePath}`
          );
          break;
      }
    });

    // If this a noop post initial build, just bail out
    if (this._lastChunk && patches.length === 0) {
      return;
    }

    const options = this._loadOptions();
    options.input = this._mapInput(options.input);
    return instrument('rollup', async () => {
      if (isRollupFileOptions(options)) {
        return rollup(options).then(build =>
          this._buildTargets(build, options)
        );
      }
      await rollup(options).then(async build => {
        const output = this._getOutput();

        const outputs = this._targetsFor(options);
        for (let i = 0; i < outputs.length; i++) {
          const result = await build.generate(outputs[i]);
          const bundle = result.output;
          const files = Object.keys(bundle);
          for (let j = 0; j < files.length; j++) {
            const file = files[j];
            output.add(file, (bundle[file] as any).code);
          }
        }

        output.patch();
      });
    });
  }

  private _mapInput(input: InputOption) {
    if (Array.isArray(input)) {
      return input.map(entry => `${this.innerCachePath}/${entry}`);
    } else if (typeof input === 'string') {
      return `${this.innerCachePath}/${input}`;
    }
    return Object.keys(input).map(entry => `${this.innerCachePath}/${entry}`);
  }

  private _loadOptions(): RollupFileOptions | RollupDirOptions {
    // TODO: support rollup config files
    const options = Object.assign(
      {
        cache: this._lastChunk,
      },
      this.rollupOptions
    );
    return options;
  }

  private _targetsFor<T extends RollupFileOptions | RollupDirOptions>(
    options: T
  ): T extends RollupFileOptions ? OutputOptionsFile[] : OutputOptionsDir[] {
    return Array.isArray(options.output)
      ? (options.output as any)
      : [options.output];
  }

  private async _buildTargets(
    build: RollupSingleFileBuild,
    options: RollupFileOptions
  ) {
    const output = this._getOutput();

    const targets = this._targetsFor(options);
    for (let i = 0; i < targets.length; i++) {
      await this._buildTarget(build, targets[i], output);
    }

    output.patch();
  }

  private async _buildTarget(
    build: RollupSingleFileBuild,
    options: OutputOptionsFile,
    output: OutputPatcher
  ) {
    const generateOptions = this._generateSourceMapOptions(options);
    const chunk = await build.generate(options);
    this._writeFile(options.file!, generateOptions.sourcemap, chunk, output);
  }

  private _generateSourceMapOptions(options: OutputOptionsFile): OutputOptions {
    const sourcemap = options.sourcemap;
    const file = options.file;
    const sourcemapFile = options.sourcemapFile;
    if (sourcemapFile) {
      options.sourcemapFile = this.innerCachePath + '/' + sourcemapFile;
    } else {
      options.sourcemapFile = this.innerCachePath + '/' + file;
    }

    return Object.assign({}, options, {
      sourcemap: !!sourcemap,
    });
  }

  private _writeFile(
    filePath: string,
    sourcemap: boolean | 'inline' | undefined,
    result: OutputChunk,
    output: OutputPatcher
  ) {
    let code = result.code;
    const map = result.map;
    if (sourcemap && map !== undefined) {
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
