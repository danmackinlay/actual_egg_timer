/**
 * The development tools, loaded before the app boots on a page served from
 * this machine only (main.ts), and left out of the site (`npm run
 * build:site`, tools/buildSite.mjs): the development clock (clock.ts) and
 * what a script driving the page may ask of it (test.ts).
 */

import { installDevClock } from './clock.js';
import { installTestApi } from './test.js';

export function install(): void {
  installDevClock();
  installTestApi();
}
