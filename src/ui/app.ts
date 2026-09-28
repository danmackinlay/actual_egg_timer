/**
 * The application: inputs -> solver -> readout, and the cook itself.
 *
 * The app is the timer. It measures the time to a rolling boil rather than
 * asking the user to stopwatch it elsewhere, which is the one measurement the
 * model cannot guess and the user cannot be bothered to take separately.
 *
 * While a cook is running the inputs are hidden (styles.css), so everything on
 * screen describes the cook that was started, not one the user is composing.
 * That is what lets the machine's deadlines and the solver's readout be
 * derived from the same settings without reconciling them mid-cook.
 */

import {
  Egg, SizeTable, eggFromMass, eggFromMinorDiameter, sizeClassesFor, sizeTableFor,
} from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C, sousVideEstimate } from '../core/sousvide.js';
import {
  Measure, Quantity, UnitSystem, chooseUnits, displayText, parse, sizeClassLabel,
} from '../core/units.js';
import {
  DONENESS_ANCHORS, Solution, donenessFromSlider, solveCookTime,
} from '../core/solve.js';
import {
  DEFAULTS, SLIDER_STEPS, Verdict, ambientFor, anchorNear, coolingSecondsFor,
  plausibleProbeRange_C, probeMomentFor, targetPeakYolk_C, textureFor, textureNoteKeys,
} from '../core/policy.js';
import { Feedback, WhiteReport } from '../core/infer.js';
import { EggFrom, MassFrom, ProbeReading, recordCookTime_s, recordProbe_C } from '../core/record.js';
import {
  Decision, DecisionInputs, carriedSolution, decide, decidedSolution, decisionInputs,
} from '../core/decide.js';
import {
  OddsProfile, REACH_ODDS, adviceWanted, pricedChanges, protocolAdvice, shadingOf, verdictWithOdds,
} from '../core/reach.js';
import { Outcome, predictOutcome } from '../core/outcome.js';
import {
  Calibration, cachedDecisionGrid, cachedOddsProfile, calibrationDoneness, calibrationParams,
  clearCalibration, decisionGrid, decisionKey, eggRecordFor, eggsBehind, learn, loadCalibration,
  logEgg, oddsProfileFor, profileKey, recordSecondAnswer,
} from './calibration.js';
import {
  LIMITS, Limit, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber,
  clearBoilMemory, clearCook, estimateTimeToBoil, hasBoilMemory, loadBoilMemory,
  loadCook, loadSettings, rememberTimeToBoil, saveCook, saveSettings,
} from './store.js';
import { sousVideCopy } from './sousvide.js';
import { directionKey, rangeWords, restoreOutcome, whiteAtRisk } from './outcome.js';
import { activeLocale, applyCopy, switchCopy, t } from './copy.js';
import { formatClock, spokenClock } from './countdown.js';
import {
  REGION, REGIONAL_UNITS, UNITS_FLIP_EVENT, UnitsFlipDetail, announceFlip, measure, show, unitSystem,
  useUnits,
} from './units.js';
import { languageOf } from '../core/format.js';
import {
  LANGUAGES, LanguageState, effectiveLanguage, languageAfterFlip, languageAfterPick,
} from '../core/language.js';
import {
  Machine, advance, beginCooling, coolingStartsIn_s, idleMachine, recordBoil, restoreMachine,
  reviseProvisional, secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull,
  startCold, startHot,
} from './machine.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, setMuted, startTicker,
  stopAlarm,
} from './clock.js';

/* ------------------------------------------------------------------- DOM */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

const dom = {
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
  whiteRisk: el<HTMLParagraphElement>('whiteRisk'),
  oddsInfo: el<HTMLButtonElement>('oddsInfo'),
  oddsWhy: el<HTMLDivElement>('oddsWhy'),
  advice: el<HTMLParagraphElement>('advice'),
  adviceList: el<HTMLUListElement>('adviceList'),
  forYou: el<HTMLDivElement>('forYou'),
  welcome: el<HTMLParagraphElement>('welcome'),
  helpSousVide: el<HTMLParagraphElement>('helpSousVide'),
  sentence: el<HTMLParagraphElement>('sentence'),
  cookSetup: el<HTMLElement>('cookSetup'),
  cookSentence: el<HTMLParagraphElement>('cookSentence'),
  cookDoneness: el<HTMLParagraphElement>('cookDoneness'),
  navBack: el<HTMLButtonElement>('navBack'),
  kitchenTitle: el<HTMLElement>('kitchenTitle'),
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
  probeSetting: el<HTMLInputElement>('probeSetting'),
  probeOffer: el<HTMLDivElement>('probeOffer'),
  probeOfferYes: el<HTMLButtonElement>('probeOfferYes'),
  probeOfferNo: el<HTMLButtonElement>('probeOfferNo'),
  probeEntry: el<HTMLDivElement>('probeEntry'),
  probeReading: el<HTMLInputElement>('probeReading'),
  unitProbe: el<HTMLSpanElement>('unitProbe'),
  probeSave: el<HTMLButtonElement>('probeSave'),
  probeNote: el<HTMLParagraphElement>('probeNote'),
  unitsPeriod: el<HTMLParagraphElement>('unitsPeriod'),
};

function radios(name: string): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
  );
}

function selectRadio(name: string, value: string): void {
  for (const input of radios(name)) input.checked = input.value === value;
}

function radioValue(name: string, fallback: string): string {
  for (const input of radios(name)) {
    if (input.checked) return input.value;
  }
  return fallback;
}

/* ----------------------------------------------------------------- state */

/** The carton's size classes, by the browser's region (`REGION`, in units.ts)
 *  alone: not the language, and not the units - an American carton is an
 *  American carton in grams too. Fixed for the life of the page. A stored
 *  index is read against it, and keeps its name if the region has changed
 *  since it was saved. */
const sizeClasses = sizeClassesFor(REGION);
/** The same table by name, for the record: a Large is 68 g in one and 60.2 g in
 *  the other. */
const sizeTable = sizeTableFor(REGION);

let settings: Settings = loadSettings(sizeClasses);
useUnits(settings.unitsChosen);
let boilMemory = loadBoilMemory();
/** Posterior over the model's uncertain constants, learned from how the user's
 *  own eggs actually turn out. Before any feedback this is the prior mean,
 *  i.e. the literature values. */
let calib: Calibration = loadCalibration();
let machine: Machine = idleMachine(settings.cooling);
let solution: Solution | null = null;
/** The choice behind the time on screen while idle (E5): the odds, "still
 *  learning", and how far it leaned from the mean solve. Null until the
 *  setup's decision surface has been built, and on the sous-vide screen. */
let decision: Decision | null = null;
/** What the egg at the chosen time will be like (src/core/outcome.ts): the
 *  direction sentence, the white's line and the bracket under the slider.
 *  Read at the decided time on the same surface, whenever `decision` is, and
 *  null whenever it is. */
let outcome: Outcome | null = null;
/** The readout's height, px, the last time it was drawn idle with a decision
 *  in: what it holds while the next one is on its way (`renderOdds`). */
let settledReadout_px = 0;
/** A decision surface waiting for the inputs to settle before it is asked for. */
let decisionHandle = 0;
/** The odds at every level for the pot on screen and the posterior as it
 *  stands (reach.ts): the track's shading, and the range the slider offers.
 *  Null until it has been worked out, which follows the pot's surface; until
 *  then the physical limits are the whole rule, as they were before. */
let profile: OddsProfile | null = null;
/** Profiles asked for and not yet in, by key, so each lands once. */
const profilesAsked = new Set<string>();
/** Set when the requested doneness had to be clamped; empty otherwise. */
let refusal = '';
/** What the running cook is, frozen at the moment it started.
 *
 *  The calibration must learn from the egg that was actually cooked, not from
 *  whatever the controls happen to say when the user gets round to answering
 *  how the egg was - which may be after a reload, and is certainly after the
 *  measured time to boil has replaced the guess. Everything the posterior
 *  update needs is captured here and nowhere else. */
let ticket: Ticket | null = null;
let ticker: Ticker | null = null;
let solveHandle = 0;
let saveHandle = 0;
let lastRevise_ms = 0;
let lastAnnounced = '';
/** True while the cook on screen is one that was picked back up after a reload.
 *  Cleared when that cook ends or is cancelled: it is a fact about a particular
 *  cook, not about the tab, and left set it would caption every later cook with
 *  a reload that had nothing to do with it. */
let restored = false;
/** Whether this egg has been written down with an answer. Persisted with the
 *  cook, so a reload neither asks again nor logs the egg a second time as
 *  unanswered. */
let feedbackGiven = false;
/** Which of the two questions have been answered on screen, whether a probe
 *  reading has been taken (E4), and the egg's place in the log once the first
 *  of them has written it down. Not persisted: after a reload the rest are not
 *  offered again, because the surface their answers would be folded against is
 *  gone (see `recordSecondAnswer`). An unanswered question stays a skip in the
 *  record. */
let answered: {
  yolk: Feedback | null; white: WhiteReport | null; probe: ProbeReading | null; index: number;
} | null = null;

/** The same cook, against a time to boil that is now known rather than
 *  guessed. Everything else about it is frozen. */
function withTimeToBoil(t: Ticket, timeToBoil_s: number): Ticket {
  return { ...t, setup: { ...t.setup, timeToBoil_s: timeToBoil_s } };
}

/** The cook that was started: the only thing the calibration is allowed to
 *  learn from. */
interface Ticket {
  egg: Egg;
  /** Which input the egg came from, whose carton if it was a class, and where
   *  its temperature came from. */
  massFrom: MassFrom;
  sizeTable: SizeTable | null;
  eggFrom: EggFrom;
  /** Whether the pan's time to boil was on file at "Eggs in": what a hot start,
   *  which never times its own pan, cooked on. */
  boilRemembered: boolean;
  setup: CookSetup;
  /** log10 of the yolk dose this cook was RUN at. Frozen with everything else,
   *  so a slider left somewhere else afterwards cannot rewrite history. */
  logNominalTarget: number;
  /** The system the cook was reading when they set this egg up, for the
   *  record. Everything above is SI whatever it says. */
  units: UnitSystem;
  /** How far the choice leaned from the mean solve at "Eggs in", s (E5),
   *  carried onto a mid-cook re-solve (`carriedSolution`). Zero when the time
   *  was not chosen. */
  lean_s: number;
  /** What the egg was likely to be like at "Eggs in", shown for the whole
   *  cook. Null when the time was started before the odds were known. (The
   *  ticket once also carried the odds in tenths and "still learning"; nothing
   *  read them, and a saved cook that still has them is read without them.) */
  outcome: Outcome | null;
  /** The peak yolk the cook was started with, C: what the line under the
   *  running cook's sentence says. Null in a ticket written before it was
   *  kept. */
  peakYolk_C: number | null;
  /** The language they were reading it in, for the record. */
  lang: string;
  /** Whether this cook has a moment to probe at (E4): a counted cooling that
   *  ends when the yolk's centre peaks. Frozen with the cook, and moved only
   *  by the re-solve at the boil. */
  probeMoment: boolean;
}

