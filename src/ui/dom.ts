/**
 * The page's elements, found once at boot, and the radio groups' helpers.
 *
 * Nothing here touches the document when the module is imported: the
 * elements are found by `bindDom()`, which `boot()` calls first, and read
 * through `page()`, which throws before then - so a test can import any
 * module that uses it, and a read before boot says so rather than reading
 * undefined.
 */

export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

/** An SVG element by id, which `el` cannot name: SVG is not HTML. */
function svgEl(id: string): SVGSVGElement {
  const node = document.getElementById(id);
  if (!(node instanceof SVGSVGElement)) throw new Error(`missing svg #${id}`);
  return node;
}

function findDom() {
  return {
    body: document.body,
    readout: el<HTMLElement>('readout'),
    phaseLabel: el<HTMLParagraphElement>('phaseLabel'),
    digits: el<HTMLSpanElement>('digits'),
    announce: el<HTMLSpanElement>('announce'),
    sublineText: el<HTMLSpanElement>('sublineText'),
    sublineInfo: el<HTMLButtonElement>('sublineInfo'),
    sublineMore: el<HTMLParagraphElement>('sublineMore'),
    direction: el<HTMLParagraphElement>('direction'),
    directionText: el<HTMLSpanElement>('directionText'),
    learning: el<HTMLParagraphElement>('learning'),
    learningInfo: el<HTMLButtonElement>('learningInfo'),
    whiteRisk: el<HTMLParagraphElement>('whiteRisk'),
    oddsInfo: el<HTMLButtonElement>('oddsInfo'),
    oddsWhy: el<HTMLDivElement>('oddsWhy'),
    advice: el<HTMLParagraphElement>('advice'),
    adviceList: el<HTMLUListElement>('adviceList'),
    forYou: el<HTMLDivElement>('forYou'),
    welcome: el<HTMLParagraphElement>('welcome'),
    helpSousVide: el<HTMLParagraphElement>('helpSousVide'),
    sentence: el<HTMLParagraphElement>('sentence'),
    eggSection: svgEl('eggSection'),
    cookSetup: el<HTMLElement>('cookSetup'),
    cookSentence: el<HTMLParagraphElement>('cookSentence'),
    cookDoneness: el<HTMLParagraphElement>('cookDoneness'),
    navBack: el<HTMLButtonElement>('navBack'),
    settingsTitle: el<HTMLElement>('settingsTitle'),
    helpTitle: el<HTMLElement>('helpTitle'),
    statBoil: el<HTMLElement>('statBoil'),
    note: el<HTMLParagraphElement>('note'),
    warn: el<HTMLParagraphElement>('warn'),
    mute: el<HTMLButtonElement>('mute'),
    doneness: el<HTMLInputElement>('doneness'),
    donenessOdds: el<HTMLDivElement>('donenessOdds'),
    donenessUnlikelySoft: el<HTMLDivElement>('donenessUnlikelySoft'),
    donenessUnlikelyHard: el<HTMLDivElement>('donenessUnlikelyHard'),
    donenessBlockedSoft: el<HTMLDivElement>('donenessBlockedSoft'),
    donenessBlockedHard: el<HTMLDivElement>('donenessBlockedHard'),
    donenessTicks: el<HTMLDivElement>('donenessTicks'),
    donenessBracket: el<HTMLDivElement>('donenessBracket'),
    donenessMedian: el<HTMLDivElement>('donenessMedian'),
    donenessRange: el<HTMLSpanElement>('donenessRange'),
    donenessPeak: el<HTMLSpanElement>('donenessPeak'),
    size: el<HTMLSelectElement>('size'),
    measureMass: el<HTMLInputElement>('measureMass'),
    measureGirth: el<HTMLInputElement>('measureGirth'),
    measureMinor: el<HTMLInputElement>('measureMinor'),
    unitMass: el<HTMLSpanElement>('unitMass'),
    unitGirth: el<HTMLSpanElement>('unitGirth'),
    unitMinor: el<HTMLSpanElement>('unitMinor'),
    unitTemp: el<HTMLSpanElement>('unitTemp'),
    unitLitres: el<HTMLSpanElement>('unitLitres'),
    unitAltitude: el<HTMLSpanElement>('unitAltitude'),
    startTempHint: el<HTMLParagraphElement>('startTempHint'),
    startSousLabel: el<HTMLLabelElement>('startSousLabel'),
    customTempField: el<HTMLDivElement>('customTempField'),
    customTemp: el<HTMLInputElement>('customTemp'),
    litres: el<HTMLInputElement>('litres'),
    eggCount: el<HTMLInputElement>('eggCount'),
    altitude: el<HTMLInputElement>('altitude'),
    primary: el<HTMLButtonElement>('primary'),
    primaryHintText: el<HTMLSpanElement>('primaryHintText'),
    hintInfo: el<HTMLButtonElement>('hintInfo'),
    hintMore: el<HTMLParagraphElement>('hintMore'),
    secondary: el<HTMLButtonElement>('secondary'),
    feedback: el<HTMLDivElement>('feedback'),
    calibNote: el<HTMLParagraphElement>('calibNote'),
    learnedNote: el<HTMLParagraphElement>('learnedNote'),
    forget: el<HTMLButtonElement>('forget'),
    forgetInfo: el<HTMLButtonElement>('forgetInfo'),
    forgetConfirm: el<HTMLDivElement>('forgetConfirm'),
    forgetYes: el<HTMLButtonElement>('forgetYes'),
    forgetNo: el<HTMLButtonElement>('forgetNo'),
    exportResults: el<HTMLButtonElement>('exportResults'),
    exportNote: el<HTMLParagraphElement>('exportNote'),
    shareSetting: el<HTMLInputElement>('shareSetting'),
    shareNote: el<HTMLParagraphElement>('shareNote'),
    shareId: el<HTMLParagraphElement>('shareId'),
    shareUid: el<HTMLSpanElement>('shareUid'),
    appVersion: el<HTMLParagraphElement>('appVersion'),
    shareDelete: el<HTMLButtonElement>('shareDelete'),
    shareConfirm: el<HTMLDivElement>('shareConfirm'),
    shareDeleteYes: el<HTMLButtonElement>('shareDeleteYes'),
    shareDeleteNo: el<HTMLButtonElement>('shareDeleteNo'),
    probeSetting: el<HTMLInputElement>('probeSetting'),
    probeEntry: el<HTMLDivElement>('probeEntry'),
    probeReading: el<HTMLInputElement>('probeReading'),
    unitProbe: el<HTMLSpanElement>('unitProbe'),
    probeSave: el<HTMLButtonElement>('probeSave'),
    probeNote: el<HTMLParagraphElement>('probeNote'),
    feedbackTarget: el<HTMLParagraphElement>('feedbackTarget'),
    roomField: el<HTMLDivElement>('roomField'),
    roomTemp: el<HTMLInputElement>('roomTemp'),
    unitRoom: el<HTMLSpanElement>('unitRoom'),
    moreRoom: el<HTMLParagraphElement>('moreRoom'),
    unitsPeriod: el<HTMLParagraphElement>('unitsPeriod'),
  };
}

export type Dom = ReturnType<typeof findDom>;

/** Every element the code writes to. Null until `bindDom()`. */
let bound: Dom | null = null;

/** Find the page's elements. Once, at boot, before anything reads `page()`. */
export function bindDom(): void {
  bound = findDom();
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

export function selectRadio(name: string, value: string): void {
  for (const input of radios(name)) input.checked = input.value === value;
}

export function radioValue(name: string, fallback: string): string {
  for (const input of radios(name)) {
    if (input.checked) return input.value;
  }
  return fallback;
}
