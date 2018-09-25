import { SourceMap } from 'magic-string';
import {
  InputOptions,
  OutputOptions,
  RollupBuild,
  RollupDirOptions,
  RollupFileOptions,
  RollupSingleFileBuild,
  OutputBundle,
  OutputChunk,
} from 'rollup';

export type IRollupOptions = RollupFileOptions | RollupDirOptions;

export interface IGeneratedResult {
  code: string;
  map?: SourceMap;
}

export type RollupFunc = (options: IRollupOptions) =>
  Promise<RollupSingleFileBuild | RollupBuild>;

export interface IMultiOutput {
  output: OutputBundle;
}

export function isSingleFileBuild(build: RollupBuild | RollupSingleFileBuild): build is RollupSingleFileBuild {
  return (build as RollupSingleFileBuild).imports !== undefined;
}

export function isSingleFileOptions(options: RollupFileOptions | RollupDirOptions): options is RollupDirOptions {
  return typeof (options as RollupFileOptions).input === 'string';
}