/* --------------------------------------------------------------- physics */

function currentEgg(): Egg {
  if (settings.sizeIndex < 0 || settings.sizeIndex >= sizeClasses.length) {
    return eggFromMinorDiameter(settings.customMinor_mm / 1000);
  }
  return eggFromMass(sizeClasses[settings.sizeIndex].mass_kg);
}

/** Which input the egg on screen came from: the size class, or whichever of the
 *  three measurements was typed in last. They all end up as one diameter, so
 *  this is the only place the difference survives - and it is the egg-level
 *  noise the fit needs (a class is a 10 g bucket; a scale is a gram). */
function massFrom(): MassFrom {
  if (settings.sizeIndex >= 0 && settings.sizeIndex < sizeClasses.length) return 'class';
  return settings.measuredBy;
}

/** The three ways a person can measure an egg are one number in three units.
 *  The model egg's equator is a circle, so girth = pi * B exactly; mass goes
 *  through the same ovoid volume the solver uses (V = k_v * ratio * B^3), so
 *  nothing here is a second opinion about the geometry. */
function minorFromGirth_mm(girth_mm: number): number {
  return girth_mm / Math.PI;
}

function minorFromMass_mm(mass_g: number): number {
  return eggFromMass(mass_g / 1000).minorDiameter_m * 1000;
}

/** Rewrite whichever measurement boxes the user is not currently typing in, so
 *  filling in one fills in the rest without the field fighting the cursor.
 *  That exception is half of the round trip: the box being typed in keeps what
 *  was typed, and the others show the stored egg rounded to their step. */
function syncMeasurements(except: EventTarget | null): void {
  const egg = currentEgg();
  const minor_mm = egg.minorDiameter_m * 1000;
  if (except !== dom.measureMass) dom.measureMass.value = inputText('mass', egg.mass_kg * 1000);
  if (except !== dom.measureGirth) dom.measureGirth.value = inputText('girth', Math.PI * minor_mm);
  if (except !== dom.measureMinor) dom.measureMinor.value = inputText('width', minor_mm);
}

/* ------------------------------------------------------------------ units */

/** A stored SI value as an input's contents: the displayed number, without
 *  the trailing zeros a readout keeps ("2", not "2.00"). */
function inputText(q: Quantity, si: number): string {
  const text = displayText(measure(q), si);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** What a field says, in SI and clamped, or `fallback` while it holds no
 *  number. Only ever called for the field the cook is editing: re-reading a
 *  field nobody touched would re-parse a rounded display back over the stored
 *  value, and that is the drift the round trip exists to prevent. */
function readField(input: HTMLInputElement, q: Quantity, fallback: number): number {
  if (input.value.trim() === '') return fallback;
  return parse(measure(q), Number(input.value)) ?? fallback;
}

/** An input's step and bounds, in the units on screen. The bounds are the SI
 *  limits rounded inward to the step, so every value the input allows is one
 *  the model does too. */
function applyMeasure(input: HTMLInputElement, label: HTMLElement, m: Measure): void {
  input.step = String(m.step);
  if (m.bounds !== null) {
    input.min = String(m.bounds.lo);
    input.max = String(m.bounds.hi);
  }
  label.textContent = t(m.unitKey);
}

/** The cook picks a system. Stored as their choice, and announced if it
 *  changes what is on screen - see `UNITS_FLIP_EVENT`. */
function onUnits(next: UnitSystem): void {
  const choice = chooseUnits(settings.unitsChosen, REGIONAL_UNITS, next);
  settings.unitsChosen = choice.chosen;
  useUnits(settings.unitsChosen);
  saveNow();
  applyUnitsToDom();
  recompute();
  if (choice.flip !== null) announceFlip(choice.flip);
}

function eggStart_C(): number {
  if (settings.startTempMode === 'custom') return settings.customStart_C;
  return START_TEMP_PRESETS_C[settings.startTempMode];
}

/** The room, as far as the model is concerned. The rule - an egg that has been
 *  sitting out IS the room, a fridge egg says nothing - is core policy. */
function ambient_C(): number {
  return ambientFor(eggStart_C());
}

function boilingPoint_C(): number {
  return boilingPointAtAltitude(settings.altitude_m);
}

/** What the solver is told. The Start control has three positions; the model
 *  has two. Sous-vide is answered by src/core/sousvide.ts instead, so as far as
 *  the cook solver is concerned it is an egg going into water already hot. */
function coreStartMode(): StartMode {
  return settings.startMode === 'cold' ? 'cold' : 'hot';
}

function isSousVide(): boolean {
  return settings.startMode === 'sous';
}

/** What the solver is told about the POT. The egg is a separate argument
 *  everywhere the core takes both, so there is no mass here to keep in step. */
function buildSetup(timeToBoil_s: number): CookSetup {
  return {
    startMode: coreStartMode(),
    afterBoil: settings.afterBoil,
    eggStart_C: eggStart_C(),
    ambient_C: ambient_C(),
    boiling_C: boilingPoint_C(),
    timeToBoil_s: timeToBoil_s,
    cooling: settings.cooling,
    waterLitres: settings.waterLitres,
    eggCount: settings.eggCount,
  };
}

/** Time to a rolling boil, s - the pan's one measured number, and the one
 *  thing the solver needs that the settings do not hold.
 *
 *  Before a cook it is remembered or guessed. Once a cold start is under way
 *  the machine carries it: the guess, then the revision if the hob is slow,
 *  then the measurement when the boil is tapped. It is the length of a cold
 *  start's ramp and nothing more. A hot start never times it and the physics
 *  never reads it there - with the heat off the pan's cooling comes from the
 *  water volume (see panTimeConstant) - but the setup still carries the
 *  remembered value, so the record can say which pan was assumed. */
function timeToBoil_s(): number {
  if (machine.phase !== 'IDLE' && startModeNow() === 'cold') return machine.assumedBoil_s;
  return estimateTimeToBoil(boilMemory, settings.waterLitres);
}

/** How much of the clock the ramp takes: all of the time to boil on a cold
 *  start, none of it otherwise. */
function rampSeconds(): number {
  return startModeNow() === 'cold' ? timeToBoil_s() : 0;
}

/** The pot of the cook under way: the ticket's, frozen at "Eggs in", and never
 *  the controls', which another tab may have changed since. Null while idle. */
function runningSetup(): CookSetup | null {
  return machine.phase !== 'IDLE' && ticket !== null ? ticket.setup : null;
}

/** How the cook on screen starts: the running cook's, or the controls'. */
function startModeNow(): UiStartMode {
  return runningSetup()?.startMode ?? settings.startMode;
}

/* ------------------------------------------------------------------ copy */

/** The refusal, in words.
 *
 * The DECISION - which refusal applies, where the slider must move to, and
 * whether the gap is big enough to be worth a sentence at all - is
 * `verdictFor` in the core, so that this app and the iOS app cannot refuse
 * differently. What is left here is the sentence, which is this app's own: the
 * point is to teach the constraint, not merely to block the control.
 */
function refusalText(v: Verdict): string {
  if (!v.worthSaying) return '';
  const limit = t(v.limit.key).toLowerCase();

  if (v.kind === 'whiteNeverSets') return t('refusal.whiteNeverSets');

  // The pan could, but the odds say it would rarely come out right (reach.ts).
  if (v.kind === 'unlikelySoft' || v.kind === 'unlikelyHard') {
    return t(v.kind === 'unlikelySoft' ? 'refusal.unlikelySoft' : 'refusal.unlikelyHard', {
      hits: Math.round(REACH_ODDS * 10), of: 10, limit: limit,
    });
  }

  if (v.kind === 'harderThanPanReaches') {
    return t('refusal.harderThanPan', {
      water: show('water', settings.waterLitres), limit: limit,
    });
  }

  if (settings.cooling === 'counter') return t('refusal.counter', { limit: limit });
  if (settings.cooling === 'tap') return t('refusal.tap', { limit: limit });
  return t('refusal.ice', { limit: limit });
}

/* --------------------------------------------------------------- solving */

/** A solve and what it implies, with nothing done about it yet.
 *
 * Splitting this out is the point: `solve()` used to solve, write a
 * module-level refusal string, move the slider, write the DOM and save to
 * localStorage, all from one function that the ticker and the boil tap both
 * called - so a slow hob could silently move the user's doneness mid-cook.
 * Deciding and acting are now two steps, and only the idle path takes the
 * second one. */
interface Answer {
  solution: Solution;
  verdict: Verdict;
  /** The level the solution is for: the one asked, or the one it snapped to. */
  level: number;
}

/** Solve for the given inputs. Pure apart from reading `settings`: it moves
 *  nothing and writes nothing.
 *
 *  `snapRetry` is false for a cook already under way: the target is frozen, so
 *  re-solving at a snapped position would answer for an egg nobody is cooking. */
function answerFor(
  timeToBoil_s: number, level: number, snapRetry = true, odds: OddsProfile | null = null,
): Answer {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const params = calibrationParams(calib);
  const result = solveCookTime(egg, setup, params, calibrationDoneness(calib, level));
  // With this pot's odds in, the slider's ends are where they reach 3/10
  // (reach.ts); without them, or with none that high, where the pan reaches.
  const verdict = verdictWithOdds(result, level, odds);

  // Re-solve at the position the user is actually being offered, so the
  // numbers on screen are the numbers for that cook rather than for one that
  // was refused. Only worth it when the slider is going to move.
  if (snapRetry && verdict.snapTo !== null) {
    const retry = solveCookTime(egg, setup, params, calibrationDoneness(calib, verdict.snapTo));
    if (retry.reachable) return { solution: retry, verdict: verdict, level: verdict.snapTo };
  }
  return { solution: result, verdict: verdict, level: level };
}

/**
 * The time chosen for an answer (E5, src/core/decide.ts), if this pot's
 * decision surface has been built - and if it has not, the mean solve's time,
 * with the surface asked for once the inputs settle.
 *
 * The surface does not depend on the slider, so a drag is answered from the one
 * already built, and the time never jumps between the mean solve's and the
 * chosen one mid-drag. It changes once, when a new pot's surface lands.
 */
function decided(
  answer: Answer, timeToBoil_s: number,
): { solution: Solution; decision: Decision | null; outcome: Outcome | null } {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const inputs = decisionInputs(calib, egg, setup);
  const grid = cachedDecisionGrid(inputs);
  if (grid === null) {
    askForDecision(inputs);
    return { solution: answer.solution, decision: null, outcome: null };
  }
  // The odds at every level follow the surface, in the worker.
  if (cachedOddsProfile(inputs, calib) === null) askForProfile(inputs);
  const logTarget = Math.log10(donenessFromSlider(answer.level).yolkDose_min);
  const d = decide(calib, grid, answer.solution, logTarget);
  return {
    solution: decidedSolution(egg, setup, calibrationParams(calib), answer.solution, d),
    decision: d,
    // What that time will give, on the same surface: about 2 ms beside the
    // decision's 13-16, so it runs here with it rather than in the worker.
    outcome: predictOutcome(calib.posterior, grid, d.cookTime_s, logTarget),
  };
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** Ask the worker for this pot's surface once the inputs have settled, and
 *  re-solve when it lands if the pot on screen is still the one it was for. */
function askForDecision(inputs: DecisionInputs): void {
  if (decisionHandle !== 0) window.clearTimeout(decisionHandle);
  decisionHandle = window.setTimeout(() => {
    decisionHandle = 0;
    const key = decisionKey(inputs);
    decisionGrid(inputs).then(() => {
      if (machine.phase !== 'IDLE' || isSousVide()) return;
      const now = decisionKey(decisionInputs(calib, currentEgg(), buildSetup(timeToBoil_s())));
      if (now === key) recompute();
    }, (error: unknown) => console.warn('decision surface failed', error));
  }, DECISION_SETTLE_MS);
}

/** The pot on screen as a decision's inputs: what its surface and its odds
 *  profile are keyed by. */
function currentInputs(timeToBoil_s: number): DecisionInputs {
  return decisionInputs(calib, currentEgg(), buildSetup(timeToBoil_s));
}

/** The profiles the screen wants now: this pot's, and those of the changes
 *  the advice would price (`pricedChanges`). */
function wantedProfileKeys(): Set<string> {
  const inputs = currentInputs(timeToBoil_s());
  const keys = new Set<string>([profileKey(inputs, calib)]);
  for (const change of pricedChanges(inputs.setup)) {
    keys.add(profileKey(decisionInputs(calib, inputs.egg, change.setup), calib));
  }
  return keys;
}

/** Ask the worker for the odds at every level for these inputs - after their
 *  surface, which it builds first if need be - and take them up when they land,
 *  if the screen still wants them. */
function askForProfile(inputs: DecisionInputs): void {
  const key = profileKey(inputs, calib);
  if (profilesAsked.has(key)) return;
  profilesAsked.add(key);
  // The key is cleared whether the profile lands or fails, so a failed one
  // is asked for again the next time the screen wants it.
  oddsProfileFor(inputs, calib).then(() => {
    profilesAsked.delete(key);
    if (machine.phase !== 'IDLE' || isSousVide()) return;
    if (wantedProfileKeys().has(key)) recompute();
  }, (error: unknown) => {
    profilesAsked.delete(key);
    console.warn('odds profile failed', error);
  });
}

/** Take the answer up: show the refusal, and move the slider if the answer
 *  says it must. Only ever called while idle - once the egg is in the water
 *  the controls are gone and there is nothing to snap. */
function applyAnswer(answer: Answer): Solution {
  refusal = refusalText(answer.verdict);
  const snapTo = answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== settings.doneness) {
    settings.doneness = snapTo;
    dom.doneness.value = String(snapTo);
    saveNow();
  }
  return answer.solution;
}

/* --------------------------------------------------------------- display */

/** The texture note. Which band the egg falls in, and which keys say it, are
 *  core policy - including that a white the pan never sets is runny, which
 *  this app used to decide here, and iOS did not decide at all. */
function textureNote(sol: Solution): string {
  const note = textureNoteKeys(textureFor(sol.result.peakYolk_C, sol.result.peakWhite_C, sol.whiteSets));
  const parts: Record<string, string> = {};
  for (const [name, key] of Object.entries(note.parts)) parts[name] = t(key);
  return t(note.key, parts);
}

/** The slider's reading: at the end of its heading, the peak yolk the level
 *  asks for, and to a screen reader, as the slider's value, the doneness word
 *  with it. The word is not drawn again: it is on the ticks. In sous-vide there
 *  is no peak, and the water's temperature is said instead, so the reading
 *  says which number it is. The same shape whether the temperature is the
 *  solver's or the quick interpolation that tracks the thumb, so it does not
 *  flicker between two formats mid-drag. */
function renderDonenessReading(reading: { peakYolk_C: number } | { bath_C: number }): void {
  const doneness = t(anchorNear(settings.doneness).key);
  if ('bath_C' in reading) {
    const bath = show('temperature', reading.bath_C);
    dom.donenessPeak.textContent = t('controls.doneness.bath', { bath: bath });
    dom.doneness.setAttribute('aria-valuetext', t('controls.doneness.valueBath', { doneness: doneness, bath: bath }));
    return;
  }
  const yolk = show('temperature', reading.peakYolk_C);
  dom.donenessPeak.textContent = t('controls.doneness.peak', { yolk: yolk });
  dom.doneness.setAttribute('aria-valuetext', t('controls.doneness.value', { doneness: doneness, yolk: yolk }));
}

/** Stripe out the parts of the track this setup cannot deliver: the soft end
 *  the white forbids, and - with the heat off - the hard end the pan cannot
 *  reach. If the white never sets there is nothing to offer, and the whole
 *  track says so. */
function renderDonenessScale(sol: Solution): void {
  const softest = sol.whiteSets ? sol.softestLevel : 1;
  const hardest = sol.whiteSets ? sol.hardestLevel : 0;
  dom.donenessBlockedSoft.style.width = `${percent(softest)}%`;
  dom.donenessBlockedHard.style.width = `${percent(1 - hardest)}%`;

  // The odds at each level, relative to the best level's, and the levels the
  // pan can deliver but the odds do not offer yet (reach.ts). Only while
  // idle: once a cook is running the slider is put away.
  const odds = machine.phase === 'IDLE' && sol.whiteSets ? profile : null;
  renderOddsBand(odds);
  const offeredSoft = odds !== null && odds.softest !== null ? odds.softest : softest;
  const offeredHard = odds !== null && odds.hardest !== null ? odds.hardest : hardest;
  const refusing = odds !== null && odds.softest !== null && odds.hardest !== null;
  placeBand(dom.donenessUnlikelySoft, refusing ? odds.physicalSoftest : 0, refusing ? offeredSoft : 0);
  placeBand(dom.donenessUnlikelyHard, refusing ? offeredHard : 0, refusing ? odds.physicalHardest : 0);
  renderBracket(machine.phase === 'IDLE' && sol.whiteSets ? outcome : null);

  const ticks = dom.donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    const anchor = DONENESS_ANCHORS[i];
    if (anchor === undefined) continue;
    const blocked = anchor.level < Math.max(softest, offeredSoft) - 0.005
      || anchor.level > Math.min(hardest, offeredHard) + 0.005;
    ticks[i].classList.toggle('blocked', blocked);
  }
}

