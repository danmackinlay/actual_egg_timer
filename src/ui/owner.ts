/**
 * One tab owns the app. Every tab of the site shares one
 * localStorage, and the app writes each store whole, so two tabs running it
 * would write over each other. The first tab to boot holds an exclusive Web
 * Lock for as long as it is open, and runs the app; any other tab waits
 * (app.ts), writing, sounding and claiming nothing, until the cook presses
 * its button, which takes the lock from the tab holding it (`steal`). That
 * tab's held request is then aborted, and it stands down to wait in turn.
 *
 * Where the browser has no Web Locks (an insecure context: an http:// host
 * other than this machine) every tab owns the app, as before the lock. A
 * page holding a lock is never put in the back-forward cache, so going back
 * to the app loads it again.
 */

const OWNER_LOCK = 'aet.owner';

/** Whether this page runs the app: true until a lock says otherwise, so the
 *  tests and tools, which take none, write as they always have. */
let owned = true;

/** Lets go of the lock this page holds; nothing while it holds none. */
let release: () => void = () => undefined;

export function ownsApp(): boolean {
  return owned;
}

/**
 * Ask for the app: at boot only if no tab holds it, or taken from the tab
 * that does when the cook presses the button (`steal`). Resolves to whether
 * this page owns it now. If another tab takes it later, `lost` is called,
 * once.
 */
export function claimApp(steal: boolean, lost: () => void): Promise<boolean> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks === undefined) return Promise.resolve(owned = true);
  return new Promise((resolve) => {
    let held = false;
    locks.request(OWNER_LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
      held = lock !== null;
      resolve(owned = held);
      if (!held) return undefined;
      // Held while the page is open: the lock ends with it, or when another
      // tab takes it. A page leaving lets go at once, so a reload finds the
      // lock free rather than racing the old page's teardown for it.
      window.addEventListener('pagehide', letGo);
      return new Promise<void>((done) => { release = done; });
    }).catch(() => {
      // Refused before it was granted (a sandboxed frame): run as without
      // locks. Aborted while held: another tab took it.
      if (!held) {
        resolve(owned = true);
        return;
      }
      owned = false;
      release = () => undefined;
      window.removeEventListener('pagehide', letGo);
      lost();
    });
  });
}

function letGo(event: PageTransitionEvent): void {
  if (event.persisted) return;
  window.removeEventListener('pagehide', letGo);
  release();
}
