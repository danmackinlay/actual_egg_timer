/**
 * The page's side of the service worker (serviceWorker.ts): starting it, and
 * choosing when a new build may take over.
 *
 * Taking over reloads the page, and a reloaded page cannot ring: the alarm
 * lives in the old page's audio context (cook.ts, restoreCook). Only the tab
 * that owns the app can have a cook (owner.ts), so it alone decides
 * (`newBuild`): a new build never takes over while its cook runs. When none
 * is, it takes over at once if the cook has not touched the page since it
 * loaded (a reload, or the app just opened), and otherwise waits until the
 * page is out of sight, so the page is never reloaded under a thumb. A tab
 * that waits for the app holds nothing, so it reloads into the new build as
 * soon as it takes over, and every page stays on the build that served it.
 * An app kept open for days looks for a new build when it comes back into
 * view, at most once an hour.
 *
 * Only the built site has a service worker: tools/precache.ts writes it and
 * names it in index.html's <meta name="service-worker">.
 *
 * A browser keeps a service worker whose file has gone, and would answer
 * from its last build for ever. So when the page looks for a new build, it
 * first asks whether the site still serves the worker at all, and if the
 * site says it is gone, the owner drops the worker and its builds and loads
 * afresh from the network (again, never during a cook). Taking the worker
 * out of the site is deleting sw.js, and nothing more: a browser lets it go
 * at its next visit online. The same goes for another site later served at
 * the same address.
 */

import { BUILD_CACHE_PREFIX, TAKE_OVER } from './serviceWorker.ts';
import { request } from './idle.ts';
import { realMs } from './now.ts';

const LOOK_EVERY_MS = 60 * 60 * 1000;

/** A window, as a new build finds it: whether it owns the app (owner.ts) and
 *  runs a cook, whether the cook has touched it since it loaded, whether it
 *  is in view, and whether it asked the build to take over. */
interface BuildWindow {
  owner: boolean;
  cookRunning: boolean;
  touched: boolean;
  visible: boolean;
  asked: boolean;
}

/**
 * What a window does about a new build, waiting (`taken` false) or taken
 * over (true). Waiting, the owner asks it to take over ('take') between
 * cooks, unless the cook is at the page in view; anything else waits. Taken
 * over, the window that asked, and any window waiting for the app, reloads
 * into it; an owner that did not ask (none should) stays on its build.
 */
export function newBuild(w: BuildWindow, taken: boolean): 'take' | 'wait' | 'reload' {
  if (taken) return w.asked || !w.owner ? 'reload' : 'wait';
  if (!w.owner || w.cookRunning || (w.touched && w.visible)) return 'wait';
  return 'take';
}

/** Start the service worker, if the page names one. `app` says whether this
 *  page owns the app, and whether a cook runs in it. */
export function startOffline(app: () => { owner: boolean; cookRunning: boolean }): void {
  const named = document.querySelector<HTMLMetaElement>('meta[name="service-worker"]');
  if (named === null || !('serviceWorker' in navigator)) return;
  const workers = navigator.serviceWorker;

  let touched = false;
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, () => { touched = true; }, { capture: true, once: true });
  }

  let asked = false;
  const now = (): BuildWindow => ({
    ...app(), touched: touched, visible: document.visibilityState === 'visible', asked: asked,
  });
  workers.addEventListener('controllerchange', () => {
    if (newBuild(now(), true) === 'reload') window.location.reload();
  });

  workers.register(named.content, { type: 'module', updateViaCache: 'none' }).then((registration) => {
    const offer = (): void => {
      const waiting = registration.waiting;
      if (waiting === null || workers.controller === null || newBuild(now(), false) !== 'take') return;
      asked = true;
      waiting.postMessage(TAKE_OVER);
    };
    // Past the worker, which answers only GETs of the build's own files.
    const look = (update: boolean): void => {
      request(named.content, { method: 'HEAD', cache: 'no-store' }).then((response) => {
        if (response.status === 404 || response.status === 410) {
          const a = app();
          if (a.owner && !a.cookRunning) retire(registration).catch(() => { /* again next visit */ });
        } else if (update) {
          registration.update().catch(() => { /* look again next time */ });
        }
      }, () => { /* offline: no news */ });
    };
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (installing === null) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') offer();
      });
    });
    // An hour on the wall, not of the cook: a development clock run fast or
    // shifted (dev/clock.ts) would look at every return to the page, or never.
    let looked_ms = realMs();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && realMs() - looked_ms > LOOK_EVERY_MS) {
        looked_ms = realMs();
        look(true);
      }
      offer();
    });
    // Loading the page has already set the browser looking for a new build.
    look(false);
    offer();
  }).catch(() => {
    /* No service worker (unsupported, blocked, or the file is missing): the
       app works as it always has, online only. */
  });
}

/** The site no longer has a service worker: drop this one and its builds,
 *  and load the page from the network. */
async function retire(registration: ServiceWorkerRegistration): Promise<void> {
  await registration.unregister();
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(BUILD_CACHE_PREFIX)).map((name) => caches.delete(name)));
  window.location.reload();
}
