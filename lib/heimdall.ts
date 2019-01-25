// tslint:disable:no-var-requires
const heimdall: {
  start(label: string): { stop(): void };
} = require('heimdalljs');
const _logger: (name: string) => ILogger = require('heimdalljs-logger');

export interface ILogger {
  debug(...args: any[]): void;
}

const logger: ILogger = _logger('broccoli-rollup');

export { heimdall, logger };
