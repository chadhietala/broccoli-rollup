const rollup = require('./dist');

// old API just module.exports = class BroccoliRollup
// this proxies export to it, but catches default and BroccoliRollup keys
// and also, call redirects to default().
module.exports = new Proxy(rollup.BroccoliRollup, {
  // support default interop with require
  apply(_, thisArg, args) {
    return Reflect.apply(rollup.default, thisArg, args);
  },
  get(target, prop) {
    switch (prop) {
      case 'default':
      case 'BroccoliRollup':
        return rollup[prop];
      default:
        return target[prop];
    }
  },
  has(target, prop) {
    switch (prop) {
      case 'default':
      case 'BroccoliRollup':
        return true;
      default:
        return prop in target;
    }
  },
  ownKeys(target) {
    return ['default', 'BroccoliRollup'].concat(Reflect.ownKeys(target));
  },
  getOwnPropertyDescriptor(target, prop) {
    switch (prop) {
      case 'default':
      case 'BroccoliRollup':
        return Reflect.getOwnPropertyDescriptor(rollup, prop);
      default:
        return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  },
});
