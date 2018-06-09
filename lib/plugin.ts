// tslint:disable-next-line:interface-name
export interface Plugin {
  inputPaths: string[];
  outputPath: string;
  cachePath: string;
}

// tslint:disable-next-line:variable-name
const Plugin: {
  prototype: Plugin;
  new (
    inputs: any[],
    options?: {
      annotation?: string;
      name?: string;
      persistentOutput?: boolean;
    }
  ): Plugin;
  // tslint:disable-next-line:no-var-requires
} = require('broccoli-plugin');

export default Plugin;