/** The likely range of the yolk under the track, from the outcome's 10% to
 *  its 90% point, with a mark at its middle; and the same in words for a
 *  screen reader, each end as the nearest doneness word. Nothing without an
 *  outcome: no decision yet, no white, sous-vide, or a cook under way. */
function renderBracket(o: Outcome | null): void {
  dom.donenessBracket.hidden = o === null;
  if (o === null) {
    dom.donenessRange.textContent = '';
    return;
  }
  placeBand(dom.donenessBracket, o.levelLow, o.levelHigh);
  const span = o.levelHigh - o.levelLow;
  const middle = span > 0 ? (o.levelMedian - o.levelLow) / span : 0.5;
  dom.donenessMedian.style.left = `${clampNumber(middle * 100, { lo: 0, hi: 100 }, 50)}%`;
  const words = rangeWords(o);
  const args: Record<string, string> = {};
  for (const [name, key] of Object.entries(words.args)) args[name] = t(key);
  dom.donenessRange.textContent = t(words.key, args);
}

/** A level as a percentage of the track, clamped. */
function percent(level: number): number {
  return clampNumber(level * 100, { lo: 0, hi: 100 }, 0);
}

/** Lay a band over the track from one level to another; nothing when the
 *  second is not past the first. */
function placeBand(band: HTMLElement, from: number, to: number): void {
  band.style.left = `${percent(from)}%`;
  band.style.width = `${to > from ? percent(to) - percent(from) : 0}%`;
}

/** Shade the track by the odds (`shadingOf`): the band's hue is the yolk's,
 *  runny to hard (styles.css), and this masks it to an opacity that is the
 *  level's odds over the best level's, stop by stop between the profile's
 *  points, and clear outside them, where the stripes are. */
function renderOddsBand(odds: OddsProfile | null): void {
  const shades = odds === null ? [] : shadingOf(odds);
  let mask = 'linear-gradient(transparent, transparent)';
  if (shades.length > 0) {
    const first = shades[0].level * 100;
    const last = shades[shades.length - 1].level * 100;
    const stops = shades.map((s) => (
      `rgb(0 0 0 / ${s.strength.toFixed(3)}) ${(s.level * 100).toFixed(2)}%`
    ));
    mask = `linear-gradient(to right, transparent ${first.toFixed(2)}%, `
      + `${stops.join(', ')}, transparent ${last.toFixed(2)}%)`;
  }
  dom.donenessOdds.style.setProperty('-webkit-mask-image', mask);
  dom.donenessOdds.style.setProperty('mask-image', mask);
}

/** The way to Help under low odds (reach.ts): a link, shown while idle when
 *  the odds at the level on screen are under 5/10 or 3/10 short of the best
 *  level's. It opens Help at its reliability section, whose top lists the
 *  changes that would help this setup: the model prices a counter rest and
 *  the heat off from their own pots' profiles, asked for here and shown when
 *  they land; the fridge and the scale it cannot price. */
