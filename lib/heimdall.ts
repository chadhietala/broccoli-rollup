// tslint:disable:no-var-requires
export interface Heimdall {
  stop(): void;
}

const heimdall: {
  start(name: string): Heimdall;
  node(name: string, cb: () => Promise<void>): Promise<void>;
} = require('heimdalljs');
const _logger: (name: string) => ILogger = require('heimdalljs-logger');

export interface ILogger {
  debug(...args: any[]): void;
}

export const logger: ILogger = _logger('broccoli-rollup');

export function instrument(name: string): Heimdall {
  return heimdall.start(name);
}
