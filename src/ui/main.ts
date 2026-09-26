/** Entry point. Everything else is in app.ts.
 *
 *  The words come first: every string on the page is in copy/<locale>.json,
 *  and index.html carries none of its own, so nothing is painted until the
 *  catalogue is in. */
import { boot } from './app.js';
import { applyCopy, loadCopy } from './copy.js';

await loadCopy();
applyCopy(document);
boot();
