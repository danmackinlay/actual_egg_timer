/** Entry point. The app is app.ts, and the modules it imports.
 *
 *  The words come first: every string on the page is in copy/<locale>.json,
 *  and index.html carries none of its own, so nothing is painted until the
 *  catalogue is in - the one the cook last read, which may be the English
 *  of 1750 (LANGUAGE.md section 6). With them, and as fast, the population
 *  the prior is drawn from (population.ts), which the calibration loads
 *  against.
 *
 *  On a page served from this machine by the development server, and
 *  nowhere else, the development tools load before the app boots
 *  (dev/index.ts: the development clock and the test API). They are
 *  imported here and only here, by a dynamic import, which the build makes
 *  a file of its own that the site that ships leaves out (`npm run
 *  build:site`, tools/buildSite.ts). The server says it has them with a
 *  cookie naming its port (tools/devServer.ts): cookies are shared by every
 *  port of a host, and the site that ships, served here on another
 *  (`npm run serve:site`), asks for nothing it does not have. */
import { boot } from './app.ts';
import { applyCopy, loadCopy } from './copy.ts';
import { effectiveLanguage } from './settings.ts';
import { isDevHost } from './now.ts';
import { loadLanguage } from './store.ts';
import { loadPopulation } from './population.ts';
import { fillSources } from './sources.ts';

async function devTools(): Promise<void> {
  if (!isDevHost(location.hostname)) return;
  if (!document.cookie.split('; ').includes(`aet-dev-tools=${location.port}`)) return;
  try {
    (await import('./dev/index.ts')).install();
  } catch {
    /* not to be had (offline, say, since the service worker does not keep
       them): the page boots without them */
  }
}

await Promise.all([loadCopy(effectiveLanguage(loadLanguage())), loadPopulation(), devTools()]);
fillSources(document);
applyCopy(document);
await boot();
