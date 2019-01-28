import { InputOptions, OutputOptions, rollup, RollupCache } from 'rollup';
import { heimdall } from './heimdall';
import { ITree, treeFromEntries, treeFromPath } from './tree-diff';
import { syncFiles } from './utils';

export default class RollupHelper {
  private inputDigests = new Map<string, string>();
  private outputDigests = new Map<string, string>();
  private cache: RollupCache | undefined;

  constructor(
    public inputPath: string,
    public buildPath: string,
    public outputPath: string,
    public inputOptions: InputOptions,
    public outputOptions: OutputOptions[],
    public shouldCache: boolean,
  ) {}

  public async build() {
    const inputTree = this.syncInput();

    // no changes
    if (inputTree === undefined) {
      return;
    }

    await this.rollup();

    const outputTree = this.calculateOutputTree(inputTree);

    this.syncOutput(outputTree);
  }

  public async rollup() {
    const token = heimdall.start('rollup');
    const build = await rollup(this.inputOptions);

    if (this.shouldCache) {
      this.cache = build.cache;
    }

    for (const outputOptions of this.outputOptions) {
      await build.write(outputOptions);
    }
    token.stop();
  }

  public calculateOutputTree(inputTree: ITree) {
    const token = heimdall.start('calculateOutputTree');

    const buildDiff = inputTree.calculatePatch(treeFromPath(this.buildPath));
    const outputEntries = buildDiff
      .filter(change => change[0] === 'create')
      .map(change => change[2]);
    const outputTree = treeFromEntries(outputEntries, {
      sortAndExpand: true,
    });

    token.stop();

    return outputTree;
  }

  public syncOutput(outputTree: ITree) {
    const token = heimdall.start('syncOutput');

    const outputPath = this.outputPath;
    const outputChanges = treeFromPath(outputPath).calculatePatch(outputTree);
    syncFiles(this.buildPath, outputPath, outputChanges, this.outputDigests);

    token.stop();
  }

  public syncInput() {
    const token = heimdall.start('syncInput');

    const inputPath = this.inputPath;
    const buildPath = this.buildPath;

    const inputTree = treeFromPath(inputPath);
    const buildTree = treeFromPath(buildPath);

    const inputChanges = buildTree.calculatePatch(inputTree);

    if (this.cache !== undefined && inputChanges.length === 0) {
      return;
    }

    syncFiles(inputPath, buildPath, inputChanges, this.inputDigests);

    token.stop();
    return inputTree;
  }
}
