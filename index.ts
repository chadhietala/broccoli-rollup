import { mkdirSync } from 'fs';
import * as path from 'path';
import { InputOption, InputOptions, OutputOptions } from 'rollup';
import Builder from './lib/builder';
import Plugin from './lib/plugin';

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

  private _builder: Builder | undefined;

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

    this._builder = undefined;

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
    let builder = this._builder;
    if (builder === undefined) {
      symlinkOrCopySync(this.nodeModulesPath, `${this.cachePath}/node_modules`);
      const buildPath = `${this.cachePath}/build`;
      mkdirSync(buildPath);
      builder = this._builder = new Builder(
        this.inputPaths[0],
        buildPath,
        this.outputPath,
        getInputOptions(this.rollupOptions, buildPath),
        getOutputOptions(this.rollupOptions.output, buildPath),
        this.cache,
      );
    }

    await builder.build();
  }
};

function getInputOptions(
  originalOptions: InputOptions,
  buildPath: string,
): InputOptions {
  const options = Object.assign({}, originalOptions);
  options.input = mapInput(originalOptions.input, buildPath);
  if (options.manualChunks !== undefined) {
    options.manualChunks = mapManualChunks(options.manualChunks, buildPath);
  }
  return options;
}

function getOutputOptions(
  outputOptions: OutputOptions[] | OutputOptions,
  buildPath: string,
): OutputOptions[] {
  if (!Array.isArray(outputOptions)) {
    outputOptions = [outputOptions];
  }
  return mapOutputOptions(outputOptions, buildPath);
}

function mapOutputOptions(
  originalOptions: OutputOptions[],
  buildPath: string,
): OutputOptions[] {
  return originalOptions.map(original => {
    const copy = Object.assign({}, original);
    if (copy.sourcemapFile) {
      copy.sourcemapFile = `${buildPath}/${copy.sourcemapFile}`;
    }
    if (copy.file) {
      copy.file = `${buildPath}/${copy.file}`;
    }
    if (copy.dir) {
      copy.dir = `${buildPath}/${copy.dir}`;
    }
    return copy;
  });
}

function mapManualChunks(
  manualChunks: InputOptions['manualChunks'],
  buildPath: string,
) {
  if (manualChunks === undefined) {
    return;
  }
  const copy = {} as Required<InputOptions>['manualChunks'];
  for (const key of Object.keys(manualChunks)) {
    copy[key] = manualChunks[key].map(entry => `${buildPath}/${entry}`);
  }
  return copy;
}

function mapInput(input: InputOption, buildPath: string) {
  if (Array.isArray(input)) {
    return input.map(entry => `${buildPath}/${entry}`);
  }
  if (typeof input === 'string') {
    return `${buildPath}/${input}`;
  }
  const mapping = {} as { [key: string]: string };
  for (const key of Object.keys(input)) {
    mapping[key] = `${buildPath}/${input[key]}`;
  }
  return mapping;
}
