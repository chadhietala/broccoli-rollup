/** @typedef {import('broccoli-test-helper').Disposable} Disposable */
/** @typedef {<T extends Disposable>(disposable: T) => T} UseCallback */

/**
 * @param {(use: UseCallback) => Promise<void>} body
 */
async function using(body) {
  /** @type {Disposable[]} */
  const disposables = [];
  /** @type {UseCallback} */
  const use = disposable => {
    disposables.push(disposable);
    return disposable;
  };
  try {
    await body(use);
  } finally {
    let disposable = disposables.pop();
    while (disposable !== undefined) {
      await disposable.dispose();
      disposable = disposables.pop();
    }
  }
}

module.exports.using = using;
