// tslint:disable:no-var-requires
const heimdall: {
  node(name: string, cb: () => Promise<void>): Promise<void>;
} = require('heimdalljs');
const _logger: (name: string) => ILogger = require('heimdalljs-logger');

export interface ILogger {
  debug(...args: any[]): void;
}

export const logger: ILogger = _logger('broccoli-rollup');

export function instrument(name: string, cb: () => Promise<void>): Promise<void> {
  return heimdall.node(name, cb);
}
