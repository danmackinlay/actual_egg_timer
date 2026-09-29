/** Entry point. The app is app.ts, and the modules it imports.
 *
 *  The words come first: every string on the page is in copy/<locale>.json,
 *  and index.html carries none of its own, so nothing is painted until the
 *  catalogue is in - the one the cook last read, which may be the English
 *  of 1750 (LANGUAGE.md section 6). */
import { boot } from './app.js';
import { applyCopy, loadCopy } from './copy.js';
import { effectiveLanguage } from '../core/language.js';
import { loadLanguage } from './store.js';

await loadCopy(effectiveLanguage(loadLanguage()));
applyCopy(document);
boot();
