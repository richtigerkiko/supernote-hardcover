import {PluginManager} from 'sn-plugin-lib';
import type {Grants} from '../core/types';

const PERMS: [string, string][] = [
  ['plugin.permission.FILE:READ', 'Read the title of the book you are reading from its file.'],
  ['plugin.permission.INTERNET', 'Send your reading progress to Hardcover.'],
];

// Asked once when first needed (already granted after the first run).
let asked: Promise<boolean> | null = null;
function ask(): Promise<boolean> {
  asked ??= (async () => {
    for (const [perm, why] of PERMS) {
      if ((await PluginManager.hasPermission(perm)) === 1) continue;
      const r = await PluginManager.requestPermission(perm, why);
      if (r !== 1 && r !== 2) return false;
    }
    return true;
  })().then(ok => {
    if (!ok) asked = null; // denied: ask again next time
    return ok;
  });
  return asked;
}

// A true result is remembered.
let known = false;
async function granted() {
  if (known) return true;
  for (const [perm] of PERMS) if ((await PluginManager.hasPermission(perm)) !== 1) return false;
  return (known = true);
}

export const grants: Grants = {
  async need() {
    if (!(await ask())) throw new Error('permission for files and internet not granted');
    known = true;
  },
  granted,
  async needGranted() {
    if (!(await granted())) throw new Error('permissions not granted yet');
  },
  revoke: () => {
    known = false;
  },
};
