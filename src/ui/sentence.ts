/**
 * The setup sentence: the egg's setup as one line of prose whose clauses are
 * the buttons that open its choices, and, once a cook is running, the same
 * sentence as plain prose from the cook's ticket.
 */

import { Egg, SizeClass } from '../core/geometry.js';
import { Cooling } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C } from '../core/sousvide.js';
import { sizeClassLabel } from '../core/units.js';
import { anchorNear } from '../core/policy.js';
import { EggFrom } from '../core/record.js';
import { Clause, ClauseKeys, clauseKeys } from '../core/wording.js';
import { midSentence } from '../core/copy.js';
import { activeLocale, t } from './copy.js';
import { dom, el } from './dom.js';
import { Settings, UiStartMode } from './store.js';
import { Ticket } from './ticket.js';
import { show, unitSystem } from './units.js';

const CLAUSE_PANELS: Record<Clause, string> = {
  egg: 'panelEgg', from: 'panelFrom', start: 'panelStart', cooling: 'panelCooling',
};

/** The four clause buttons, made once and kept, so re-rendering the sentence
 *  around a new answer never takes the focus off the one being used. */
const clauses = {} as Record<Clause, HTMLButtonElement>;
let sentenceShown = '';
let openClause: Clause | null = null;

function panelFor(clause: Clause): HTMLElement {
  return el<HTMLElement>(CLAUSE_PANELS[clause]);
}

/** What the sentence says, whichever cook it is about: the one on the
 *  controls (`liveSetupFacts`), or the one in the pan (`ticketSetupFacts`). */
export interface SetupFacts {
  /** The egg's mass as the size menu or the scale says it, with its unit. */
  mass: string;
  eggFrom: EggFrom;
  /** The egg's temperature when it is the cook's own number, C. */
  customStart_C: number;
  startMode: UiStartMode;
  /** The heat goes off at the boil. */
  standing: boolean;
  cooling: Cooling;
}

/** The mass of a size class as the size menu shows it, in the units on
 *  screen. */
function classMass(classes: SizeClass[], index: number): string {
  const label = sizeClassLabel(classes[index], unitSystem());
  return t(label.mass.key, { value: label.mass.value });
}

/** The setup on the controls: `settings` read against this page's carton,
 *  with `egg` the egg they describe. */
export function liveSetupFacts(settings: Settings, classes: SizeClass[], egg: Egg): SetupFacts {
  const byClass = settings.sizeIndex >= 0 && settings.sizeIndex < classes.length;
  return {
    mass: byClass ? classMass(classes, settings.sizeIndex) : show('mass', egg.mass_kg * 1000),
    eggFrom: settings.startTempMode,
    customStart_C: settings.customStart_C,
    startMode: settings.startMode,
    standing: settings.afterBoil === 'off',
    cooling: settings.cooling,
  };
}

/** The setup a cook was started with, from its ticket and not the controls:
 *  what the cook promised, whatever the controls say later. A class egg is
 *  named as its class's mass, as the size menu names it, when this page's
 *  carton still has a class of that mass; otherwise it is the egg's own. */
function ticketSetupFacts(k: Ticket, classes: SizeClass[]): SetupFacts {
  const index = k.massFrom === 'class' ? classes.findIndex((c) => c.mass_kg === k.egg.mass_kg) : -1;
  return {
    mass: index >= 0 ? classMass(classes, index) : show('mass', k.egg.mass_kg * 1000),
    eggFrom: k.eggFrom,
    customStart_C: k.setup.eggStart_C,
    startMode: k.setup.startMode,
    standing: k.setup.afterBoil === 'off',
    cooling: k.setup.cooling,
  };
}

/** What each clause says, and what a screen reader hears for it: its heading
 *  and the option chosen, as the choice itself shows them ("Egg: 68 g"). */
function clauseTexts(f: SetupFacts): Record<Clause, { text: string; label: string; value: string }> {
  const args = {
    mass: f.mass, temp: show('eggTemp', f.customStart_C), bath: show('temperature', SOUS_VIDE_BATH_C),
  };
  const keys = clauseKeys({
    eggFrom: f.eggFrom, startMode: f.startMode === 'cold' ? 'cold' : 'hot', sousVide: f.startMode === 'sous',
    afterBoil: f.standing ? 'off' : 'hold', cooling: f.cooling,
  });
  const words = (k: ClauseKeys, own: string) => ({
    text: t(k.text, args), label: t(k.label), value: k.value === null ? own : t(k.value, args),
  });
  return {
    egg: words(keys.egg, args.mass),
    from: words(keys.from, args.temp),
    start: words(keys.start, ''),
    cooling: words(keys.cooling, ''),
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
  const signature = [marked, ...Object.values(texts).map((c) => `${c.text}|${c.label}|${c.value}`)].join('\n');
  if (signature === sentenceShown) return;
  sentenceShown = signature;

  const focused = document.activeElement;
  const nodes: Node[] = [];
  marked.split(SLOT).forEach((part, i) => {
    if (i % 2 === 0) {
      if (part !== '') nodes.push(document.createTextNode(part));
      return;
    }
    const clause = part as Clause;
    const button = clauses[clause];
    button.textContent = texts[clause].text;
    button.setAttribute('aria-label', t('setup.clause', { label: texts[clause].label, value: texts[clause].value }));
    nodes.push(button);
  });
  dom.sentence.replaceChildren(...nodes);
  if (focused instanceof HTMLElement && focused.isConnected && focused !== document.activeElement) focused.focus();
  // A choice whose clause the sentence no longer has - sous-vide drops two -
  // closes with it.
  if (openClause !== null && !clauses[openClause].isConnected) setOpenClause(null);
}

/** Draw the sentence again at its next render even if its words look the
 *  same: its masses and temperatures are in the units, which have changed. */
export function redrawSentence(): void {
  sentenceShown = '';
}

/** The cook in the pan, once the controls are gone (owner, 28 September): the
 *  setup sentence it was started with, so a forgetful cook can see what they
 *  promised, as plain prose - nothing in it can change a cook under way, so
 *  nothing in it is a button - and under it what the sentence does not say,
 *  the doneness and the peak yolk it was started at. From the ticket, never
 *  the controls; `k` is null while idle, which hides it. `targetLevel` is the
 *  doneness the cook was started at. Sous-vide never runs a cook, so it never
 *  shows this. */
export function renderCookSetup(k: Ticket | null, targetLevel: number, classes: SizeClass[]): void {
  dom.cookSetup.hidden = k === null;
  if (k === null) return;
  const texts = clauseTexts(ticketSetupFacts(k, classes));
  dom.cookSentence.textContent = t('setup.sentence', {
    egg: texts.egg.text, from: texts.from.text, start: texts.start.text, cooling: texts.cooling.text,
  });
  // The peak yolk the cook was started with.
  dom.cookDoneness.textContent = t('cook.summary', {
    doneness: midSentence(t(anchorNear(targetLevel).key), activeLocale()),
    yolk: show('temperature', k.peakYolk_C),
  });
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

/** The four clause buttons, and each panel's Done. Once, at boot. */
export function buildClauses(): void {
  for (const clause of Object.keys(CLAUSE_PANELS) as Clause[]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clause';
    button.setAttribute('aria-controls', CLAUSE_PANELS[clause]);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => setOpenClause(openClause === clause ? null : clause));
    clauses[clause] = button;
    // The panel's own Done puts the focus back where the cook came from.
    const close = panelFor(clause).querySelector<HTMLButtonElement>('button.panel__close');
    close?.addEventListener('click', () => {
      setOpenClause(null);
      button.focus();
    });
  }
}
