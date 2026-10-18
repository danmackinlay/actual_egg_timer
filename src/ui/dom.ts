/**
 * The page's elements, found once at boot, and the helpers that write
 * them: words, and the radio groups.
 *
 * Nothing here touches the document when the module is imported: the
 * elements are found by `bindDom()`, which `boot()` calls first, and read
 * through `page()`, which throws before then - so a test can import any
 * module that uses it, and a read before boot says so rather than reading
 * undefined.
 */

/**
 * The page's elements by their ids in index.html, each with its tag: every
 * one the code writes to or reads, and those a script drives (the e2e,
 * tools/e2e/, and the copy capture name them as an `ElementId`), each named
 * once. An id renamed in the markup fails `npm test` (test/dom.test.ts)
 * and boot, where `bindDom` finds each and checks its tag; one renamed here
 * fails the typecheck wherever it is named.
 */
export const ELEMENTS = {
  readout: 'section', phaseLabel: 'p', digits: 'span', announce: 'span', sublineText: 'span', sublineInfo: 'button',
  sublineMore: 'p', certaintyWord: 'button', mostLikely: 'p', certaintyMore: 'div', certaintyInterval: 'p',
  certaintyLikely: 'p', certaintyTime: 'p', certaintyHelp: 'p', learning: 'p', learningInfo: 'button',
  whiteRisk: 'p',

  advice: 'p', adviceList: 'ul', forYou: 'div', welcome: 'p', helpSousVide: 'p', sentence: 'p', eggSection: 'svg',
  eggToggle: 'button', eggToggleOffer: 'span',
  controls: 'form', startedAtField: 'div', startedAt: 'output', startedAtLess: 'button', startedAtMore: 'button',
  startedAtLimit: 'p', navBack: 'button', settingsTitle: 'h1', helpTitle: 'h1', statBoil: 'strong', note: 'p',
  warn: 'p', mute: 'button', doneness: 'input', donenessOdds: 'div', donenessUnlikelySoft: 'div',
  donenessUnlikelyHard: 'div', donenessBlockedSoft: 'div', donenessBlockedHard: 'div', donenessTicks: 'div',
  donenessBracket: 'div', donenessLikelyBand: 'div', donenessRange: 'span', donenessPeak: 'span', size: 'select',
  measureMass: 'input', measureGirth: 'input', measureMinor: 'input', unitMass: 'span', unitGirth: 'span',
  unitMinor: 'span', unitTemp: 'span', unitLitres: 'span', unitAltitude: 'span', startTempHint: 'p',
  startSousLabel: 'label', customTempField: 'div', customTemp: 'input', litres: 'input', eggCount: 'input',
  altitude: 'input', primary: 'button', probeWords: 'span', mainWords: 'span', primaryHintText: 'span',
  hintInfo: 'button', hintMore: 'p', secondary: 'button', stillOut: 'button', feedback: 'div', calibNote: 'p',
  learnedNote: 'p', forget: 'button', forgetInfo: 'button', forgetConfirm: 'div', forgetYes: 'button',
  forgetNo: 'button', exportResults: 'button', exportNote: 'p', shareSetting: 'input', shareNote: 'p', shareId: 'p',
  shareUid: 'span', appVersion: 'p', tabNote: 'section', useHere: 'button', shareDelete: 'button',
  shareConfirm: 'div', shareDeleteYes: 'button', shareDeleteNo: 'button', probeSetting: 'input', probeEntry: 'div',
  probeReading: 'input', unitProbe: 'span', probeSave: 'button', probeNote: 'p', feedbackTarget: 'p',
  roomTemp: 'input', unitRoom: 'span', roomFromField: 'div', roomTempFrom: 'input', unitRoomFrom: 'span',
  moreRoomFrom: 'p', bowlFields: 'div', bowlLitres: 'input', unitBowl: 'span', coolingWaterField: 'div',
  coolingWater: 'input', unitCoolingWater: 'span', moreCoolingWater: 'p', moreRoom: 'p', unitsPeriod: 'p',

  settingsForm: 'form', panelEgg: 'div', panelFrom: 'div', panelStart: 'div', panelCooling: 'div', settingsLink: 'a',
  actions: 'div', learned: 'section', tempRoom: 'input', startCold: 'input', startHot: 'input', startSous: 'input',
  coolIce: 'input', coolTap: 'input', coolBowl: 'input', coolCounter: 'input', coolEggCup: 'input',
  heatOff: 'input',
} as const satisfies Record<string, keyof HTMLElementTagNameMap | 'svg'>;

/** An element of the page, by its id. */
export type ElementId = keyof typeof ELEMENTS;

type Tagged<T> = T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : SVGSVGElement;
type Dom = { body: HTMLElement } & { [K in ElementId]: Tagged<(typeof ELEMENTS)[K]> };

/** Every element the code writes to. Null until `bindDom()`. */
let bound: Dom | null = null;

/** Find the page's elements. Once, at boot, before anything reads `page()`. */
export function bindDom(): void {
  const found: Record<string, Element> = { body: document.body };
  for (const [id, tag] of Object.entries(ELEMENTS)) {
    const node = document.getElementById(id);
    if (node === null || node.localName !== tag) throw new Error(`missing <${tag}> #${id}`);
    found[id] = node;
  }
  bound = found as Dom;
}

/** Every element the code writes to. Throws if called before `bindDom()`. */
export function page(): Dom {
  if (bound === null) throw new Error('page() before bindDom()');
  return bound;
}

function radios(name: string): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
  );
}

/** Words written where they say otherwise: a part of the page drawn each
 *  frame changes nothing until what it says does. */
export function setText(e: Element, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function selectRadio(name: string, value: string): void {
  for (const input of radios(name)) input.checked = input.value === value;
}

export function radioValue(name: string, fallback: string): string {
  for (const input of radios(name)) {
    if (input.checked) return input.value;
  }
  return fallback;
}
