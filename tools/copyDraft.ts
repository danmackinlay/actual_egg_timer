/**
 * The copy drafts: every string each rewrite was meant to change, what it was
 * and what it became, and which app says it. The mechanism is here - the
 * types, the registry, `draftFor` and the template matching the proofs use;
 * each draft's rows are in tools/drafts/<name>.ts, whose header says what the
 * draft changed and on which commit.
 *
 * This is the list the proofs hold the catalogue to. `copyLiterals.ts --since`
 * diffs copy/en.json and the keys each app's source names against a base
 * commit, and refuses any difference not listed in that commit's draft;
 * `copySnapshot.ts compare --draft` renders the web app before and after and
 * refuses any string that changed and is not one of these. So the claim the
 * owner reads is exact: these strings changed, and nothing else did.
 *
 * `before` / `after` are the templates by plural category (`text` for a plain
 * message); null where the key did not exist before, or does not after. A key
 * that two apps said differently and now say alike is one key: the key that
 * goes is retired (`after: null`) and the key that stays gains the other app.
 *
 * To add a draft: write tools/drafts/<name>.ts exporting `const <name>: Draft`
 * (copy the newest one for its shape), import it below, and add `<name>,` at
 * the END of `DRAFTS`. The last entry is `LATEST_DRAFT`, the one a proof
 * checks when it is not told which.
 */

import { feedback } from './drafts/feedback.js';
import { rest } from './drafts/rest.js';
import { reach } from './drafts/reach.js';
import { history } from './drafts/history.js';
import { redesign } from './drafts/redesign.js';
import { outcome } from './drafts/outcome.js';
import { counter } from './drafts/counter.js';
import { boil } from './drafts/boil.js';
import { help } from './drafts/help.js';
import { safe } from './drafts/safe.js';
import { iosA } from './drafts/iosA.js';
import { oddsHelp } from './drafts/oddsHelp.js';
import { period } from './drafts/period.js';
import { iosB } from './drafts/iosB.js';
import { period_ios } from './drafts/period_ios.js';
import { pull } from './drafts/pull.js';
import { tighten } from './drafts/tighten.js';
import { loose } from './drafts/loose.js';
import { units } from './drafts/units.js';
import { settings } from './drafts/settings.js';
import { tidy } from './drafts/tidy.js';
import { tidy2 } from './drafts/tidy2.js';
import { privacy } from './drafts/privacy.js';
import { share } from './drafts/share.js';
import { learning } from './drafts/learning.js';
import { motto } from './drafts/motto.js';
import { plain } from './drafts/plain.js';
import { bench } from './drafts/bench.js';
import { quotes } from './drafts/quotes.js';
import { owner } from './drafts/owner.js';
import { below } from './drafts/below.js';
import { notes } from './drafts/notes.js';
import { data } from './drafts/data.js';
import { sharingid } from './drafts/sharingid.js';
import { steppers } from './drafts/steppers.js';
import { version } from './drafts/version.js';
import { stay } from './drafts/stay.js';
import { press } from './drafts/press.js';
import { randomid } from './drafts/randomid.js';
import { boiling } from './drafts/boiling.js';
import { feedback2 } from './drafts/feedback2.js';
import { exportDraft } from './drafts/export.js';

export type Templates = Record<string, string>;

export interface Drafted {
  key: string;
  before: Templates | null;
  after: Templates | null;
  appsBefore: string[];
  appsAfter: string[];
  /** Where the draft puts this key: its row or group, in a word or two. */
  row: string;
  /** The key's twin in a regional overlay (copy/en-US.json), rewritten
   *  with it, by locale: what the overlay said before and says after. The
   *  web renders the overlay's words in that region, so the snapshot proof
   *  reads these as rows of their own; `copyLiterals` reads only the base. */
  overlays?: Record<string, { before: Templates; after: Templates }>;
}

/** A draft's rows with each overlay twin as a row of its own, for a proof
 *  that reads rendered words, in which a region's twin is just another
 *  string. */
