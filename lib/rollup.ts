import { SourceMap } from 'magic-string';
import { InputOptions, OutputOptions } from 'rollup';
export interface IRollupOptions extends InputOptions {
  output: OutputOptions[] | OutputOptions;
}

export interface IGeneratedResult {
  code: string;
  map: SourceMap;
}
