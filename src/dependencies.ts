import { RollupBuild } from 'rollup';
import { createFilter } from 'rollup-pluginutils';
import { Operation, realpath } from './utils';

export default class Dependencies {
  private buildPath: string;
  private inputDependencies = new Set<string>();
  private filter = createFilter();

  constructor(buildPath: string) {
    this.buildPath = realpath(buildPath);
  }

  public add(rollupBuild: RollupBuild) {
    const watchedFiles = rollupBuild.watchFiles;

    const buildPath = this.buildPath;
    const relativeStart = buildPath.length + 1;
    const inputDependencies = new Set<string>();

    for (const watchedFile of watchedFiles) {
      if (!this.filter(watchedFile)) { continue; }

      const normalized = realpath(watchedFile);
      if (normalized.startsWith(buildPath)) {
        inputDependencies.add(normalized.slice(relativeStart));
      }
    }

    this.inputDependencies = inputDependencies;
  }

  public shouldBuild(inputChanges: Operation[]) {
    // is undefined on first build
    const inputDependencies = this.inputDependencies;

    let shouldBuild = false;
    for (const change of inputChanges) {
      const inputPath = change[1];
      if (inputDependencies.has(inputPath)) {
        shouldBuild = true;
        break;
      }
    }
    return shouldBuild;
  }
}
