/**
 * F2's first rewrite: the feedback screens, as drafted in LANGUAGE.md section 3
 * and implemented with E2. Every string it was meant to change, what it was and
 * what it became, and which app says it.
 *
 * This is the list the proofs hold the catalogue to. `copyLiterals.ts --since`
 * diffs copy/en.json and the keys each app's source names against a base
 * commit, and refuses any difference not listed here; `copySnapshot.ts compare
 * --draft` renders the web app before and after and refuses any string that
 * changed and is not one of these. So the claim the owner reads is exact: these
 * strings changed, and nothing else did.
 *
 * `before` / `after` are the templates by plural category (`text` for a plain
 * message); null where the key did not exist before, or does not after. The two
 * "E5, preview" rows of the draft are not here: they belong to E5.
 */

export type Templates = Record<string, string>;

export interface Drafted {
  key: string;
  before: Templates | null;
  after: Templates | null;
  appsBefore: string[];
  appsAfter: string[];
  /** The row of LANGUAGE.md section 3 this is. */
  row: string;
}

/** The commit on main the draft was applied to: F3 merged, nothing of F2. */
export const DRAFT_BASE = 'cfe38e9';

export const FEEDBACK_DRAFT: Drafted[] = [
  {
    key: 'feedback.tooFirm', row: 'yolk answers',
    before: { text: 'Too firm' }, after: { text: 'Too firm' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.tooHard', row: 'yolk answers',
    before: { text: 'Too hard' }, after: null, appsBefore: ['ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.ask', row: 'white question',
    before: { text: 'And the white — was it runny?' }, after: { text: 'And the white?' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.runny', row: 'white answers',
    before: { text: 'Still runny' }, after: { text: 'Runny' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.set', row: 'white answers',
    before: { text: 'Set right through' }, after: null,
    appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.white.tender', row: 'white answers',
    before: null, after: { text: 'Tender' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.firm', row: 'white answers',
    before: null, after: { text: 'Firm' }, appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.white.why', row: 'optional hint',
    before: { text: 'The white sets from the outside in, so this says something about your eggs that the yolk cannot.' },
    after: null, appsBefore: ['web', 'ios'], appsAfter: [],
  },
  {
    key: 'feedback.optional', row: 'optional hint',
    before: null, after: { text: 'Answer either, both or neither.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.thanks', row: 'after an answer',
    before: { text: 'Thanks — it has adjusted.' }, after: { text: 'Thanks. The next egg will use that.' },
    appsBefore: ['ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'feedback.invite', row: 'before any egg',
    before: { text: 'Telling it tunes the model to your eggs and your pan.' },
    after: { text: 'Your answers adjust the times to your eggs and your pan.' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.tuned', row: 'what it has learned',
    before: { one: 'tuned on {eggs} egg · ±{spread}%', other: 'tuned on {eggs} eggs · ±{spread}%' },
    after: { one: 'Learned from {eggs} egg', other: 'Learned from {eggs} eggs' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'learned.literature', row: 'nothing learned yet',
    before: { text: 'Running on the literature values. It learns your pan when you time a boil, and your taste when you say how an egg was.' },
    after: { text: 'Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out.' },
    appsBefore: ['web'], appsAfter: ['web'],
  },
  {
    key: 'learned.confirm.title', row: 'forget dialog, iOS',
    before: { text: 'Forget the calibration?' }, after: { text: 'Forget what it learned?' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'learned.confirm.message', row: 'forget dialog, iOS',
    before: { text: 'The model goes back to the literature values it shipped with, and the time to boil goes back to a guess.' },
    after: { text: 'Every egg and your pan\'s boil time are forgotten, and the times go back to where they started.' },
    appsBefore: ['ios'], appsAfter: ['ios'],
  },
  {
    key: 'readout.sub.pull', row: 'pull screen, web',
    before: { text: 'carryover is running' }, after: { text: 'the yolk is still cooking' },
    appsBefore: ['web', 'ios'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.ice', row: 'pull button, iOS',
    before: { text: 'They\'re in the ice bath' }, after: { text: 'They\'re in the ice bath' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.tap', row: 'pull button, iOS',
    before: { text: 'They\'re under the tap' }, after: { text: 'They\'re under the tap' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'action.pulled.counter', row: 'pull button, iOS',
    before: { text: 'They\'re out' }, after: { text: 'They\'re out' },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
];

/** Keys whose ENTRY changed only in an example, which renders nothing. */
export const EXAMPLE_ONLY: Record<string, string> = {
  'learned.both': 'its example quotes learned.tuned, whose wording changed',
};

/** A template as a pattern: each placeholder captures, by name. */
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
  return new RegExp(anchored ? `^${source}$` : source, 'g');
}

/** Rewrite every rendering of a drafted key's old wording in `text` to its new
 *  wording, category by category, carrying the placeholders that survive. A
 *  retired key's wording is left alone: it is allowed to vanish, not to move. */
export function applyDraft(text: string): string {
  let out = text;
  for (const d of FEEDBACK_DRAFT) {
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
