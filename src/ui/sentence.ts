/**
 * The setup sentence: the egg's setup as one line of prose whose clauses are
 * the buttons that open its choices, in every phase: the settings' while idle, a running cook's own choices while
 * one runs (state.ts, `controlsOf`).
 */

import type { Egg, SizeClass } from '../core/geometry.ts';
import type { Cooling } from '../core/protocol.ts';
import { SOUS_VIDE_BATH_C } from '../core/sousvide.ts';
import { sizeClassLabel } from '../core/units.ts';
import type { EggFrom } from '../core/record.ts';
import { type Clause, type ClauseKeys, clauseKeys } from '../core/wording.ts';
import { t, tChosen } from './copy.ts';
import { type ElementId, page } from './dom.ts';
import type { Settings, UiStartMode } from './store.ts';
import { show, unitSystem } from './units.ts';

const CLAUSE_PANELS: Record<Clause, ElementId & `panel${string}`> = {
  egg: 'panelEgg', from: 'panelFrom', start: 'panelStart', cooling: 'panelCooling',
};

/** The four clauses, made once and kept, so re-rendering the sentence around
 *  a new answer never takes the focus off the one being used. Each is a span
 *  that is a button (`role`, `tabindex`, Enter and Space), not a <button>:
 *  a button is drawn as an inline block, so a clause that wraps beside the
 *  egg would push the punctuation after it to the far end of its last line,
 *  where a span wraps as the words around it do. */
const clauses = {} as Record<Clause, HTMLElement>;
let sentenceShown = '';
let openClause: Clause | null = null;

function panelFor(clause: Clause): HTMLElement {
  return page()[CLAUSE_PANELS[clause]];
}

/** What the sentence says: the cook the controls describe
 *  (`liveSetupFacts`). */
export interface SetupFacts {
  /** The egg's mass as the size menu or the scale says it, with its unit. */
  mass: string;
  /** How many eggs go in. */
  count: number;
  eggFrom: EggFrom;
  /** The egg's temperature when it is the cook's own number, C. */
  customStart_C: number;
  startMode: UiStartMode;
  /** The heat goes off at the boil. */
  standing: boolean;
  cooling: Cooling;
  /** The bowl's water, with its unit. */
  water: string;
  /** The temperature of the water the eggs cool in as the cook gave it, C,
   *  for running water or a bowl; null when assumed, or for another cooling. */
  coolingWater_C: number | null;
}

/** The mass of a size class as the size menu shows it, in the units on
 *  screen. */
function classMass(classes: SizeClass[], index: number): string {
  const label = sizeClassLabel(classes[index], unitSystem());
  return t(label.mass.key, { value: label.mass.value });
}

/** The setup on the controls: `settings` (state.ts, `controlsOf`)
 *  read against this page's carton, with `egg` the egg they describe. */
export function liveSetupFacts(settings: Settings, classes: SizeClass[], egg: Egg): SetupFacts {
  const byClass = settings.sizeIndex >= 0 && settings.sizeIndex < classes.length;
  return {
    mass: byClass ? classMass(classes, settings.sizeIndex) : show('mass', egg.mass_kg * 1000),
    count: settings.eggCount,
    eggFrom: settings.startTempMode,
    customStart_C: settings.customStart_C,
    startMode: settings.startMode,
    standing: settings.afterBoil === 'off',
    cooling: settings.cooling,
    water: show('bowl', settings.bowlLitres),
    coolingWater_C: settings.cooling === 'tap' ? settings.tapWater_C
      : settings.cooling === 'bowl' ? settings.bowlWater_C : null,
  };
}

/** What each clause says, and what a screen reader hears for it: its heading
 *  and the option chosen, as the choice itself shows them ("Egg: 68 g"). */
