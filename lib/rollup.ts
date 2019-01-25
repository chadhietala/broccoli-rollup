import { InputOptions, OutputOptions } from 'rollup';
export interface IRollupOptions extends InputOptions {
  output: OutputOptions[] | OutputOptions;
}
