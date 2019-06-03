import BroccoliPlugin = require('broccoli-plugin');
import { mkdirSync } from 'fs';
import * as path from 'path';
import { sync as symlinkOrCopy } from 'symlink-or-copy';
import RollupHelper from './rollup-helper';
import { nodeModulesPath, normalizeArray } from './utils';

export type InputOptions = import('rollup').InputOptions;
export type OutputOptions = import('rollup').OutputOptions;

export interface BroccoliRollupOptions {
  annotation?: string;
  name?: string;
  rollup: RollupOptions;
  cache?: boolean;
  nodeModulesPath?: string;
}

export type RollupOptions = InputOptions & {
  output: OutputOptions | OutputOptions[];
};

export default function rollup(node: any, options: BroccoliRollupOptions) {
  return new BroccoliRollup(node, options);
}

export class BroccoliRollup extends BroccoliPlugin {
  public rollupOptions: RollupOptions;
  public cache: boolean;
  public nodeModulesPath: string;

  private _rollupHelper: RollupHelper | undefined;

  constructor(node: any, options: BroccoliRollupOptions) {
    super([node], {
      annotation: options.annotation,
      name: options.name,
      persistentOutput: true,
    });
    this.rollupOptions = options.rollup;
    this.cache =
      options.rollup.cache === false ? false : options.cache !== false;

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
      if (this.nodeModulesPath) {
        symlinkOrCopy(this.nodeModulesPath, `${this.cachePath}/node_modules`);
      }
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

    await rollupHelper.build();
  }
}
