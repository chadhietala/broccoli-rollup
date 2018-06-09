import { SourceMap } from 'magic-string';
import {
  InputOptions,
  OutputOptionsDir,
  OutputOptionsFile,
  RollupDirOptions,
  RollupFileOptions,
} from 'rollup';

export interface IGeneratedResult {
  code: string;
  map: SourceMap;
}
