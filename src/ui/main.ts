/** Entry point. The app is app.ts, and the modules it imports.
 *
 *  The words come first: every string on the page is in copy/<locale>.json,
 *  and index.html carries none of its own, so nothing is painted until the
 *  catalogue is in - the one the cook last read, which may be the English
 *  of 1750 (LANGUAGE.md section 6). With them, and as fast, the population
 *  the prior is drawn from (population.ts), which the calibration loads
 *  against.
 *
 *  On a page served from this machine, and nowhere else, the development
 *  tools load before the app boots (dev/index.ts: the development clock and
 *  the test API). They are imported here and only here, by a dynamic
 *  import, so the site that ships has none of them (`npm run build:site`
 *  leaves src/ui/dev/ out); where they are missing, the page boots without
 *  them. */
import { boot } from './app.js';
import { applyCopy, loadCopy } from './copy.js';
import { effectiveLanguage } from '../core/language.js';
import { isDevHost } from './now.js';
import { loadLanguage } from './store.js';
import { loadPopulation } from './population.js';

async function devTools(): Promise<void> {
  if (!isDevHost(location.hostname)) return;
  try {
    (await import('./dev/index.js')).install();
  } catch {
    /* a site built to ship, served here: no development tools */
  }
}

await Promise.all([loadCopy(effectiveLanguage(loadLanguage())), loadPopulation(), devTools()]);
applyCopy(document);
boot();
