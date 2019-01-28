import { mkdirSync } from 'fs';
import * as path from 'path';
import { InputOptions, OutputOptions } from 'rollup';
import Plugin from './lib/plugin';
import RollupHelper from './lib/rollup-helper';

// tslint:disable:no-var-requires
const symlinkOrCopySync: (
  src: string,
  dst: string,
) => void = require('symlink-or-copy').sync;
const nodeModulesPath: (cwd: string) => string = require('node-modules-path');
// tslint:enable:no-var-requires
export = class Rollup extends Plugin {
  public rollupOptions: InputOptions & {
    output: OutputOptions | OutputOptions[];
  };
  public cache: boolean;
  public nodeModulesPath: string;

  private _rollupHelper: RollupHelper | undefined;

  constructor(
    node: any,
    options: {
      annotation?: string;
      name?: string;
      rollup: InputOptions & {
        output: OutputOptions | OutputOptions[];
      };
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
    this.cache = options.cache === undefined ? true : options.cache;

    this._rollupHelper = undefined;

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
    let rollupHelper = this._rollupHelper;
    if (rollupHelper === undefined) {
      symlinkOrCopySync(this.nodeModulesPath, `${this.cachePath}/node_modules`);
      const buildPath = `${this.cachePath}/build`;
      mkdirSync(buildPath);
      rollupHelper = this._rollupHelper = new RollupHelper(
        this.inputPaths[0],
        buildPath,
        this.outputPath,
        this.rollupOptions,
        normalizeArray(this.rollupOptions.output),
        this.cache,
      );
    }

    const originalWorkingDir = process.cwd();
    try {
      process.chdir(rollupHelper.buildPath);
      await rollupHelper.build();
    } finally {
      process.chdir(originalWorkingDir);
    }
  }
};

function normalizeArray<T>(arr: T | T[]) {
  return Array.isArray(arr) ? arr : [arr];
}
