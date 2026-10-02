/** Entry point. The app is app.ts, and the modules it imports.
 *
 *  The words come first: every string on the page is in copy/<locale>.json,
 *  and index.html carries none of its own, so nothing is painted until the
 *  catalogue is in - the one the cook last read, which may be the English
 *  of 1750 (LANGUAGE.md section 6). With them, and as fast, the population
 *  the prior is drawn from (population.ts), which the calibration loads
 *  against. */
import { boot } from './app.js';
import { applyCopy, loadCopy } from './copy.js';
import { effectiveLanguage } from '../core/language.js';
import { loadLanguage } from './store.js';
import { loadPopulation } from './population.js';

await Promise.all([loadCopy(effectiveLanguage(loadLanguage())), loadPopulation()]);
applyCopy(document);
boot();
