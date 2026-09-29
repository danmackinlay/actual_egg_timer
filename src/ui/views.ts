/**
 * The three views - the egg, Settings (`#kitchen`) and Help - as hash routes,
 * so the phone's back button leaves them the way it came.
 */

import { dom } from './dom.js';

export type View = 'egg' | 'kitchen' | 'help';

/** Which view an address's hash asks for, and which element to scroll to in
 *  it. */
export function viewFromHash(address: string): { view: View; target: string | null } {
  const hash = address.replace(/^#/, '');
  if (hash === 'kitchen') return { view: 'kitchen', target: null };
  if (hash === 'help' || hash.startsWith('help-')) return { view: 'help', target: hash === 'help' ? null : hash };
  return { view: 'egg', target: null };
}

/**
 * Show the view the address names. The Kitchen and Help are hash routes, so
 * the phone's back button leaves them the way it came; a running cook is
 * always shown as the egg whatever the address says (styles.css).
 */
function route(focus: boolean): void {
  const before = dom.body.dataset['view'];
  const { view, target } = viewFromHash(location.hash);
  dom.body.dataset['view'] = view;
  const section = target === null ? null : document.getElementById(target);
  if (section !== null) {
    section.scrollIntoView();
  } else if (before !== view) {
    window.scrollTo(0, 0);
  }
  if (!focus || before === view) return;
  if (view === 'kitchen') dom.kitchenTitle.focus();
  else if (view === 'help' && section === null) dom.helpTitle.focus();
}

/** A link to another view goes into the history as ours, so Back can return
 *  along it rather than leave the site. */
function navigate(hash: string): void {
  history.pushState({ aet: true }, '', hash);
  route(true);
}

/** Back: along our own history when there is some, and otherwise - a view
 *  opened straight from its address - to the egg, without leaving a step
 *  behind. */
function goBack(): void {
  const state = history.state as { aet?: boolean } | null;
  if (state !== null && state.aet === true) {
    history.back();
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  route(true);
}

export function wireViews(): void {
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href') ?? '#';
      event.preventDefault();
      // Within Help, a contents link only scrolls: it is not somewhere Back
      // should stop.
      if (dom.body.dataset['view'] === 'help' && hash.startsWith('#help-')) {
        history.replaceState(history.state, '', hash);
        route(false);
        return;
      }
      navigate(hash);
    });
  }
  dom.navBack.addEventListener('click', goBack);
  // Back, Forward and a hash typed into the address all fire popstate, and
  // hashchange too whenever the hash differs: one listener routes once.
  window.addEventListener('popstate', () => route(true));
  route(false);
}
