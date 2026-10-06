/**
 * The page's side of the service worker (serviceWorker.ts): starting it, and
 * choosing when a new build may take over.
 *
 * Taking over reloads the page, and a reloaded page cannot ring: the alarm
 * lives in the old page's audio context (cook.ts, restoreCook). So a new build
 * never takes over while a cook runs. When none is, it takes over at once if
 * the cook has not touched the page since it loaded (a reload, or the app
 * just opened), and otherwise waits until the page is out of sight, so the
 * page is never reloaded under a thumb. An app kept open for days looks for
 * a new build when it comes back into view, at most once an hour.
 *
 * Only the built site has a service worker: tools/precache.mjs writes it and
 * names it in index.html's <meta name="service-worker">. The repo root,
 * served as it is, has neither, and runs online only.
 *
 * A browser keeps a service worker whose file has gone, and would answer
 * from its last build for ever. So when the page looks for a new build, it
 * first asks whether the site still serves the worker at all, and if the
 * site says it is gone, the page drops the worker and its builds and loads
 * afresh from the network (again, never during a cook). Taking the worker
 * out of the site is deleting sw.js, and nothing more: a browser lets it go
 * at its next visit online. The same goes for another site later served at
 * the same address, such as the repo root on a port the built site used.
 */

import { BUILD_CACHE_PREFIX, TAKE_OVER } from './serviceWorker.js';

const LOOK_EVERY_MS = 60 * 60 * 1000;

/** Start the service worker, if the page names one. `noCookRunning` says
 *  whether the page may be reloaded now. */
export function startOffline(noCookRunning: () => boolean): void {
  const named = document.querySelector<HTMLMetaElement>('meta[name="service-worker"]');
  if (named === null || !('serviceWorker' in navigator)) return;
  const workers = navigator.serviceWorker;

  let touched = false;
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, () => { touched = true; }, { capture: true, once: true });
  }

  let asked = false;
  workers.addEventListener('controllerchange', () => {
    if (asked) window.location.reload();
  });

  workers.register(named.content, { type: 'module', updateViaCache: 'none' }).then((registration) => {
    const offer = (): void => {
      const waiting = registration.waiting;
      if (waiting === null || workers.controller === null || !noCookRunning()) return;
      if (touched && document.visibilityState === 'visible') return;
      asked = true;
      waiting.postMessage(TAKE_OVER);
    };
    // Past the worker, which answers only GETs of the build's own files.
    const look = (update: boolean): void => {
      fetch(named.content, { method: 'HEAD', cache: 'no-store' }).then((response) => {
        if (response.status === 404 || response.status === 410) {
          if (noCookRunning()) retire(registration).catch(() => { /* again next visit */ });
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
    let looked_ms = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - looked_ms > LOOK_EVERY_MS) {
        looked_ms = Date.now();
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
