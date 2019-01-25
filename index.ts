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
  InputOptions,
  OutputOptions,
  rollup,
  RollupBuild,
  RollupCache,
} from 'rollup';
import { heimdall, logger } from './lib/heimdall';
import OutputPatcher from './lib/output-patcher';
import Plugin from './lib/plugin';
import { IRollupOptions } from './lib/rollup';
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

  private _cache: RollupCache | undefined;
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
    this._cache = undefined;
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

  public async build() {
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
    if (this._cache && patches.length === 0) {
      return;
    }

    const options = this._loadOptions();
    options.input = this._mapInput(options.input);

    const token = heimdall.start('rollup');

    const build = await rollup(options as InputOptions);

    if (this.cache) {
      this._cache = build.cache;
    }

    await this._buildTargets(build, options);

    token.stop();
  }

  private _mapInput(input: InputOption) {
    if (Array.isArray(input)) {
      return input.map(entry => `${this.innerCachePath}/${entry}`);
    }
    if (typeof input === 'string') {
      return `${this.innerCachePath}/${input}`;
    }
    const mapping = {} as { [key: string]: string };
    for (const key of Object.keys(input)) {
      mapping[key] = `${this.innerCachePath}/${input[key]}`;
    }
    return mapping;
  }

  private _loadOptions(): IRollupOptions {
    // TODO: support rollup config files
    const options = Object.assign({}, this.rollupOptions);
    options.cache = this._cache;
    return options;
  }

  private _targetsFor(options: IRollupOptions): OutputOptions[] {
    return Array.isArray(options.output) ? options.output : [options.output];
  }

  private async _buildTargets(build: RollupBuild, options: IRollupOptions) {
    const output = this._getOutput();

    const targets = this._targetsFor(options);
    for (let i = 0; i < targets.length; i++) {
      await this._buildTarget(
        build,
        this._generateSourceMapOptions(targets[i]),
        output,
      );
    }

    output.patch();
  }

  private async _buildTarget(
    build: RollupBuild,
    options: OutputOptions,
    output: OutputPatcher,
  ) {
    let dir: string;
    if (options.dir) {
      dir = options.dir = `${this.innerCachePath}/${options.dir}`;
    } else if (options.file) {
      options.file = `${this.innerCachePath}/${options.file}`;
      dir = options.file.substr(0, options.file.lastIndexOf('/'));
    } else {
      throw new Error('output missing dir or file');
    }
    const rollupOuput = await build.generate(options);
    for (const chunk of rollupOuput.output) {
      const relativePath = this._relativePath(dir, chunk.fileName);
      if ('isAsset' in chunk && chunk.isAsset) {
        this._writeFile(
          relativePath,
          options.sourcemap,
          chunk.source.toString(),
          (chunk as any).map,
          output,
        );
      } else {
        this._writeFile(
          relativePath,
          options.sourcemap,
          chunk.code!,
          (chunk as any).map,
          output,
        );
      }
    }
  }

  private _generateSourceMapOptions(options: OutputOptions): OutputOptions {
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
    code: string,
    map: any,
    output: OutputPatcher,
  ) {
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

  private _relativePath(dir: string, file: string) {
    let relative = path.relative(this.innerCachePath, path.join(dir, file));
    if (path.sep !== '/') {
      relative = relative.split(path.sep).join('/');
    }
    return relative;
  }
};