function clauseTexts(f: SetupFacts): Record<Clause, { text: string; label: string; value: string }> {
  const args = {
    count: f.count, mass: f.mass, temp: show('eggTemp', f.customStart_C), bath: show('temperature', SOUS_VIDE_BATH_C),
  };
  // The cooling clause's temperature is the water's, not the egg's.
  const coolingArgs = {
    water: f.water, temp: f.coolingWater_C === null ? '' : show('coolingWater', f.coolingWater_C),
  };
  const keys = clauseKeys({
    eggFrom: f.eggFrom, startMode: f.startMode === 'cold' ? 'cold' : 'hot', sousVide: f.startMode === 'sous',
    afterBoil: f.standing ? 'off' : 'hold', cooling: f.cooling, coolingWaterGiven: f.coolingWater_C !== null,
  });
  const words = (k: ClauseKeys, own: string, with_: Record<string, string | number> = args) => ({
    text: tChosen(k.text, with_), label: t(k.label), value: k.value === null ? own : tChosen(k.value, with_),
  });
  return {
    egg: words(keys.egg, args.mass),
    from: words(keys.from, args.temp),
    start: words(keys.start, ''),
    cooling: words(keys.cooling, '', coolingArgs),
  };
}

/** Marks a placeholder's place in a rendered template: a character no
 *  catalogue will contain. */
const SLOT = '\u0001';

/**
 * The setup as one line of prose, rebuilt around the answers whenever they
 * change. The template is the catalogue's, so a language may order the
 * clauses as it likes; each placeholder becomes its clause's button, and
 * everything between them stays text. Sous-vide says less, because where the
 * egg comes from and how it cools change nothing there.
 */
export function renderSentence(facts: SetupFacts): void {
  const texts = clauseTexts(facts);
  const key = facts.startMode === 'sous' ? 'setup.sentenceSousVide' : 'setup.sentence';
  const marked = t(key, {
    egg: `${SLOT}egg${SLOT}`, from: `${SLOT}from${SLOT}`,
    start: `${SLOT}start${SLOT}`, cooling: `${SLOT}cooling${SLOT}`,
  });
  // The units too: the masses and temperatures are in them.
  const signature = [unitSystem(), marked, ...Object.values(texts).map((c) => `${c.text}|${c.label}|${c.value}`)].join('\n');
  if (signature === sentenceShown) return;
  sentenceShown = signature;

  const focused = document.activeElement;
  const nodes: Node[] = [];
  // Each button keeps the punctuation straight after it - the text up to the
  // next space - in one unbreakable span. A button is an atomic inline, which
  // a line may break after, so without it a line could start with ", then
  // under a cold tap".
  let wrap: HTMLSpanElement | null = null;
  marked.split(SLOT).forEach((part, i) => {
    if (i % 2 === 0) {
      let rest = part;
      if (wrap !== null) {
        const stuck = /^\S*/.exec(rest)?.[0] ?? '';
        if (stuck !== '') wrap.append(stuck);
        rest = rest.slice(stuck.length);
        wrap = null;
      }
      if (rest !== '') nodes.push(document.createTextNode(rest));
      return;
    }
    const clause = part as Clause;
    const button = clauses[clause];
    button.textContent = texts[clause].text;
    button.setAttribute('aria-label', t('setup.clause', { label: texts[clause].label, value: texts[clause].value }));
    wrap = document.createElement('span');
    wrap.className = 'clause-wrap';
    wrap.append(button);
    nodes.push(wrap);
  });
  page().sentence.replaceChildren(...nodes);
  if (focused instanceof HTMLElement && focused.isConnected && focused !== document.activeElement) focused.focus();
  // A choice whose clause the sentence no longer has - sous-vide drops two -
  // closes with it.
  if (openClause !== null && !clauses[openClause].isConnected) setOpenClause(null);
}

/** Open one clause's choice under the sentence, or none. One at a time. */
function setOpenClause(next: Clause | null): void {
  openClause = next;
  for (const clause of Object.keys(CLAUSE_PANELS) as Clause[]) {
    const open = clause === next;
    clauses[clause].setAttribute('aria-expanded', open ? 'true' : 'false');
    panelFor(clause).hidden = !open;
  }
}

/** The four clauses, and each panel's Done. Once, at boot. */
export function buildClauses(): void {
  for (const clause of Object.keys(CLAUSE_PANELS) as Clause[]) {
    const button = document.createElement('span');
    button.className = 'clause';
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.setAttribute('aria-controls', CLAUSE_PANELS[clause]);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => setOpenClause(openClause === clause ? null : clause));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      button.click();
    });
    clauses[clause] = button;
    // The panel's own Done puts the focus back where the cook came from.
    const close = panelFor(clause).querySelector<HTMLButtonElement>('button.panel__close');
    close?.addEventListener('click', () => {
      setOpenClause(null);
      button.focus();
    });
  }
}