let adviceShown = '';
function renderAdvice(): void {
  let keys: string[] = [];
  const wanted = machine.phase === 'IDLE' && !isSousVide() && decision !== null && solution !== null
    && solution.whiteSets && adviceWanted(decision.oddsTenths, profile);
  if (wanted && decision !== null) {
    const inputs = currentInputs(timeToBoil_s());
    const priced: { key: string; profile: OddsProfile }[] = [];
    for (const change of pricedChanges(inputs.setup)) {
      const changed = decisionInputs(calib, inputs.egg, change.setup);
      const p = cachedOddsProfile(changed, calib);
      if (p === null) askForProfile(changed);
      else priced.push({ key: change.key, profile: p });
    }
    keys = protocolAdvice(
      inputs.setup, { eggFromClass: massFrom() === 'class', startAssumed: settings.startTempMode === 'room' },
      settings.doneness, decision.odds, priced,
    );
  }
  dom.advice.hidden = !wanted;
  dom.forYou.hidden = keys.length === 0;
  const shown = keys.join(' ');
  if (shown === adviceShown) return;
  adviceShown = shown;
  dom.adviceList.replaceChildren(...keys.map((key) => {
    const li = document.createElement('li');
    li.textContent = t(key);
    return li;
  }));
}

/* ------------------------------------------------------------------- (i) */

/** The paragraph an (i) opens: the element its aria-controls names. */
function infoPanel(button: HTMLButtonElement): HTMLElement | null {
  const id = button.getAttribute('aria-controls');
  return id === null ? null : document.getElementById(id);
}

/** Open or close an (i)'s paragraph in place. */
function toggleDisclosure(button: HTMLButtonElement): void {
  const panel = infoPanel(button);
  if (panel === null) return;
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.hidden = !open;
}

/** Show or hide an (i) with what it describes. Its paragraph follows it:
 *  hidden with it, and shown again only if it was left open. */
function showInfo(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
  const panel = infoPanel(button);
  if (panel !== null) panel.hidden = !visible || button.getAttribute('aria-expanded') !== 'true';
}

/**
 * Every (i) on the page, one component (UI.md section 4). Its name to a
 * screen reader is "About {label}", with the label its control shows
 * (`data-label`), or a whole name of its own (`data-name`) where a label will
 * not read inside that. Its paragraph is filled by `applyCopy` from the
 * `data-copy` on the element it controls.
 */
function wireInfoButtons(): void {
  labelInfoButtons();
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button.info'))) {
    button.addEventListener('click', () => toggleDisclosure(button));
  }
}

/** Each (i)'s name, in the language on screen. Again whenever it changes. */
function labelInfoButtons(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button.info'))) {
    const name = button.dataset['name'];
    const label = button.dataset['label'];
    if (name !== undefined) button.setAttribute('aria-label', t(name));
    else if (label !== undefined) button.setAttribute('aria-label', t('more.about', { label: t(label) }));
  }
}

/* ------------------------------------------------------------ the sentence */

