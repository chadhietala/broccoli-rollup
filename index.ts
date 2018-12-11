import {
  constants as fsConstants,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import * as path from 'path';
import {
  InputOption,
  OutputOptions,
  RollupBuild,
  RollupSingleFileBuild,
} from 'rollup';
import { instrument, logger } from './lib/heimdall';
import OutputPatcher from './lib/output-patcher';
import Plugin from './lib/plugin';
import resolver from './lib/resolver';
import {
  IGeneratedResult,
  IRollupOptions,
  isSingleFileBuild,
  RollupFunc,
} from './lib/rollup';
import { ITree, treeFromEntries, treeFromPath } from './lib/tree-diff';

// tslint:disable:no-var-requires
const symlinkOrCopySync: (
  src: string,
  dst: string,
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

export = class Rollup extends Plugin {
  public rollupOptions: IRollupOptions;
  public cache: boolean;
  public innerCachePath = '';
  public nodeModulesPath: string;

  private _lastChunk: RollupBuild | RollupSingleFileBuild | null;
  private lastTree: ITree;
  private _output: OutputPatcher | null;

  constructor(
    node: any,
    options: {
      annotation?: string;
      name?: string;
      rollup: IRollupOptions;
      cache?: boolean;
      nodeModulesPath?: string;
    },
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
        `nodeModulesPath must be fully qualified and you passed a relative path`,
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
            `${this.innerCachePath}/${relativePath}`,
          );
          break;
        case 'change':
          deref(
            `${this.inputPaths[0]}/${relativePath}`,
            `${this.innerCachePath}/${relativePath}`,
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
    return instrument('rollup', () => {
      const rollup: RollupFunc = require('rollup').rollup;
      return rollup(options)
        .then((chunk: RollupSingleFileBuild | RollupBuild) => {
          if (this.cache) {
            this._lastChunk = chunk;
          }
          return this._buildTargets(chunk, options);
        });
    });
  }

  private _mapInput(input: InputOption) {
    if (Array.isArray(input)) {
      return input.map(entry => `${this.innerCachePath}/${entry}`);
    }

    return `${this.innerCachePath}/${input}`;
  }

  private _loadOptions(): IRollupOptions {
    // TODO: support rollup config files
    const options = Object.assign(
      {
        cache: this._lastChunk,
      },
      this.rollupOptions,
    );
    return options;
  }

  private async _buildTargets(chunk: RollupBuild | RollupSingleFileBuild, options: IRollupOptions) {
    const output = this._getOutput();
    await this._buildTarget(chunk, output, options.output);
    output.patch();
  }

  private async _buildTarget(
    chunk: RollupBuild | RollupSingleFileBuild,
    output: OutputPatcher,
    options: OutputOptions = {},
  ) {
    if (isSingleFileBuild(chunk)) {
      const generateOptions = this._generateSourceMapOptions(options);
      const result = await chunk.generate(generateOptions);
      this._writeFile(options.file!, options.sourcemap!, result, output);
    } else {
      const results = (await chunk.generate(
        Object.assign({}, options, {
          sourcemap: !!options.sourcemap,
        }),
      ));
      Object.keys(results.output).forEach(file => {
        const fileName = resolver.moduleResolve(file, options.dir! + '/');
        this._writeFile(
          fileName,
          options.sourcemap!,
          results.output[file] as IGeneratedResult,
          output,
        );
      });
    }
  }

  private _generateSourceMapOptions(options: OutputOptions = {}): OutputOptions {
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
    result: IGeneratedResult,
    output: OutputPatcher,
  ) {
    let code = result.code;
    const map = result.map;
    if (sourcemap && map !== null) {
      let url;
      if (sourcemap === 'inline' && map) {
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
