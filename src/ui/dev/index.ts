/**
 * The development tools, loaded before the app boots on a page served from
 * this machine only (main.ts), and left out of the site (`npm run
 * build:site`, tools/buildSite.ts): the development clock (clock.ts) and
 * what a script driving the page may ask of it (test.ts).
 */

import { installDevClock } from './clock.ts';
import { installTestApi } from './test.ts';

export function install(): void {
  installDevClock();
  installTestApi();
}