type Clause = 'egg' | 'from' | 'start' | 'cooling';

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
interface SetupFacts {
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
function classMass(index: number): string {
  const label = sizeClassLabel(sizeClasses[index], unitSystem());
  return t(label.mass.key, { value: label.mass.value });
}

/** The setup on the controls. */
function liveSetupFacts(): SetupFacts {
  const byClass = settings.sizeIndex >= 0 && settings.sizeIndex < sizeClasses.length;
  return {
    mass: byClass ? classMass(settings.sizeIndex) : show('mass', currentEgg().mass_kg * 1000),
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
function ticketSetupFacts(k: Ticket): SetupFacts {
  const index = k.massFrom === 'class' ? sizeClasses.findIndex((c) => c.mass_kg === k.egg.mass_kg) : -1;
  return {
    mass: index >= 0 ? classMass(index) : show('mass', k.egg.mass_kg * 1000),
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
  const mass = f.mass;
  const custom = show('eggTemp', f.customStart_C);
  const bath = show('temperature', SOUS_VIDE_BATH_C);
  const from = f.eggFrom === 'fridge'
    ? { text: t('setup.from.fridge'), value: t('controls.eggFrom.fridge') }
    : f.eggFrom === 'room'
      ? { text: t('setup.from.room'), value: t('controls.eggFrom.room') }
      : { text: t('setup.from.custom', { temp: custom }), value: custom };
  // The start clause carries the boil, and the standing when the heat goes
  // off: "into cold water" alone reads as if the eggs never boil.
  const standing = f.standing;
  const start = f.startMode === 'cold'
    ? { text: t(standing ? 'setup.start.coldStanding' : 'setup.start.cold'), value: t('controls.start.cold') }
    : f.startMode === 'hot'
      ? { text: t(standing ? 'setup.start.hotStanding' : 'setup.start.hot'), value: t('controls.start.hot') }
      : { text: t('setup.start.sous', { bath: bath }), value: t('controls.start.sousVide', { bath: bath }) };
  const cooling = f.cooling === 'ice'
    ? { text: t('setup.cooling.ice'), value: t('controls.then.ice') }
    : f.cooling === 'tap'
      ? { text: t('setup.cooling.tap'), value: t('controls.then.tap') }
      : { text: t('setup.cooling.counter'), value: t('controls.then.counter') };
  return {
    egg: { text: t('setup.egg', { mass: mass }), label: t('controls.egg'), value: mass },
    from: { ...from, label: t('controls.eggFrom') },
    start: { ...start, label: t('controls.start') },
    cooling: { ...cooling, label: t('controls.cooling') },
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
function renderSentence(): void {
  const texts = clauseTexts(liveSetupFacts());
  const key = isSousVide() ? 'setup.sentenceSousVide' : 'setup.sentence';
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

/** The cook in the pan, once the controls are gone (owner, 28 September): the
 *  setup sentence it was started with, so a forgetful cook can see what they
 *  promised, as plain prose - nothing in it can change a cook under way, so
 *  nothing in it is a button - and under it what the sentence does not say,
 *  the doneness and the peak yolk it was started at. From the ticket, never
 *  the controls. Sous-vide never runs a cook, so it never shows this. */
function renderCookSetup(): void {
  const k = ticket;
  const shown = machine.phase !== 'IDLE' && k !== null;
  dom.cookSetup.hidden = !shown;
  if (!shown || k === null) return;
  const texts = clauseTexts(ticketSetupFacts(k));
  dom.cookSentence.textContent = t('setup.sentence', {
    egg: texts.egg.text, from: texts.from.text, start: texts.start.text, cooling: texts.cooling.text,
  });
  // The peak yolk the cook was started with; a ticket written before it was
  // kept falls back to the running cook's own solve.
  const peak = k.peakYolk_C ?? solution?.result.peakYolk_C ?? targetPeakYolk_C(machine.targetLevel);
  dom.cookDoneness.textContent = t('cook.summary', {
    doneness: t(anchorNear(machine.targetLevel).key).toLowerCase(),
    yolk: show('temperature', peak),
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

function buildClauses(): void {
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

/* ----------------------------------------------------------------- views */

type View = 'egg' | 'kitchen' | 'help';

/** Which view the address asks for, and which element to scroll to in it. */
function viewFromHash(): { view: View; target: string | null } {
  const hash = location.hash.replace(/^#/, '');
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
  const { view, target } = viewFromHash();
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

function wireViews(): void {
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
  window.addEventListener('popstate', () => route(true));
  window.addEventListener('hashchange', () => route(true));
  route(false);
}

function renderMute(): void {
  dom.mute.textContent = t(settings.muted ? 'readout.mute.off' : 'readout.mute.on');
  dom.mute.setAttribute('aria-pressed', settings.muted ? 'true' : 'false');
}

/** Sound is a setting, not a phase: the toggle works mid-cook, and muting
 *  while the alarm is going stops it. */
function onToggleMute(): void {
  settings.muted = !settings.muted;
  setMuted(settings.muted);
  saveSettings(settings);
  renderMute();
}

function setPrimary(label: string, hint: string, visible: boolean): void {
  dom.primary.textContent = label;
  dom.primary.hidden = !visible;
  // Enabled unless the caller says otherwise, so a disabled Start cannot leak
  // into the next phase's button.
  dom.primary.disabled = false;
  dom.primaryHintText.textContent = hint;
}

/** The one longer line under the egg while idle (UI.md section 3): a refusal
 *  if there is one, and otherwise, before anything has been learned, a
 *  welcome. The way to Help under low odds is a short link, and goes under
 *  either. */
function renderWelcome(warning: string): void {
  dom.welcome.hidden = !(machine.phase === 'IDLE' && !isSousVide() && warning === ''
    && calib.eggsLogged === 0 && !hasBoilMemory(boilMemory));
}

function render(now_ms: number): void {
  // Sous-vide is answered honestly and separately: no cook to run, no clock to
  // start, and a start time that has already been and gone. It goes FIRST,
  // before any of the pan readout is computed or painted - it used to run
  // after a full hot-start solve and after the stats row had already been
  // written, so it both paid for an answer it discarded and left half of that
  // answer on screen beside its own.
  renderSentence();
  renderCookSetup();
  if (isSousVide() && machine.phase === 'IDLE') {
    renderSousVide(now_ms);
    return;
  }

  const sol = solution;
  if (sol === null) return;

  // While a cook runs, everything below describes the ticket's pot and the
  // machine's cooling, not the controls: a second tab may have changed those.
  const running = runningSetup();
  const startMode = startModeNow();
  const boiling_C = running?.boiling_C ?? boilingPoint_C();
  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = startMode;

  const cookTime_s = machine.phase === 'IDLE' ? sol.result.cookTime_s : machine.cookTime_s;
  const boil_s = rampSeconds();
  const standing = (running === null ? settings.afterBoil : running.afterBoil) === 'off';

  dom.statBoil.textContent = show('boilingPoint', boiling_C);
  dom.note.textContent = textureNote(sol);
  // The warning line carries one of two things. A refusal is advice about the
  // slider, so it is idle-only: popping "jammy isn't reachable" onto the screen
  // while the egg is already in the water is advice about a control the user
  // cannot reach. A restored cook is the opposite - it only exists mid-cook.
  let warning = '';
  // Only while the cook is still in flight. At DONE the egg is out and "keep
  // this tab open" is advice about a deadline that has already passed.
  if (restored && machine.phase !== 'IDLE' && machine.phase !== 'DONE') {
    warning = t('readout.restored');
  } else if (machine.phase === 'IDLE' && refusal !== '') {
    warning = refusal;
  }
  dom.warn.textContent = warning;
  dom.warn.hidden = warning === '';
  renderDonenessReading({ peakYolk_C: sol.result.peakYolk_C });
  renderDonenessScale(sol);

  let label = '';
  let digits = '';
  let subline = '';
  let spoken = '';

  if (machine.phase === 'IDLE') {
    label = t('readout.phase.total');
    digits = formatClock(cookTime_s);
    subline = startMode === 'cold'
      ? t(hasBoilMemory(boilMemory) ? 'readout.sub.coldAssumes' : 'readout.sub.coldGuesses',
        { boil: formatClock(boil_s) })
      : standing
        // With the heat off, how fast the pan cools is set by the water in it,
        // and that is the most load-bearing number in the cook. The time to
        // boil plays no part on a hot start, so it is not mentioned.
        ? t('readout.sub.standing', { water: show('water', settings.waterLitres) })
        : t('readout.sub.hot');
    spoken = t('spoken.total', { time: spokenClock(cookTime_s) });
    setPrimary(
      t(startMode === 'cold' ? 'action.startHeating' : 'action.eggsIn'),
      sol.whiteSets
        ? startMode === 'cold'
          ? t('action.hint.cold')
          : standing
            ? t('action.hint.hotStanding')
            : t('action.hint.hotBoiling', { time: formatClock(cookTime_s) })
        : t('action.hint.whiteNeverSets'),
      true,
    );
    // There is no cook on offer at all, so there is nothing to start. iOS has
    // always disabled this; the web offered a button that led nowhere.
    dom.primary.disabled = !sol.whiteSets;
    dom.secondary.hidden = true;
  } else if (machine.phase === 'HEATING') {
    label = t('readout.phase.heating');
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = t('readout.sub.heating', {
      elapsed: formatClock(secondsHeating(machine, now_ms)), boil: formatClock(machine.assumedBoil_s),
    });
    spoken = t('spoken.heating', { time: spokenClock(secondsToPull(machine, now_ms)) });
    setPrimary(
      t('action.fullBoil'),
      t(standing ? 'action.hint.heatingStanding' : 'action.hint.heating'),
      true,
    );
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'COOKING') {
    // The one instruction the user has to act on goes in the phase label, where
    // it sits next to the clock. The model holds the water at its boiling point
    // for the whole cook - or, with the heat off, assumes it cools on its own -
    // so this is not a style note: a pan taken off the heat when the model
    // expected a boil under-cooks by minutes, and vice versa.
    label = t(standing ? 'readout.phase.cookingHeatOff' : 'readout.phase.cookingBoiling');
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = startMode === 'cold'
      ? t('readout.sub.cookingCold', {
        boil: formatClock(machine.assumedBoil_s), after: formatClock(secondsAfterBoil(machine)),
      })
      : t('readout.sub.cookingHot');
    spoken = t('spoken.cooking', { time: spokenClock(secondsToPull(machine, now_ms)) });
    setPrimary('', standing
      ? t('action.hint.cookingStanding')
      : t('action.hint.cookingBoiling', { boiling: show('temperature', boiling_C) }), false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'PULL') {
    const late = (now_ms - machine.pulledAt_ms) / 1000;
    label = t('readout.phase.pull');
    digits = `+${formatClock(late)}`;
    subline = t('readout.sub.pull');
    spoken = t('spoken.pull');
    const into = machine.cooling === 'ice' ? 'action.pulled.ice'
      : machine.cooling === 'tap' ? 'action.pulled.tap'
        : 'action.pulled.counter';
    // On a counter rest nothing starts on its own: the grace runs out into
    // Done. The line above already says the yolk is still cooking, so there
    // is nothing true left to add, and the hint is empty.
    const startsIn = coolingStartsIn_s(machine, now_ms);
    setPrimary(t(into), startsIn === null ? '' : t('action.hint.pull', { seconds: startsIn }), true);
    // Reachable here too: a reload can land in this phase, and a cook you have
    // picked back up must always be one you can put down.
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'COOLING') {
    label = t(machine.cooling === 'ice' ? 'readout.phase.coolingIce' : 'readout.phase.coolingTap');
    digits = formatClock(secondsToCool(machine, now_ms));
    // The countdown ends when the middle of the yolk peaks (E4), which is
    // also when a probe reading is asked for.
    subline = t(probeWanted() ? 'readout.sub.coolingProbe' : 'readout.sub.coolingPeak');
    spoken = t('spoken.cooling', { time: spokenClock(secondsToCool(machine, now_ms)) });
    setPrimary('', '', false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else {
    label = t('readout.phase.done');
    digits = formatClock(cookTime_s);
    subline = startMode === 'cold'
      ? t('readout.sub.doneCold', { boil: formatClock(boil_s), cooking: formatClock(cookTime_s - boil_s) })
      : t('readout.sub.doneHot');
    spoken = t(probePending() ? 'spoken.probe' : 'spoken.done');
    setPrimary(t('action.startAgain'), '', true);
    dom.secondary.hidden = true;
  }

  // The model is calibrated against the literature, not against this kitchen.
  // Asking once per egg is what closes that gap. Both questions stay on screen
  // until the cook moves on, answered or not; a reload after an answer puts
  // them away, since the second could no longer be folded.
  dom.feedback.hidden = machine.phase !== 'DONE' || (feedbackGiven && answered === null);
  if (!dom.feedback.hidden && answered === null) renderCalibNote();
  renderProbe();

  dom.phaseLabel.textContent = label;
  dom.digits.textContent = digits;
  dom.sublineText.textContent = subline;
  // "Based on history" has an (i) that says what history; the full rolling
  // boil has one that says what it looks like.
  showInfo(dom.sublineInfo, machine.phase === 'IDLE' && startMode === 'cold' && hasBoilMemory(boilMemory));
  showInfo(dom.hintInfo, machine.phase === 'HEATING');
  renderOdds();
  renderAdvice();
  renderWelcome(warning);

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  const announcement = t('spoken.announcement', { label: label, spoken: spoken });
  const minute = digits.split(':')[0];
  const key = `${machine.phase}|${minute}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = announcement;
  }
}

/** Which way the egg is likely to miss, and the white's line, under the
 *  time, with one (i) that explains the bracket, how to play safe with it and
 *  what I learn from (src/ui/outcome.ts). While idle they are the choice on
 *  screen's, and blank until this pot's surface lands - the direction's line
 *  keeps its height, so nothing moves when they arrive. Once a cook is running
 *  the direction and the white's line are what they were at "Eggs in"; the
 *  (i), which is about the slider, goes with the slider. Never where the white
 *  never sets: there is no cook to say anything about.
 *
 *  The one-tap play-safe suggestion that went under the direction is gone
 *  (owner, 28 September): it said in words what the slider and the bracket
 *  already show.
 *
 *  "I'm still learning" is no longer a line of its own on the web (owner, 27
 *  September): beside "I can't call it yet" it said the same thing twice.
 *  What it opened, what I learn from and what speeds it up, is the last
 *  paragraph of the (i). The decision still works it out; nothing keeps it
 *  with the egg. */
function renderOdds(): void {
  let o: Outcome | null = null;
  if (machine.phase === 'IDLE') {
    if (decision !== null && solution !== null && solution.whiteSets) o = outcome;
  } else if (ticket !== null) {
    o = ticket.outcome;
  }
  dom.directionText.textContent = o === null ? '' : t(directionKey(o));
  dom.whiteRisk.hidden = o === null || !whiteAtRisk(o);
  showInfo(dom.oddsInfo, machine.phase === 'IDLE' && o !== null);

  // While a new pot's surface is on its way the lines above are blank, and
  // the readout would shrink and grow back a second later, moving the
  // sentence's open choice under the thumb that just tapped it. So it keeps
  // the height it had when the lines were last all there.
  if (machine.phase === 'IDLE' && decision === null) {
    dom.readout.style.minHeight = settledReadout_px > 0 ? `${settledReadout_px}px` : '';
  } else {
    dom.readout.style.minHeight = '';
    const height = dom.readout.offsetHeight;
    if (machine.phase === 'IDLE' && height > 0) settledReadout_px = height;
  }
}

/** The sous-vide readout: hold times from the isothermal limit, and the plain
 *  statement that you should have started yesterday. */
function renderSousVide(now_ms: number): void {
  // No pan, no choice, and no odds: the bath's answer is not a guess about a
  // pan (E5 chooses pan times). So no direction, and no bracket either.
  dom.directionText.textContent = '';
  dom.whiteRisk.hidden = true;
  dom.readout.style.minHeight = '';
  renderBracket(null);
  showInfo(dom.oddsInfo, false);
  showInfo(dom.sublineInfo, false);
  showInfo(dom.hintInfo, false);
  renderAdvice();
  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = settings.startMode;
  renderSentence();

  const egg = currentEgg();
  const doneness = calibrationDoneness(calib, settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(calib).alpha_m2s, SOUS_VIDE_BATH_C,
    doneness.yolkDose_min, doneness.whiteDose_min,
  );
  const copy = sousVideCopy(est, now_ms);

  dom.phaseLabel.textContent = t('readout.phase.startTime');
  dom.digits.textContent = copy.headline;
  dom.sublineText.textContent = copy.subline;
  dom.statBoil.textContent = show('boilingPoint', boilingPoint_C());
  // The slider's reading is a pan number. There is no pan: the water's
  // temperature is not a peak yolk temperature, and the reading says which
  // number it is.
  renderDonenessReading({ bath_C: est.bath_C });
  dom.note.textContent = copy.note;
  dom.warn.textContent = copy.warn;
  dom.warn.hidden = false;
  dom.welcome.hidden = true;
  setPrimary('', copy.hint, false);
  dom.secondary.hidden = true;
  dom.feedback.hidden = true;

  const key = `SOUS|${copy.headline}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = t('spoken.sousVide', {
      when: copy.headline.toLowerCase(), subline: copy.subline,
    });
  }
}

/* ------------------------------------------------------------ the record */

/** Assign the machine and write the cook down in one step, so there is no path
 *  that advances a cook without persisting it. */
function setMachine(next: Machine): void {
  machine = next;
  persistCook();
}

function persistCook(): void {
  if (machine.phase === 'IDLE') {
    clearCook();
    return;
  }
  saveCook(machine, ticket, feedbackGiven);
}

/* -------------------------------------------------------------- recompute */

/** Solve for what is on screen and take the answer up. Idle only in practice:
 *  every mid-cook path goes through `resolveDuring` instead, which keeps the
 *  target the cook was started at. */
function recompute(): void {
  // No pan, no solve. The sous-vide answer comes from src/core/sousvide.ts and
  // needs none of this.
  if (isSousVide() && machine.phase === 'IDLE') {
    refusal = '';
    decision = null;
    outcome = null;
    profile = null;
    renderSousVide(Date.now());
    return;
  }
  const boil = timeToBoil_s();
  profile = cachedOddsProfile(currentInputs(boil), calib);
  const answer = answerFor(boil, settings.doneness, true, profile);
  applyAnswer(answer);
  const chosen = decided(answer, boil);
  solution = chosen.solution;
  decision = chosen.decision;
  outcome = chosen.outcome;
  render(Date.now());
}

/** Re-solve a cook already under way, for a corrected time to boil.
 *
 *  The doneness is whatever the cook was STARTED at, and nothing here moves it
 *  - not the slider, and not the answer. The egg is in the water and the
 *  controls are gone, so a snapped re-solve would describe a cook nobody is
 *  having; an unreachable target answers with the furthest this pan goes, which
 *  is the only cook on offer. The refusal is left alone for the same reason:
 *  it is advice about a control the user cannot reach. */
function resolveDuring(t: Ticket, timeToBoil_s: number): Solution {
  // The ticket's egg and pot, never the controls': a second tab may have
  // changed those since "Eggs in".
  const { egg, setup } = withTimeToBoil(t, timeToBoil_s);
  const params = calibrationParams(calib);
  const mean = solveCookTime(egg, setup, params, calibrationDoneness(calib, machine.targetLevel));
  // Leaned as far as the choice leaned at "Eggs in": the new ramp is a new pot,
  // whose surface is a second away with the egg already in (`carriedSolution`).
  return carriedSolution(egg, setup, params, mean, t.lean_s);
}

/** Coalesce solves: a solve is tens of milliseconds, which is too long to run
 *  on every pixel of a slider drag. */
function scheduleSolve(): void {
  if (solveHandle !== 0) return;
  solveHandle = window.setTimeout(() => {
    solveHandle = 0;
    recompute();
  }, 90);
}

/** Coalesce writes for the same reason. A drag fires `input` per pixel, and
 *  every one of those was a JSON.stringify and a localStorage write for a
 *  settings object nobody had finished changing. */
function scheduleSave(): void {
  if (saveHandle !== 0) return;
  saveHandle = window.setTimeout(() => {
    saveHandle = 0;
    saveSettings(settings);
  }, 250);
}

/** Write now, for the paths that must not lose the setting: starting a cook,
 *  and the snap that moves the slider out from under the user. */
function saveNow(): void {
  if (saveHandle !== 0) {
    window.clearTimeout(saveHandle);
    saveHandle = 0;
  }
  saveSettings(settings);
}

/* ------------------------------------------------------------ calibration */

function renderCalibNote(): void {
  dom.calibNote.textContent = calib.eggsLogged === 0
    ? t('feedback.invite')
    : t('learned.tuned', { eggs: calib.eggsLogged });
  renderLearned();
}

/** What this kitchen has taught the app, and the way to take it back. */
function renderLearned(): void {
  const eggs = calib.eggsLogged;
  const pan = hasBoilMemory(boilMemory);
  if (eggs === 0 && !pan) {
    dom.learnedNote.textContent = t('learned.literature');
    showForget(false);
    return;
  }
  const tuned = eggs > 0 ? t('learned.tuned', { eggs: eggs }) : '';
  const measured = pan
    ? t('learned.pan', {
      water: show('water', settings.waterLitres),
      time: formatClock(estimateTimeToBoil(boilMemory, settings.waterLitres)),
    })
    : '';
  dom.learnedNote.textContent = tuned !== '' && measured !== ''
    ? t('learned.both', { tuned: tuned, pan: measured })
    : tuned + measured;
  // Not while the confirmation is up: it stands in the button's place.
  if (dom.forgetConfirm.hidden) showForget(true);
}

/** Forget and its (i) come and go together. */
function showForget(visible: boolean): void {
  dom.forget.hidden = !visible;
  showInfo(dom.forgetInfo, visible);
}

/** Forget asks first, in place, as iOS does: the button gives way to the
 *  question and its two answers, and the focus goes to the safe one. */
function onForgetAsked(): void {
  showForget(false);
  dom.forgetConfirm.hidden = false;
  dom.forgetNo.focus();
}

function onForgetKept(): void {
  dom.forgetConfirm.hidden = true;
  showForget(true);
  dom.forget.focus();
}

/** Take it all back. A run of wrong answers about how the eggs were was otherwise
 *  undone only by clearing the site's storage - README 11.5 listed that as a
 *  known gap from the day the iOS app got its own version of this button. */
function onForget(): void {
  dom.forgetConfirm.hidden = true;
  calib = clearCalibration();
  boilMemory = {};
  clearBoilMemory();
  renderCalibNote();
  recompute();
  // The button has gone with what it forgot; the note that says so now has
  // the focus.
  dom.learnedNote.focus();
}

/** Mark which answer of a row was given, and put the row out of reach. The
 *  pressed button stays legible - it is the record of what was said. */
function settleRow(selector: string, pressed: HTMLButtonElement): void {
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>(selector);
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
    buttons[i].setAttribute('aria-pressed', buttons[i] === pressed ? 'true' : 'false');
  }
}

/** Both rows back to unanswered, for the next egg. */
function resetRows(): void {
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb, button.wb');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = false;
    buttons[i].removeAttribute('aria-pressed');
  }
}

/**
 * One answer, about the yolk or the white, in whichever order they come.
 *
 * The first answer writes the egg down - before anything is learned from it,
 * so a reload during the fold refolds it on load rather than losing it - and
 * folds it: a couple of seconds, for the dose surface, built in a worker. The
 * second is folded into the SAME egg, from the posterior as it stood before it
 * (`recordSecondAnswer`), so the order they were tapped in changes nothing.
 * The readout is left describing the egg that was eaten; the recalibrated model
 * shows up on the next "Start again".
 */
function onAnswer(yolk: Feedback | null, white: WhiteReport | null, pressed: HTMLButtonElement): void {
  if (answered !== null && ((yolk !== null && answered.yolk !== null)
    || (white !== null && answered.white !== null))) return;
  if (ticket === null) return;
  settleRow(yolk !== null ? 'button.fb' : 'button.wb', pressed);
  foldAnswer(yolk, white, null);
}

/** Write the egg down with its first answer, or fold a later one into it -
 *  a yolk, a white or a probe reading, whichever came. */
function foldAnswer(yolk: Feedback | null, white: WhiteReport | null, probe: ProbeReading | null): void {
  const cooked = ticket;
  if (cooked === null) return;
  dom.calibNote.textContent = t('feedback.learning');
  const cookStarted = machine.startedAt_ms;
  const stillHere = (): boolean => machine.phase === 'DONE' && machine.startedAt_ms === cookStarted;
  const thanks = (): void => {
    if (stillHere()) dom.calibNote.textContent = t('feedback.thanks');
    renderLearned();
  };

  if (answered === null) {
    const index = logEgg(eggRecordFor(cooked, machine, yolk, white, probe));
    answered = { yolk: yolk, white: white, probe: probe, index: index };
    feedbackGiven = true;
    // Written down with the log, not after the fold: a reload between the two
    // would otherwise offer the questions again, and log the egg twice.
    persistCook();
    // The surface is built in a worker, so the page stays live while it is -
    // which means the cook can have moved on by the time it lands.
    void learn(index).then(thanks);
    return;
  }
  if (yolk !== null) answered.yolk = yolk;
  if (white !== null) answered.white = white;
  if (probe !== null) answered.probe = probe;
  const second = yolk !== null ? { yolk: yolk } : white !== null ? { white: white }
    : probe !== null ? { probe: probe } : {};
  void recordSecondAnswer(answered.index, second).then(thanks);
}

/* ------------------------------------------------------------ thermometer */

/** Whether this cook will ask for a probe reading when its cooling ends. */
function probeWanted(): boolean {
  return settings.probe && ticket !== null && ticket.probeMoment;
}

/** Whether the probe is asked for NOW: the egg is done, and no reading yet. */
function probePending(): boolean {
  return machine.phase === 'DONE' && probeWanted() && !(feedbackGiven && answered === null)
    && (answered === null || answered.probe === null);
}

/** The once-only offer during a cook, and the reading at DONE. */
function renderProbe(): void {
  const running = machine.phase === 'HEATING' || machine.phase === 'COOKING'
    || machine.phase === 'PULL' || machine.phase === 'COOLING';
  dom.probeOffer.hidden = !(running && !settings.probeAsked && ticket !== null && ticket.probeMoment);
  // Asked for until it is given, and left showing what was given.
  const visible = probePending() || (machine.phase === 'DONE' && dom.probeReading.disabled);
  dom.probeEntry.hidden = !visible;
}

/** The cook's answer to the offer. Either way it is not made again; the
 *  setting stays in the controls. */
function onProbeOffer(yes: boolean): void {
  settings.probeAsked = true;
  if (yes) settings.probe = true;
  dom.probeSetting.checked = settings.probe;
  saveNow();
  render(Date.now());
}

/**
 * A reading typed at DONE, in the cook's units. Refused, with the range it
 * should be in, when no believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`); otherwise folded into the egg with whatever else
 * has been said about it, one fold per egg.
 */
function onProbeSave(): void {
  const cooked = ticket;
  if (cooked === null || dom.probeReading.disabled) return;
  if (answered !== null && answered.probe !== null) return;
  const typed = dom.probeReading.value.trim();
  if (typed === '') return;
  const reading_C = parse(measure('probeTemp'), Number(typed));
  const scoredAt_s = recordCookTime_s(eggRecordFor(cooked, machine, null));
  const [low, high] = plausibleProbeRange_C(
    cooked.egg, cooked.setup, calibrationParams(calib), scoredAt_s,
  );
  if (reading_C === null || reading_C < low || reading_C > high) {
    dom.probeNote.textContent = t('probe.refused', {
      low: show('probeTemp', low), high: show('probeTemp', high),
    });
    return;
  }
  // When it was asked for: the end of the counted cooling, from the moment
  // the record scores as the pull.
  const asked_s = (machine.coolEnd_ms - machine.startedAt_ms) / 1000 - scoredAt_s;
  const probe: ProbeReading = {
    centre_C: recordProbe_C(reading_C),
    after_s: machine.coolEnd_ms > 0 && asked_s >= 0 ? asked_s : null,
  };
  dom.probeReading.disabled = true;
  dom.probeSave.disabled = true;
  dom.probeNote.textContent = show('probeTemp', reading_C);
  foldAnswer(null, null, probe);
}

/** Back to empty, for the next egg. */
function resetProbe(): void {
  dom.probeReading.value = '';
  dom.probeReading.disabled = false;
  dom.probeSave.disabled = false;
  dom.probeNote.textContent = '';
}

/* -------------------------------------------------------------- language */

/** The picker, and the line under the Imperial option that says the English
 *  of 1750 is there, which only an English page shows. */
function applyLanguageToDom(): void {
  selectRadio('language', activeLocale());
  dom.unitsPeriod.hidden = languageOf(activeLocale()) !== 'en';
}

/** Which language changes went in last, so two quick changes land in order. */
let languageAsked = 0;

/**
 * Take up a new language state: store it, and if the catalogue on screen
 * changes, fetch the new one and redraw every word in place. Nothing about the
 * egg changes, and the units are never touched from here: that rule runs one
 * way (LANGUAGE.md section 6). Only reachable while idle, since Settings is.
 */
function setLanguage(next: LanguageState): void {
  const before = effectiveLanguage(settings.language);
  settings.language = next;
  saveNow();
  const tag = effectiveLanguage(next);
  if (tag === before && tag === activeLocale()) {
    applyLanguageToDom();
    return;
  }
  const asked = ++languageAsked;
  void switchCopy(tag).then(() => {
    if (asked === languageAsked) relabel();
  });
}

/** Every word on the page again, in the catalogue now active: the marked-up
 *  ones (`applyCopy`), and each one the code drew. */
function relabel(): void {
  applyCopy(document);
  labelInfoButtons();
  labelTicks();
  renderMute();
  applyUnitsToDom();
  applyLanguageToDom();
  // Drawn only when what they say changes, so they are told it has.
  adviceShown = '';
  lastAnnounced = '';
  renderCalibNote();
  if (machine.phase === 'IDLE') recompute();
  else render(Date.now());
}

/* ------------------------------------------------------------------ input */

function readInputs(source: EventTarget | null): void {
  const sizeIndex = Number(dom.size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : DEFAULTS.sizeIndex;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label.
  let measured_mm = -1;
  if (source === dom.measureMass) {
    measured_mm = minorFromMass_mm(readField(dom.measureMass, 'mass', 62));
  } else if (source === dom.measureGirth) {
    measured_mm = minorFromGirth_mm(readField(dom.measureGirth, 'girth', 137));
  } else if (source === dom.measureMinor) {
    measured_mm = readField(dom.measureMinor, 'width', settings.customMinor_mm);
  }
  if (measured_mm > 0) {
    settings.measuredBy = source === dom.measureMass ? 'scale'
      : source === dom.measureGirth ? 'girth' : 'width';
    settings.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, settings.customMinor_mm);
    settings.sizeIndex = -1;
    dom.size.value = '-1';
  }
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  // The three fields with a unit are read only when they are the one being
  // edited, like the measurements above: see `readField`.
  if (source === dom.customTemp) {
    settings.customStart_C = readField(dom.customTemp, 'eggTemp', settings.customStart_C);
  }
  if (source === dom.altitude) {
    settings.altitude_m = readField(dom.altitude, 'altitude', settings.altitude_m);
  }
  settings.startMode = radioValue('startMode', 'cold') as UiStartMode;
  settings.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  if (source === dom.litres) {
    settings.waterLitres = readField(dom.litres, 'water', settings.waterLitres);
  }
  settings.eggCount = Math.round(clampNumber(dom.eggCount.value, LIMITS.eggCount, settings.eggCount));
  settings.doneness = clampNumber(dom.doneness.value, LIMITS.doneness, settings.doneness);
  // Ticking the box is saying so: the offer has its answer.
  if (dom.probeSetting.checked !== settings.probe) settings.probeAsked = true;
  settings.probe = dom.probeSetting.checked;

  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  syncMeasurements(source);
  scheduleSave();
}

function onInput(event: Event): void {
  // The units are a setting about the screen, not about the egg, and have
  // their own path.
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === 'units') {
    if (event.type === 'change') onUnits(target.value === 'imperial' ? 'imperial' : 'metric');
    return;
  }
  // So is the language, which changes every word and no number.
  if (target instanceof HTMLInputElement && target.name === 'language') {
    if (event.type === 'change' && LANGUAGES.includes(target.value)) {
      setLanguage(languageAfterPick(settings.language, target.value));
    }
    return;
  }
  readInputs(target);
  // Instant feedback on what the eye is on while dragging or choosing - the
  // reading under the slider, the sentence, the boiling point beside the
  // altitude; the full solve (tens of milliseconds) follows and corrects them.
  renderDonenessReading(isSousVide() ? { bath_C: SOUS_VIDE_BATH_C } : { peakYolk_C: targetPeakYolk_C(settings.doneness) });
  dom.statBoil.textContent = show('boilingPoint', boilingPoint_C());
  dom.body.dataset['start'] = settings.startMode;
  renderSentence();
  scheduleSolve();
}

/* ------------------------------------------------------------------ cook */

/** A slow hob: when this little of the provisional countdown is left and the
 *  water has still not boiled, push the estimate out by REVISE_EXTRA_S, at
 *  most once per REVISE_INTERVAL_MS. */
const REVISE_WHEN_LEFT_S = 45;
const REVISE_EXTRA_S = 60;
const REVISE_INTERVAL_MS = 10000;

function onTick(): void {
  const now = Date.now();

  if (machine.phase === 'HEATING' && ticket !== null && secondsToPull(machine, now) < REVISE_WHEN_LEFT_S
      && now - lastRevise_ms > REVISE_INTERVAL_MS) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    lastRevise_ms = now;
    const assumed = secondsHeating(machine, now) + REVISE_EXTRA_S;
    solution = resolveDuring(ticket, assumed);
    ticket = withTimeToBoil(ticket, assumed);
    ticket = { ...ticket, probeMoment: probeMomentFor(solution.result, ticket.setup.cooling) };
    setMachine(reviseProvisional(
      machine, solution.result.cookTime_s, assumed, coolingSecondsFor(solution.result),
    ));
  }

  const step = advance(machine, now);
  if (step.machine !== machine) {
    setMachine(step.machine);
    if (step.event === 'pull') ringAlarm(true);
    if (step.event === 'done') finishCook();
  }
  render(now);
}

function startTicking(): void {
  if (ticker === null) ticker = startTicker(onTick);
}

function stopTicking(): void {
  if (ticker !== null) {
    ticker.stop();
    ticker = null;
  }
}

/** The egg is done: ring, then stop repainting and let the screen sleep. */
function finishCook(): void {
  ringAlarm(false);
  stopTicking();
  releaseScreen();
}

function reset(): void {
  stopAlarm();
  stopTicking();
  releaseScreen();
  // An egg finished and never answered about is still an egg: the cook, the
  // recommendation and the pull are data for the fit. It folds nothing.
  if (machine.phase === 'DONE' && !feedbackGiven && ticket !== null) {
    logEgg(eggRecordFor(ticket, machine, null));
    void learn();
  }
  feedbackGiven = false;
  answered = null;
  resetRows();
  resetProbe();
  restored = false;
  ticket = null;
  machine = idleMachine(settings.cooling);
  clearCook();
  recompute();
}

function onPrimary(): void {
  const now = Date.now();
  stopAlarm();

  if (machine.phase === 'IDLE') {
    // The audio context must be created inside a user gesture or the alarm is
    // silently blocked later, when it matters.
    primeAudio();
    keepScreenAwake();
    const boil = timeToBoil_s();
    // Take the answer up one last time while the controls are still live: the
    // level this returns is the one the cook is run at, and it does not move
    // again until the cook is over.
    profile = cachedOddsProfile(currentInputs(boil), calib);
    const answer = answerFor(boil, settings.doneness, true, profile);
    applyAnswer(answer);
    // The time on screen is the one started: the chosen one if this pot's
    // surface is in, and the mean solve's if the cook was quicker than it.
    const chosen = decided(answer, boil);
    solution = chosen.solution;
    decision = chosen.decision;
    outcome = chosen.outcome;
    const target = settings.doneness;
    const cook = solution.result.cookTime_s;
    // A cook started here is this tab's own, whatever happened before it.
    restored = false;
    ticket = {
      egg: currentEgg(),
      massFrom: massFrom(),
      sizeTable: massFrom() === 'class' ? sizeTable : null,
      boilRemembered: hasBoilMemory(boilMemory),
      eggFrom: settings.startTempMode,
      setup: buildSetup(boil),
      logNominalTarget: Math.log10(donenessFromSlider(target).yolkDose_min),
      units: unitSystem(),
      lang: activeLocale(),
      lean_s: decision === null ? 0 : decision.cookTime_s - decision.meanCookTime_s,
      outcome: decision === null ? null : outcome,
      peakYolk_C: solution.result.peakYolk_C,
      probeMoment: probeMomentFor(solution.result, settings.cooling),
    };
    // The cooling counts to the yolk's peak for this cook (E4).
    const cool = coolingSecondsFor(solution.result);
    setMachine(settings.startMode === 'cold'
      ? startCold(now, cook, boil, settings.cooling, target, cool)
      : startHot(now, cook, settings.cooling, target, cool));
    lastRevise_ms = now;
    startTicking();
    blip();
    render(now);
    return;
  }

  if (machine.phase === 'HEATING' && ticket !== null) {
    const measured = secondsHeating(machine, now);
    boilMemory = rememberTimeToBoil(boilMemory, ticket.setup.waterLitres, measured);
    solution = resolveDuring(ticket, measured);
    // Patch the measured ramp into the frozen setup rather than rebuilding it
    // from the live controls, which another tab may have changed.
    ticket = withTimeToBoil(ticket, measured);
    ticket = { ...ticket, probeMoment: probeMomentFor(solution.result, ticket.setup.cooling) };
    setMachine(recordBoil(
      machine, now, solution.result.cookTime_s, coolingSecondsFor(solution.result),
    ));
    blip();
    onTick();
    return;
  }

  if (machine.phase === 'PULL') {
    const next = beginCooling(machine, now);
    setMachine(next);
    if (next.phase === 'DONE') finishCook();
    render(now);
    return;
  }

  if (machine.phase === 'DONE') reset();
}

/* ------------------------------------------------------------------ boot */

function buildSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    dom.size.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '-1';
  dom.size.append(custom);
}

/** The classes' names, with their masses in the units on screen, and the
 *  measured egg's. */
function labelSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const label = sizeClassLabel(sizeClasses[i], unitSystem());
    dom.size.options[i].textContent = t(label.key, { mass: t(label.mass.key, { value: label.mass.value }) });
  }
  dom.size.options[sizeClasses.length].textContent = t('controls.size.measured');
}

function buildTicks(): void {
  for (const anchor of DONENESS_ANCHORS) {
    const span = document.createElement('span');
    span.style.left = `${anchor.level * 100}%`;
    dom.donenessTicks.append(span);
  }
  labelTicks();
}

function labelTicks(): void {
  const spans = dom.donenessTicks.querySelectorAll<HTMLSpanElement>('span');
  DONENESS_ANCHORS.forEach((anchor, i) => {
    if (spans[i] !== undefined) spans[i].textContent = t(anchor.key);
  });
}

function applyLimit(input: HTMLInputElement, limit: Limit): void {
  input.min = String(limit.lo);
  input.max = String(limit.hi);
}

/** Everything the markup says about numbers comes from the same tables the
 *  model reads, so a bound or a preset changed in one place changes here too. */
function applyConstantsToDom(): void {
  applyLimit(dom.eggCount, LIMITS.eggCount);
  applyLimit(dom.doneness, LIMITS.doneness);
  dom.doneness.step = String(1 / SLIDER_STEPS);
}

/** Everything on the form that has a unit: each input's step, bounds, unit
 *  and contents, the preset labels, and the size menu. Run at boot and again
 *  whenever the cook changes system, from the stored SI values - so switching
 *  back and forth never moves the egg. */
function applyUnitsToDom(): void {
  applyMeasure(dom.measureMass, dom.unitMass, measure('mass'));
  applyMeasure(dom.measureGirth, dom.unitGirth, measure('girth'));
  applyMeasure(dom.measureMinor, dom.unitMinor, measure('width'));
  applyMeasure(dom.customTemp, dom.unitTemp, measure('eggTemp'));
  applyMeasure(dom.altitude, dom.unitAltitude, measure('altitude'));
  applyMeasure(dom.litres, dom.unitLitres, measure('water'));
  applyMeasure(dom.probeReading, dom.unitProbe, measure('probeTemp'));
  syncMeasurements(null);
  dom.customTemp.value = inputText('eggTemp', settings.customStart_C);
  dom.litres.value = inputText('water', settings.waterLitres);
  dom.altitude.value = inputText('altitude', settings.altitude_m);
  selectRadio('units', unitSystem());
  labelSizeOptions();
  // The presets are assumptions, and are labelled as such rather than baked
  // into the buttons: a room is not necessarily 20 C, and Custom is there for
  // anyone who knows better.
  dom.startTempHint.textContent = t('controls.eggFrom.hint', {
    fridge: show('temperature', START_TEMP_PRESETS_C.fridge),
    room: show('temperature', START_TEMP_PRESETS_C.room),
  });
  dom.startSousLabel.textContent = t('controls.start.sousVide', {
    bath: show('temperature', SOUS_VIDE_BATH_C),
  });
  dom.helpSousVide.textContent = t('help.unsure.sousVide', {
    floor: show('temperature', SOUS_VIDE_MODEL_FLOOR_C),
  });
  // The sentence's masses and temperatures are in the units too.
  sentenceShown = '';
  renderSentence();
}

function applySettingsToDom(): void {
  dom.size.value = String(settings.sizeIndex);
  applyUnitsToDom();
  selectRadio('startTemp', settings.startTempMode);
  selectRadio('startMode', settings.startMode);
  selectRadio('afterBoil', settings.afterBoil);
  selectRadio('cooling', settings.cooling);
  dom.eggCount.value = String(settings.eggCount);
  dom.doneness.value = String(settings.doneness);
  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  dom.probeSetting.checked = settings.probe;
  applyLanguageToDom();
}

export function boot(): void {
  buildSizeOptions();
  buildTicks();
  buildClauses();
  applyConstantsToDom();
  applySettingsToDom();

  // The egg's two controls and its sentence, and the Kitchen's settings, are
  // read the same way: every input goes through readInputs.
  for (const id of ['controls', 'kitchenForm']) {
    const form = el<HTMLFormElement>(id);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  dom.primary.addEventListener('click', onPrimary);
  dom.secondary.addEventListener('click', reset);
  dom.mute.addEventListener('click', onToggleMute);
  dom.forget.addEventListener('click', onForgetAsked);
  dom.forgetYes.addEventListener('click', onForget);
  dom.forgetNo.addEventListener('click', onForgetKept);
  // Every (i) opens in place. They are buttons, so the keyboard reaches and
  // works them, and aria-expanded says which way they stand.
  wireInfoButtons();
  wireViews();
  // F6: a cook's own switch from metric to Imperial, in modern English, is
  // also a switch into the English of 1750, and back (LANGUAGE.md section 6).
  document.addEventListener(UNITS_FLIP_EVENT, (event) => {
    const detail = (event as CustomEvent<UnitsFlipDetail>).detail;
    setLanguage(languageAfterFlip(settings.language, detail.flip));
  });
  dom.probeOfferYes.addEventListener('click', () => onProbeOffer(true));
  dom.probeOfferNo.addEventListener('click', () => onProbeOffer(false));
  dom.probeSave.addEventListener('click', onProbeSave);
  dom.probeReading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onProbeSave();
  });
  setMuted(settings.muted);
  renderMute();

  const fbButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < fbButtons.length; i++) {
    fbButtons[i].addEventListener('click', () => {
      const raw = Number(fbButtons[i].dataset['fb']);
      onAnswer((raw === -1 ? -1 : raw === 1 ? 1 : 0) as Feedback, null, fbButtons[i]);
    });
  }

  const whiteButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.wb');
  for (let i = 0; i < whiteButtons.length; i++) {
    whiteButtons[i].addEventListener('click', () => {
      const raw = whiteButtons[i].dataset['white'];
      const white: WhiteReport = raw === 'runny' ? 'runny' : raw === 'tender' ? 'tender' : 'firm';
      onAnswer(null, white, whiteButtons[i]);
    });
  }

  renderCalibNote();
  restoreCook();
  recompute();
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  if (eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote();
      if (machine.phase === 'IDLE') recompute();
    });
  }
}

/**
 * Pick a cook back up after a reload.
 *
 * The deadlines are absolute, so the countdown resumes at the right number
 * rather than restarting - which is the whole reason the machine was built this
 * way. What does NOT come back is the alarm: it lives in this tab's audio
 * context and died with the old page, so a restored cook says so rather than
 * letting someone walk away trusting a noise that will not happen.
 */
function restoreCook(): void {
  const stored = loadCook();
  if (stored === null) return;

  const now = Date.now();
  const back = restoreMachine(stored.machine, now);
  if (back === null) {
    clearCook();
    return;
  }

  // A running cook is described by its ticket alone, so one that cannot be
  // read is dropped rather than shown against the controls.
  const backTicket = restoreTicket(stored.ticket);
  if (backTicket === null) {
    clearCook();
    return;
  }
  machine = back;
  ticket = backTicket;
  feedbackGiven = stored.feedbackGiven;
  restored = true;

  const step = advance(machine, now);
  machine = step.machine;
  persistCook();

  if (machine.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}

/** A stored ticket, or null if it cannot be trusted. Partial is not good
 *  enough: this is what the posterior learns from. */
function restoreTicket(raw: unknown): Ticket | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const target = r['logNominalTarget'];
  if (typeof target !== 'number' || !Number.isFinite(target)) return null;

  const egg = positiveFields(r['egg'], ['radius_m', 'minorDiameter_m', 'mass_kg', 'volume_m3']);
  if (egg === null) return null;

  const setup = r['setup'];
  if (setup === null || typeof setup !== 'object') return null;
  const st = setup as Record<string, unknown>;
  // Every number the solver will read. A partial setup does not throw - it
  // produces a plausible wrong answer, and then teaches it to the posterior.
  if (positiveFields(setup, ['boiling_C', 'waterLitres', 'eggCount']) === null) return null;
  for (const key of ['eggStart_C', 'ambient_C', 'timeToBoil_s']) {
    const value = st[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  }
  if (st['startMode'] !== 'cold' && st['startMode'] !== 'hot') return null;
  if (st['cooling'] !== 'ice' && st['cooling'] !== 'tap' && st['cooling'] !== 'counter') return null;
  if (st['afterBoil'] !== undefined && st['afterBoil'] !== 'hold' && st['afterBoil'] !== 'off') {
    return null;
  }

  // A ticket written before E1 does not say where the egg came from. The
  // controls cannot change while a cook is on screen, so the settings still
  // say what they said at "Eggs in".
  const mf = r['massFrom'];
  const ef = r['eggFrom'];
  const from = mf === 'scale' || mf === 'girth' || mf === 'width' || mf === 'class' ? mf : massFrom();
  return {
    egg: egg as Egg,
    massFrom: from,
    sizeTable: from === 'class' ? sizeTable : null,
    boilRemembered: r['boilRemembered'] === true
      || (r['boilRemembered'] === undefined && hasBoilMemory(boilMemory)),
    eggFrom: ef === 'fridge' || ef === 'room' || ef === 'custom' ? ef : settings.startTempMode,
    setup: setup as CookSetup,
    logNominalTarget: target,
    // A ticket written before F3 was written by a metric-only app.
    units: r['units'] === 'imperial' ? 'imperial' : 'metric',
    // And one written before F4 by an app that spoke only English.
    lang: typeof r['lang'] === 'string' && r['lang'] !== '' ? r['lang'] : 'en',
    // And one written before E5 by an app that did not choose, and had no odds.
    lean_s: typeof r['lean_s'] === 'number' && Number.isFinite(r['lean_s']) ? r['lean_s'] : 0,
    // And one written before the outcome summary, which carried only the odds.
    outcome: restoreOutcome(r['outcome']),
    // And one written before the running cook showed its sentence.
    peakYolk_C: typeof r['peakYolk_C'] === 'number' && Number.isFinite(r['peakYolk_C']) ? r['peakYolk_C'] : null,
    // And one written before E4 counted a flat three minutes, not to a peak.
    probeMoment: r['probeMoment'] === true,
  };
}

/** The object, if every named field on it is a finite number above zero.
 *  Returns null rather than narrowing by assertion, so the cast at the end of
 *  `restoreTicket` is the last step rather than the only check. */
function positiveFields(raw: unknown, keys: string[]): object | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = r[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) return null;
  }
  return raw as object;
}
