const resolver: {
  moduleResolve(file: string, dir: string): string;
  // tslint:disable-next-line:no-var-requires
} = require('amd-name-resolver');

export default resolver;
