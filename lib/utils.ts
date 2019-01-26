import { createHash } from 'crypto';
import {
  closeSync,
  futimesSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { Change, IEntry } from './tree-diff';

export function syncFiles(
  src: string,
  dest: string,
  changes: Change[],
  digests: Map<string, string>,
) {
  changes.forEach(change => {
    const op = change[0];
    const relativePath = change[1];
    const entry = change[2];
    switch (op) {
      case 'mkdir':
        mkdirSync(`${dest}/${relativePath}`);
        break;
      case 'unlink':
        unlinkSync(`${dest}/${relativePath}`);
        digests.delete(relativePath);
        break;
      case 'rmdir':
        rmdirSync(`${dest}/${relativePath}`);
        break;
      case 'create':
      case 'change':
        writeFile(src, dest, entry, digests);
        break;
    }
  });
}

export function writeFile(
  src: string,
  dest: string,
  entry: IEntry,
  digests: Map<string, string>,
) {
  const relativePath = entry.relativePath;
  const content = readFileSync(`${src}/${relativePath}`);

  const newDigest = createHash('md5')
    .update(content)
    .digest('hex');

  const oldDigest = digests.get(relativePath);

  if (oldDigest !== newDigest) {
    digests.set(relativePath, newDigest);
    const fd = openSync(`${dest}/${relativePath}`, 'w', entry.mode);
    try {
      let offset = 0;
      let length = content.byteLength;
      while (length > 0) {
        const written = writeSync(fd, content, offset, length);
        offset += written;
        length -= written;
      }

      const mtime = new Date(entry.mtime);
      futimesSync(fd, mtime, mtime);
    } finally {
      closeSync(fd);
    }
  }
}
