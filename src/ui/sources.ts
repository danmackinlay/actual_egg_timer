/**
 * Help's list of sources, from help-sources.json, which iOS bundles too: a
 * citation and its address each, the same in every language, so data and
 * not catalogue words. Bundled into the page, so nothing is fetched for it.
 */

import SOURCES from '../../help-sources.json' with { type: 'json' };

/** Fill Help's list once: a link to each source, in a new tab without the
 *  opener, as every link out of the page opens. */
export function fillSources(doc: Document): void {
  const list = doc.getElementById('helpSources');
  if (list === null || list.childElementCount > 0) return;
  for (const s of SOURCES.sources) {
    const a = doc.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = s.text;
    const li = doc.createElement('li');
    li.append(a);
    list.append(li);
  }
}