export function withOverlays(rows: Drafted[]): Drafted[] {
  return rows.flatMap((d) => [d, ...Object.entries(d.overlays ?? {}).map(([locale, o]): Drafted => ({
    key: d.key, row: `${d.row} (${locale})`, before: o.before, after: o.after,
    appsBefore: d.appsBefore, appsAfter: d.appsAfter,
  }))]);
}

export interface Draft {
  /** The commit on main the draft was applied to. */
  base: string;
  rows: Drafted[];
  /** Keys whose ENTRY changed only in an example or a note, which render
   *  nothing: the key, and why. */
  exampleOnly: Record<string, string>;
}

export const DRAFTS: Record<string, Draft> = {
  feedback,
  rest,
  reach,
  history,
  redesign,
  outcome,
  counter,
  boil,
  help,
  safe,
  iosA,
  oddsHelp,
  period,
  iosB,
  period_ios,
  pull,
  tighten,
  loose,
  units,
  settings,
  tidy,
  tidy2,
  privacy,
  share,
  learning,
  motto,
  plain,
  bench,
  quotes,
  owner,
  below,
  notes,
  data,
  sharingid,
  steppers,
  version,
  stay,
  press,
  randomid,
  boiling,
  feedback2,
  export: exportDraft,
};

/** The draft most recently applied, the last in `DRAFTS`: what a proof checks
 *  when it is not told. */
export const LATEST_DRAFT: string = Object.keys(DRAFTS)[Object.keys(DRAFTS).length - 1];

/** A draft by its name, or by the commit it was applied to (a hex ref of at
 *  least 4 digits, short or full); the latest when neither is given. Throws on
 *  a name or ref it cannot resolve to exactly one draft, rather than quietly
 *  proving against the wrong one. */
export function draftFor(nameOrRef?: string): Draft {
  if (nameOrRef === undefined) return DRAFTS[LATEST_DRAFT];
  if (Object.hasOwn(DRAFTS, nameOrRef)) return DRAFTS[nameOrRef];
  const names = Object.keys(DRAFTS);
  const byBase = /^[0-9a-f]{4,40}$/.test(nameOrRef)
    ? names.filter((n) => nameOrRef.startsWith(DRAFTS[n].base) || DRAFTS[n].base.startsWith(nameOrRef))
    : [];
  if (byBase.length === 1) return DRAFTS[byBase[0]];
  if (byBase.length > 1) {
    throw new Error(`${nameOrRef} is the base of more than one draft (${byBase.join(', ')}): name the one to check`);
  }
  throw new Error(`no draft is named ${nameOrRef} or applied to it; the drafts are ${names.join(', ')}`);
}

/** A template as a pattern: each placeholder captures, by name. Unanchored,
 *  it matches only at word boundaries, so "after boil" is not found inside
 *  "after boiling". */
export function templateRegExp(template: string, anchored: boolean): RegExp {
  const names: string[] = [];
  const parts = template.split(/\{([A-Za-z][A-Za-z0-9_]*)\}/);
  let source = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      source += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else {
      names.push(parts[i]);
      source += `(?<${parts[i]}_${names.length}>.+?)`;
    }
  }
  return new RegExp(anchored ? `^${source}$` : `(?<![A-Za-z])${source}(?![A-Za-z])`, 'g');
}

/** Rewrite every rendering of a drafted key's old wording in `text` to its new
 *  wording, category by category, carrying the placeholders that survive. A
 *  retired key's wording is left alone: it is allowed to vanish, not to move. */
export function applyDraft(text: string, rows: Drafted[]): string {
  let out = text;
  for (const d of rows) {
    if (d.before === null || d.after === null) continue;
    for (const [category, from] of Object.entries(d.before)) {
      const to = d.after[category] ?? d.after['text'];
      if (to === undefined || from === to) continue;
      out = out.replace(templateRegExp(from, false), (...m: unknown[]) => {
        const groups = m[m.length - 1] as Record<string, string>;
        return to.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_all, name: string) => {
          const hit = Object.entries(groups).find(([k]) => k.startsWith(`${name}_`));
          return hit === undefined ? `{${name}}` : hit[1];
        });
      });
    }
  }
  return out;
}
