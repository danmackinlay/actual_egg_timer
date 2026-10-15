/**
 * One tab owns the web app (src/ui/owner.ts, DECISIONS.md 128): the lock
 * asked for at boot and taken over on a press, against a lock manager in
 * memory, and the store's one door (src/ui/store.ts), which refuses every
 * write from a page that does not own the app.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { claimApp, ownsApp } from '../src/ui/owner.js';
import { removeStorage, writeStorage } from '../src/ui/store.js';

const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

/** One exclusive lock, as the browser keeps it for a site: a request with
 *  `ifAvailable` gets null while it is held, and one with `steal` takes it,
 *  aborting the holder's request. */
function lockManager() {
  let holder: { abort: (e: Error) => void } | null = null;
  return {
    request(_name: string, options: { ifAvailable?: boolean; steal?: boolean },
      f: (lock: object | null) => Promise<void> | undefined): Promise<void> {
      if (holder !== null && options.ifAvailable === true) return Promise.resolve(f(null));
      if (holder !== null && options.steal === true) holder.abort(new Error('AbortError'));
      return new Promise<void>((resolve, reject) => {
        const me = { abort: reject };
        holder = me;
        void Promise.resolve(f({})).then(() => {
          if (holder === me) holder = null;
          resolve();
        });
      });
    },
  };
}

/** Node's own `navigator` has a getter only, so it is replaced whole. */
function useLocks(locks: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: locks === undefined ? {} : { locks: locks }, configurable: true, writable: true,
  });
}

test('1. without Web Locks every page owns the app, and writes', async () => {
  useLocks(undefined);
  assert.equal(await claimApp(false, () => assert.fail('nothing to lose')), true);
  assert.equal(ownsApp(), true);
  writeStorage('aet.x', '1');
  assert.equal(storage.get('aet.x'), '1');
});

test('2. a second page waits and writes nothing; a press takes the app, and the first stops writing', async () => {
  storage.clear();
  const locks = lockManager();
  useLocks(locks);
  // The first page: granted. (Both pages share this module's flag here, so
  // each claim is read as the page making it.)
  let lost = 0;
  assert.equal(await claimApp(false, () => { lost += 1; }), true);
  // The second page: refused, and every write refused with it.
  assert.equal(await claimApp(false, () => assert.fail('it held nothing')), false);
  assert.equal(ownsApp(), false);
  writeStorage('aet.x', '1');
  removeStorage('aet.y');
  storage.set('aet.y', 'kept');
  removeStorage('aet.y');
  assert.deepEqual([...storage], [['aet.y', 'kept']], 'not one write');
  // The press: the lock taken, the first page told once.
  assert.equal(await claimApp(true, () => undefined), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(lost, 1);
  assert.equal(ownsApp(), false, 'the page told it lost the app writes nothing');
  writeStorage('aet.x', '2');
  assert.equal(storage.get('aet.x'), undefined);
});
