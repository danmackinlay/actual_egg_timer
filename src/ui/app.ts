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

import { Egg, eggFromMass, eggFromMinorDiameter, SIZE_CLASSES } from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import {
  DONENESS_ANCHORS, Solution, donenessFromSlider, solveCookTime,
} from '../core/solve.js';
import {
  SLIDER_STEPS, Verdict, ambientFor, anchorNear, targetPeakYolk_C, textureFor,
  verdictFor,
} from '../core/policy.js';
import { Feedback, WhiteReport } from '../core/infer.js';
import { DoseGrid } from '../core/doseGrid.js';
import {
  Calibration, clearCalibration, loadCalibration, saveCalibration, calibrationParams,
  calibrationSpread, recordOutcome, recordWhite,
} from './calibration.js';
import {
  LIMITS, Limit, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber,
  clearBoilMemory, clearCook, estimateTimeToBoil, hasBoilMemory, loadBoilMemory,
  loadCook, loadSettings, rememberTimeToBoil, saveCook, saveSettings,
} from './store.js';
import { sousVideCopy } from './sousvide.js';
import {
  Machine, advance, beginCooling, idleMachine, recordBoil, restoreMachine,
  reviseProvisional, secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull,
  startCold, startHot, COOLING_SECONDS, PULL_GRACE_SECONDS,
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
  phaseLabel: el<HTMLParagraphElement>('phaseLabel'),
  digits: el<HTMLSpanElement>('digits'),
  announce: el<HTMLSpanElement>('announce'),
  subline: el<HTMLParagraphElement>('subline'),
  statYolk: el<HTMLElement>('statYolk'),
  statYolkLabel: el<HTMLElement>('statYolkLabel'),
  startHint: el<HTMLParagraphElement>('startHint'),
  statAfter: el<HTMLElement>('statAfter'),
  statBoil: el<HTMLElement>('statBoil'),
  note: el<HTMLParagraphElement>('note'),
  warn: el<HTMLParagraphElement>('warn'),
  mute: el<HTMLButtonElement>('mute'),
  doneness: el<HTMLInputElement>('doneness'),
  donenessBlockedSoft: el<HTMLDivElement>('donenessBlockedSoft'),
  donenessBlockedHard: el<HTMLDivElement>('donenessBlockedHard'),
  donenessTicks: el<HTMLDivElement>('donenessTicks'),
  donenessValue: el<HTMLParagraphElement>('donenessValue'),
  size: el<HTMLSelectElement>('size'),
  measureMass: el<HTMLInputElement>('measureMass'),
  measureGirth: el<HTMLInputElement>('measureGirth'),
  measureMinor: el<HTMLInputElement>('measureMinor'),
  startTempHint: el<HTMLParagraphElement>('startTempHint'),
  startSousLabel: el<HTMLLabelElement>('startSousLabel'),
  customTempField: el<HTMLDivElement>('customTempField'),
  customTemp: el<HTMLInputElement>('customTemp'),
  litres: el<HTMLInputElement>('litres'),
  eggCount: el<HTMLInputElement>('eggCount'),
  altitude: el<HTMLInputElement>('altitude'),
  primary: el<HTMLButtonElement>('primary'),
  primaryHint: el<HTMLParagraphElement>('primaryHint'),
  secondary: el<HTMLButtonElement>('secondary'),
  feedback: el<HTMLDivElement>('feedback'),
  calibNote: el<HTMLParagraphElement>('calibNote'),
  whiteFeedback: el<HTMLDivElement>('whiteFeedback'),
  whiteNote: el<HTMLParagraphElement>('whiteNote'),
  learnedNote: el<HTMLParagraphElement>('learnedNote'),
  forget: el<HTMLButtonElement>('forget'),
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

let settings: Settings = loadSettings();
let boilMemory = loadBoilMemory();
/** Posterior over the model's uncertain constants, learned from how the user's
 *  own eggs actually turn out. Before any feedback this is the prior mean,
 *  i.e. the literature values. */
let calib: Calibration = loadCalibration();
let machine: Machine = idleMachine(settings.cooling);
let solution: Solution | null = null;
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
/** One report per egg: the feedback buttons go away once one is pressed. */
let feedbackGiven = false;
/** The dose surface the yolk answer was just scored against, kept only while the
 *  white question is on screen - answering it needs the same surface, and
 *  rebuilding it would cost another two seconds. Null whenever there is no white
 *  question pending, which includes after a reload: the question is a moment in
 *  a conversation, not a fact about the egg, so it is not persisted. */
let whiteGrid: DoseGrid | null = null;

/** The same cook, against a time to boil that is now known rather than
 *  guessed. Everything else about it is frozen. */
function withTimeToBoil(t: Ticket, timeToBoil_s: number): Ticket {
  return { ...t, setup: { ...t.setup, timeToBoil_s: timeToBoil_s } };
}

/** The cook that was started: the only thing the calibration is allowed to
 *  learn from. */
interface Ticket {
  egg: Egg;
  setup: CookSetup;
  /** log10 of the yolk dose this cook was RUN at. Frozen with everything else,
   *  so a slider left somewhere else afterwards cannot rewrite history. */
  logNominalTarget: number;
}

/* --------------------------------------------------------------- physics */

function currentEgg(): Egg {
  if (settings.sizeIndex < 0 || settings.sizeIndex >= SIZE_CLASSES.length) {
    return eggFromMinorDiameter(settings.customMinor_mm / 1000);
  }
  return eggFromMass(SIZE_CLASSES[settings.sizeIndex].mass_kg);
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
 *  filling in one fills in the rest without the field fighting the cursor. */
function syncMeasurements(except: EventTarget | null): void {
  const egg = currentEgg();
  const minor_mm = egg.minorDiameter_m * 1000;
  if (except !== dom.measureMass) dom.measureMass.value = (egg.mass_kg * 1000).toFixed(0);
  if (except !== dom.measureGirth) dom.measureGirth.value = (Math.PI * minor_mm).toFixed(0);
  if (except !== dom.measureMinor) dom.measureMinor.value = minor_mm.toFixed(1);
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
 *  then the measurement when the boil is tapped. A hot start never times it,
 *  but the solver still wants it - with the heat off it is the pan's loss time
 *  constant (see panTimeConstant), on either start - so a hot start keeps
 *  using the remembered value throughout. */
function timeToBoil_s(): number {
  if (machine.phase !== 'IDLE' && settings.startMode === 'cold') return machine.assumedBoil_s;
  return estimateTimeToBoil(boilMemory, settings.waterLitres);
}

/** How much of the clock the ramp takes: all of the time to boil on a cold
 *  start, none of it otherwise. */
function rampSeconds(): number {
  return settings.startMode === 'cold' ? timeToBoil_s() : 0;
}

/** Why the form is shorter in sous-vide. The controls are hidden because the
 *  answer does not read them (see `.pan-only` in styles.css); saying so stops
 *  that reading as a bug or as lost settings. */
function renderStartHint(): void {
  dom.startHint.textContent = isSousVide()
    ? 'A bath needs no pan, so the pan controls are put away. Your settings are kept '
      + 'and come back when you pick a pan again.'
    : 'Hot start peels far better; cold start needs no timing of the drop-in.';
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
  const wanted = v.wanted.label.toLowerCase();
  const limit = v.limit.label.toLowerCase();

  if (v.kind === 'whiteNeverSets') {
    return 'With the heat off this pan never sets the white: the water falls below '
      + 'what the white needs while the egg is still in it. Nothing on the slider is '
      + 'reachable. More water, a slower boil, or keep it boiling.';
  }

  if (v.kind === 'harderThanPanReaches') {
    return 'With the heat off, the water runs out before the yolk gets there — '
      + `${wanted} isn't reachable in ${formatLitres(settings.waterLitres)} L. `
      + `Hardest here is ${limit}. More water, or keep it boiling.`;
  }

  if (settings.cooling === 'counter') {
    return `Resting on the counter keeps cooking the yolk — ${wanted} isn't reachable. `
      + `Softest here is ${limit}. Use an ice bath.`;
  }
  if (settings.cooling === 'tap') {
    return `A cold tap doesn't pull the heat out fast enough — ${wanted} isn't reachable. `
      + `Softest here is ${limit}. Ice water gets you further.`;
  }
  return `Any shorter and the white is still raw — ${wanted} isn't reachable for this egg. `
    + `Softest here is ${limit}.`;
}

/** Litres as someone would say them: "2", not "1.7500000000000002". */
function formatLitres(litres: number): string {
  return Number.isInteger(litres) ? String(litres) : litres.toFixed(1);
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
}

/** Solve for the given inputs. Pure apart from reading `settings`: it moves
 *  nothing and writes nothing.
 *
 *  `snapRetry` is false for a cook already under way: the target is frozen, so
 *  re-solving at a snapped position would answer for an egg nobody is cooking. */
function answerFor(timeToBoil_s: number, level: number, snapRetry = true): Answer {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const params = calibrationParams(calib);
  const result = solveCookTime(egg, setup, params, donenessFromSlider(level));
  const verdict = verdictFor(result, level);

  // Re-solve at the position the user is actually being offered, so the
  // numbers on screen are the numbers for that cook rather than for one that
  // was refused. Only worth it when the slider is going to move.
  if (snapRetry && verdict.snapTo !== null) {
    const retry = solveCookTime(egg, setup, params, donenessFromSlider(verdict.snapTo));
    if (retry.reachable) return { solution: retry, verdict: verdict };
  }
  return { solution: result, verdict: verdict };
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

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function spokenClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} seconds`;
  return `${m} minute${m === 1 ? '' : 's'} ${s} seconds`;
}

/** The texture note. Which band a temperature falls in is core policy; what
 *  the band is called is this app's copy. */
function textureNote(peakYolk_C: number, peakWhite_C: number): string {
  const t = textureFor(peakYolk_C, peakWhite_C);
  const white = t.white === 'justSet' ? 'white just set'
    : t.white === 'set' ? 'white set'
      : 'white firm';
  const yolk = t.yolk === 'liquid' ? 'yolk liquid'
    : t.yolk === 'soft' ? 'yolk soft, barely thickened'
      : t.yolk === 'jammy' ? 'yolk jammy'
        : t.yolk === 'fudgy' ? 'yolk fudgy'
          : 'yolk fully set';
  return `${white}, ${yolk}`;
}

/** The reading under the slider. The same shape whether the temperature is
 *  the solver's or the quick interpolation that tracks the thumb, so it does
 *  not flicker between two formats mid-drag. */
function donenessValueText(peakYolk_C: number): string {
  return `${anchorNear(settings.doneness).label} · peak yolk ${peakYolk_C.toFixed(0)}°C`;
}

/** Stripe out the parts of the track this setup cannot deliver: the soft end
 *  the white forbids, and - with the heat off - the hard end the pan cannot
 *  reach. If the white never sets there is nothing to offer, and the whole
 *  track says so. */
function renderDonenessScale(sol: Solution): void {
  const softest = sol.whiteSets ? sol.softestLevel : 1;
  const hardest = sol.whiteSets ? sol.hardestLevel : 0;
  dom.donenessBlockedSoft.style.width = `${clampNumber(softest * 100, { lo: 0, hi: 100 }, 0)}%`;
  dom.donenessBlockedHard.style.width = `${clampNumber((1 - hardest) * 100, { lo: 0, hi: 100 }, 0)}%`;
  dom.doneness.setAttribute('aria-valuetext', anchorNear(settings.doneness).label);
  const ticks = dom.donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    const anchor = DONENESS_ANCHORS[i];
    if (anchor === undefined) continue;
    const blocked = anchor.level < softest - 0.005 || anchor.level > hardest + 0.005;
    ticks[i].classList.toggle('blocked', blocked);
  }
}

function renderMute(): void {
  dom.mute.textContent = settings.muted ? 'Muted' : 'Sound on';
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
  dom.primaryHint.textContent = hint;
}

function render(now_ms: number): void {
  // Sous-vide is answered honestly and separately: no cook to run, no clock to
  // start, and a start time that has already been and gone. It goes FIRST,
  // before any of the pan readout is computed or painted - it used to run
  // after a full hot-start solve and after the stats row had already been
  // written, so it both paid for an answer it discarded and left half of that
  // answer on screen beside its own.
  renderStartHint();
  if (isSousVide() && machine.phase === 'IDLE') {
    renderSousVide(now_ms);
    return;
  }

  const sol = solution;
  if (sol === null) return;

  dom.statYolkLabel.textContent = 'peak yolk';

  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = settings.startMode;

  const cookTime_s = machine.phase === 'IDLE' ? sol.result.cookTime_s : machine.cookTime_s;
  const boil_s = rampSeconds();
  const standing = settings.afterBoil === 'off';

  dom.statYolk.textContent = `${sol.result.peakYolk_C.toFixed(0)}°C`;
  dom.statAfter.textContent = formatClock(cookTime_s - boil_s);
  dom.statBoil.textContent = `${boilingPoint_C().toFixed(1)}°C`;
  // The texture note reads peak temperatures; the white's own criterion is a
  // dose. They disagree only when the pan never gets the white there at all,
  // and then the dose is the one telling the truth.
  dom.note.textContent = sol.whiteSets
    ? textureNote(sol.result.peakYolk_C, sol.result.peakWhite_C)
    : 'white stays runny';
  // The warning line carries one of two things. A refusal is advice about the
  // slider, so it is idle-only: popping "jammy isn't reachable" onto the screen
  // while the egg is already in the water is advice about a control the user
  // cannot reach. A restored cook is the opposite - it only exists mid-cook.
  let warning = '';
  // Only while the cook is still in flight. At DONE the egg is out and "keep
  // this tab open" is advice about a deadline that has already passed.
  if (restored && machine.phase !== 'IDLE' && machine.phase !== 'DONE') {
    warning = 'Picked this cook back up after a reload. The deadlines are right, '
      + 'but the alarm went with the old page — keep this tab open, or Cancel and start again.';
  } else if (machine.phase === 'IDLE' && refusal !== '') {
    warning = refusal;
  }
  dom.warn.textContent = warning;
  dom.warn.hidden = warning === '';
  dom.donenessValue.textContent = donenessValueText(sol.result.peakYolk_C);
  renderDonenessScale(sol);

  let label = '';
  let digits = '';
  let subline = '';
  let spoken = '';

  if (machine.phase === 'IDLE') {
    label = 'Total time';
    digits = formatClock(cookTime_s);
    subline = settings.startMode === 'cold'
      ? `${hasBoilMemory(boilMemory) ? 'assumes' : 'guesses'} ${formatClock(boil_s)} to a rolling boil`
      : standing
        // With the heat off, the time to boil is not on the clock but it IS
        // the pan's loss time constant - the single most load-bearing number
        // in a standing cook, and on a hot start it is never measured. Say so.
        ? `${hasBoilMemory(boilMemory) ? 'assumes' : 'guesses'} this pan takes `
          + `${formatClock(timeToBoil_s())} to boil, which is how fast it cools`
        : 'from eggs in to eggs out';
    spoken = `Total ${spokenClock(cookTime_s)}`;
    setPrimary(
      settings.startMode === 'cold' ? 'Start heating' : 'Eggs in',
      sol.whiteSets
        ? settings.startMode === 'cold'
          ? 'eggs in the pan, lid on, then tap'
          : standing
            ? 'eggs into boiling water, then lid on and heat off'
            : `water at a full rolling boil, and kept there for the whole ${formatClock(cookTime_s)}`
        : 'nothing to start: this pan never sets the white',
      true,
    );
    // There is no cook on offer at all, so there is nothing to start. iOS has
    // always disabled this; the web offered a button that led nowhere.
    dom.primary.disabled = !sol.whiteSets;
    dom.secondary.hidden = true;
  } else if (machine.phase === 'HEATING') {
    label = 'Heating';
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = `${formatClock(secondsHeating(machine, now_ms))} heating · `
      + `provisional, assumes ${formatClock(machine.assumedBoil_s)} to boil`;
    spoken = `Heating. ${spokenClock(secondsToPull(machine, now_ms))} left in total`;
    setPrimary(
      'Full rolling boil',
      standing
        ? 'wait for the whole surface to roll, then lid on and heat off'
        : 'wait for the whole surface to roll',
      true,
    );
    dom.secondary.hidden = false;
    dom.secondary.textContent = 'Cancel';
  } else if (machine.phase === 'COOKING') {
    // The one instruction the user has to act on goes in the phase label, where
    // it sits next to the clock. The model holds the water at its boiling point
    // for the whole cook - or, with the heat off, assumes it cools on its own -
    // so this is not a style note: a pan taken off the heat when the model
    // expected a boil under-cooks by minutes, and vice versa.
    label = standing ? 'Cooking — heat off, lid on' : 'Cooking — keep it boiling';
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = settings.startMode === 'cold'
      ? `boil took ${formatClock(machine.assumedBoil_s)} · `
        + `${formatClock(secondsAfterBoil(machine))} after the boil`
      : 'in the water';
    spoken = `Cooking. ${spokenClock(secondsToPull(machine, now_ms))} left`;
    setPrimary('', standing
      ? `lid on, burner off — the timing assumes the water cools on its own from `
        + `${boilingPoint_C().toFixed(0)}°C`
      : `keep it boiling — the timing assumes ${boilingPoint_C().toFixed(0)}°C right up to the pull`,
    false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = 'Cancel';
  } else if (machine.phase === 'PULL') {
    const late = (now_ms - machine.pulledAt_ms) / 1000;
    label = 'Out of the water — now';
    digits = `+${formatClock(late)}`;
    subline = 'carryover is running';
    spoken = 'Take the eggs out now';
    const into = settings.cooling === 'ice' ? "They're in the ice bath"
      : settings.cooling === 'tap' ? "They're under the tap"
        : "They're out";
    setPrimary(
      into,
      `cooling starts on its own in ${Math.max(0, Math.ceil(PULL_GRACE_SECONDS - late))} s`,
      true,
    );
    // Reachable here too: a reload can land in this phase, and a cook you have
    // picked back up must always be one you can put down.
    dom.secondary.hidden = false;
    dom.secondary.textContent = 'Cancel';
  } else if (machine.phase === 'COOLING') {
    label = settings.cooling === 'ice' ? 'Cooling — leave in the ice' : 'Cooling — keep the water running';
    digits = formatClock(secondsToCool(machine, now_ms));
    subline = `${COOLING_SECONDS / 60} minutes, or the yolk keeps cooking`;
    spoken = `Cooling. ${spokenClock(secondsToCool(machine, now_ms))} left`;
    setPrimary('', '', false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = 'Cancel';
  } else {
    label = 'Done';
    digits = formatClock(cookTime_s);
    subline = settings.startMode === 'cold'
      ? `${formatClock(boil_s)} to boil + ${formatClock(cookTime_s - boil_s)} cooking`
      : 'total in the water';
    spoken = 'Eat.';
    setPrimary('Start again', '', true);
    dom.secondary.hidden = true;
  }

  // The model is calibrated against the literature, not against this kitchen.
  // Asking once per egg is what closes that gap.
  dom.feedback.hidden = machine.phase !== 'DONE' || feedbackGiven;
  // The white question is on screen exactly while one is pending, which is what
  // holding the surface means - see `whiteGrid`.
  dom.whiteFeedback.hidden = whiteGrid === null;
  if (!dom.feedback.hidden) renderCalibNote();

  dom.phaseLabel.textContent = label;
  dom.digits.textContent = digits;
  dom.subline.textContent = subline;

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  const announcement = `${label}. ${spoken}`;
  const minute = digits.split(':')[0];
  const key = `${machine.phase}|${minute}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = announcement;
  }
}

/** The sous-vide readout: hold times from the isothermal limit, and the plain
 *  statement that you should have started yesterday. */
function renderSousVide(now_ms: number): void {
  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = settings.startMode;
  renderStartHint();

  const egg = currentEgg();
  const doneness = donenessFromSlider(settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(calib).alpha_m2s, SOUS_VIDE_BATH_C,
    doneness.yolkDose_min, doneness.whiteDose_min,
  );
  const copy = sousVideCopy(est, now_ms);

  dom.phaseLabel.textContent = 'Start time';
  dom.digits.textContent = copy.headline;
  dom.subline.textContent = copy.subline;
  // The bath temperature is not a peak yolk temperature, and printing it under
  // that label said something false about the egg. In a bath held at 63 °C the
  // yolk ends up at 63 °C, which is the whole point, but the label has to say
  // which number it is.
  dom.statYolkLabel.textContent = 'bath';
  dom.statYolk.textContent = `${est.bath_C.toFixed(0)}°C`;
  dom.statBoil.textContent = `${boilingPoint_C().toFixed(1)}°C`;
  // The slider reading is a pan number. There is no pan.
  dom.donenessValue.textContent = `${anchorNear(settings.doneness).label} · in a ${est.bath_C.toFixed(0)}°C bath`;
  dom.note.textContent = copy.note;
  dom.warn.textContent = copy.warn;
  dom.warn.hidden = false;
  setPrimary('', copy.hint, false);
  dom.secondary.hidden = true;
  dom.feedback.hidden = true;
  dom.whiteFeedback.hidden = true;

  const key = `SOUS|${copy.headline}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = `Sous-vide. You should have started ${copy.headline.toLowerCase()},`
      + ` ${copy.subline}`;
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
    renderSousVide(Date.now());
    return;
  }
  solution = applyAnswer(answerFor(timeToBoil_s(), settings.doneness));
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
function resolveDuring(timeToBoil_s: number): Solution {
  return answerFor(timeToBoil_s, machine.targetLevel, false).solution;
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
  if (calib.eggsLogged === 0) {
    dom.calibNote.textContent = 'Telling it tunes the model to your eggs and your pan.';
  } else {
    dom.calibNote.textContent =
      `tuned on ${calib.eggsLogged} egg${calib.eggsLogged === 1 ? '' : 's'}`
      + ` · ±${calibrationSpread(calib).toFixed(0)}%`;
  }
  renderLearned();
}

/** What this kitchen has taught the app, and the way to take it back. */
function renderLearned(): void {
  const eggs = calib.eggsLogged;
  const pan = hasBoilMemory(boilMemory);
  if (eggs === 0 && !pan) {
    dom.learnedNote.textContent = 'Running on the literature values. '
      + 'It learns your pan when you time a boil, and your taste when you say how an egg was.';
    dom.forget.hidden = true;
    return;
  }
  const parts: string[] = [];
  if (eggs > 0) {
    parts.push(`tuned on ${eggs} egg${eggs === 1 ? '' : 's'} · ±${calibrationSpread(calib).toFixed(0)}%`);
  }
  if (pan) parts.push(`your pan takes ${formatClock(estimateTimeToBoil(boilMemory, settings.waterLitres))} to boil`);
  dom.learnedNote.textContent = parts.join(' · ');
  dom.forget.hidden = false;
}

/** Take it all back. A run of wrong answers about how the eggs were was otherwise
 *  undone only by clearing the site's storage - README 11.5 listed that as a
 *  known gap from the day the iOS app got its own version of this button. */
function onForget(): void {
  calib = clearCalibration();
  boilMemory = {};
  clearBoilMemory();
  renderCalibNote();
  recompute();
}

/** Fold one outcome into the posterior. Rebuilding the dose surface takes a
 *  couple of seconds, so the buttons are disabled while it runs - it happens
 *  once, after the egg is eaten, never in the render path. The readout is left
 *  describing the egg that was eaten; the recalibrated model shows up on the
 *  next "Start again". */
function onFeedback(value: Feedback): void {
  if (feedbackGiven) return;
  feedbackGiven = true;
  whiteGrid = null;
  // Written down before the fold, not after: a reload between the two would
  // otherwise re-ask, and a second answer folds the same egg in twice.
  persistCook();
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;
  dom.calibNote.textContent = 'learning…';

  const cooked = ticket;
  if (cooked === null) return;

  // Yield first so the disabled state and the "learning" note actually paint
  // before the synchronous grid build blocks the main thread.
  window.setTimeout(() => {
    const outcome = recordOutcome(
      calib, cooked.egg, cooked.setup, machine.cookTime_s, cooked.logNominalTarget, value,
    );
    saveCalibration(calib);
    for (let i = 0; i < buttons.length; i++) buttons[i].disabled = false;
    dom.feedback.hidden = true;
    // The second question, and only when the model cannot already guess the
    // answer. On a jammy egg or anything firmer the white is far past setting and
    // every particle agrees, so nothing is asked and the default path stays one
    // tap; on a soft one the white is near its threshold and the answer moves
    // alpha. The decision is `shouldAskAboutWhite` in src/core/infer.ts, so both
    // apps ask on exactly the same eggs.
    if (outcome.askWhite) {
      whiteGrid = outcome.grid;
      dom.whiteFeedback.hidden = false;
    }
    renderCalibNote();
  }, 30);
}

/** Fold the answer about the white into the same egg. It is a second
 *  observation, not a second egg, so the "tuned on N eggs" count does not move -
 *  only the spread does. */
function onWhiteFeedback(value: WhiteReport): void {
  const grid = whiteGrid;
  if (grid === null) return;
  whiteGrid = null;
  const buttons = dom.whiteFeedback.querySelectorAll<HTMLButtonElement>('button.wb');
  for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;
  dom.whiteNote.textContent = 'learning…';

  // No grid to build this time, so this is milliseconds rather than seconds -
  // but it still yields, so the disabled state paints before the arithmetic.
  window.setTimeout(() => {
    recordWhite(calib, grid, machine.cookTime_s, value);
    saveCalibration(calib);
    for (let i = 0; i < buttons.length; i++) buttons[i].disabled = false;
    dom.whiteFeedback.hidden = true;
    renderCalibNote();
  }, 30);
}

/* ------------------------------------------------------------------ input */

function readInputs(source: EventTarget | null): void {
  const sizeIndex = Number(dom.size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : 2;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label.
  let measured_mm = -1;
  if (source === dom.measureMass) {
    measured_mm = minorFromMass_mm(clampNumber(dom.measureMass.value, LIMITS.mass_g, 62));
  } else if (source === dom.measureGirth) {
    measured_mm = minorFromGirth_mm(clampNumber(dom.measureGirth.value, LIMITS.girth_mm, 137));
  } else if (source === dom.measureMinor) {
    measured_mm = clampNumber(dom.measureMinor.value, LIMITS.minor_mm, settings.customMinor_mm);
  }
  if (measured_mm > 0) {
    settings.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, settings.customMinor_mm);
    settings.sizeIndex = -1;
    dom.size.value = '-1';
  }
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  settings.customStart_C = clampNumber(dom.customTemp.value, LIMITS.eggTemp_C, settings.customStart_C);
  settings.altitude_m = clampNumber(dom.altitude.value, LIMITS.altitude_m, settings.altitude_m);
  settings.startMode = radioValue('startMode', 'cold') as UiStartMode;
  settings.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  settings.waterLitres = clampNumber(dom.litres.value, LIMITS.waterLitres, settings.waterLitres);
  settings.eggCount = Math.round(clampNumber(dom.eggCount.value, LIMITS.eggCount, settings.eggCount));
  settings.doneness = clampNumber(dom.doneness.value, LIMITS.doneness, settings.doneness);

  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  syncMeasurements(source);
  scheduleSave();
}

function onInput(event: Event): void {
  readInputs(event.target);
  // Instant feedback on the two readings the eye is on while dragging; the
  // full solve (tens of milliseconds) follows and corrects them.
  dom.donenessValue.textContent = donenessValueText(targetPeakYolk_C(settings.doneness));
  dom.statYolk.textContent = `${targetPeakYolk_C(settings.doneness).toFixed(0)}°C`;
  dom.statBoil.textContent = `${boilingPoint_C().toFixed(1)}°C`;
  dom.body.dataset['start'] = settings.startMode;
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

  if (machine.phase === 'HEATING' && secondsToPull(machine, now) < REVISE_WHEN_LEFT_S
      && now - lastRevise_ms > REVISE_INTERVAL_MS) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    lastRevise_ms = now;
    const assumed = secondsHeating(machine, now) + REVISE_EXTRA_S;
    solution = resolveDuring(assumed);
    if (ticket !== null) ticket = withTimeToBoil(ticket, assumed);
    setMachine(reviseProvisional(machine, solution.result.cookTime_s, assumed));
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
  feedbackGiven = false;
  whiteGrid = null;
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
    solution = applyAnswer(answerFor(boil, settings.doneness));
    const target = settings.doneness;
    const cook = solution.result.cookTime_s;
    // A cook started here is this tab's own, whatever happened before it.
    restored = false;
    ticket = {
      egg: currentEgg(),
      setup: buildSetup(boil),
      logNominalTarget: Math.log10(donenessFromSlider(target).yolkDose_min),
    };
    setMachine(settings.startMode === 'cold'
      ? startCold(now, cook, boil, settings.cooling, target)
      : startHot(now, cook, settings.cooling, target));
    lastRevise_ms = now;
    startTicking();
    blip();
    render(now);
    return;
  }

  if (machine.phase === 'HEATING') {
    const measured = secondsHeating(machine, now);
    boilMemory = rememberTimeToBoil(boilMemory, settings.waterLitres, measured);
    solution = resolveDuring(measured);
    // Patch the measured ramp into the frozen setup rather than rebuilding it
    // from the live controls. They cannot change mid-cook today, which is what
    // made rebuilding harmless rather than correct.
    if (ticket !== null) ticket = withTimeToBoil(ticket, measured);
    setMachine(recordBoil(machine, now, solution.result.cookTime_s));
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
  for (let i = 0; i < SIZE_CLASSES.length; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = SIZE_CLASSES[i].label;
    dom.size.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '-1';
  custom.textContent = 'Measured below…';
  dom.size.append(custom);
}

function buildTicks(): void {
  for (const anchor of DONENESS_ANCHORS) {
    const span = document.createElement('span');
    span.textContent = anchor.label;
    span.style.left = `${anchor.level * 100}%`;
    dom.donenessTicks.append(span);
  }
}

function applyLimit(input: HTMLInputElement, limit: Limit): void {
  input.min = String(limit.lo);
  input.max = String(limit.hi);
}

/** Everything the markup says about numbers comes from the same tables the
 *  model reads, so a bound or a preset changed in one place changes here too. */
function applyConstantsToDom(): void {
  applyLimit(dom.measureMass, LIMITS.mass_g);
  applyLimit(dom.measureGirth, LIMITS.girth_mm);
  applyLimit(dom.measureMinor, LIMITS.minor_mm);
  applyLimit(dom.customTemp, LIMITS.eggTemp_C);
  applyLimit(dom.altitude, LIMITS.altitude_m);
  applyLimit(dom.litres, LIMITS.waterLitres);
  applyLimit(dom.eggCount, LIMITS.eggCount);
  applyLimit(dom.doneness, LIMITS.doneness);
  dom.doneness.step = String(1 / SLIDER_STEPS);
  // The presets are assumptions, and are labelled as such rather than baked
  // into the buttons: a room is not necessarily 20 C, and Custom is there for
  // anyone who knows better.
  dom.startTempHint.textContent = `Fridge is taken as ${START_TEMP_PRESETS_C.fridge}°C and `
    + `room as ${START_TEMP_PRESETS_C.room}°C. Pick Custom if yours differ.`;
  dom.startSousLabel.textContent = `Sous-vide ${SOUS_VIDE_BATH_C}°`;
}

function applySettingsToDom(): void {
  dom.size.value = String(settings.sizeIndex);
  syncMeasurements(null);
  selectRadio('startTemp', settings.startTempMode);
  dom.customTemp.value = String(settings.customStart_C);
  selectRadio('startMode', settings.startMode);
  selectRadio('afterBoil', settings.afterBoil);
  selectRadio('cooling', settings.cooling);
  dom.litres.value = String(settings.waterLitres);
  dom.eggCount.value = String(settings.eggCount);
  dom.altitude.value = String(settings.altitude_m);
  dom.doneness.value = String(settings.doneness);
  dom.customTempField.hidden = settings.startTempMode !== 'custom';
}

export function boot(): void {
  buildSizeOptions();
  buildTicks();
  applyConstantsToDom();
  applySettingsToDom();

  const form = el<HTMLFormElement>('controls');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', (event) => event.preventDefault());

  dom.primary.addEventListener('click', onPrimary);
  dom.secondary.addEventListener('click', reset);
  dom.mute.addEventListener('click', onToggleMute);
  dom.forget.addEventListener('click', onForget);
  setMuted(settings.muted);
  renderMute();

  const fbButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < fbButtons.length; i++) {
    fbButtons[i].addEventListener('click', () => {
      const raw = Number(fbButtons[i].dataset['fb']);
      onFeedback((raw === -1 ? -1 : raw === 1 ? 1 : 0) as Feedback);
    });
  }

  const whiteButtons = dom.whiteFeedback.querySelectorAll<HTMLButtonElement>('button.wb');
  for (let i = 0; i < whiteButtons.length; i++) {
    whiteButtons[i].addEventListener('click', () => {
      onWhiteFeedback(whiteButtons[i].dataset['white'] === 'runny' ? 'runny' : 'set');
    });
  }

  renderCalibNote();
  restoreCook();
  recompute();
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

  machine = back;
  ticket = restoreTicket(stored.ticket);
  feedbackGiven = stored.feedbackGiven;
  restored = true;

  // Without a ticket there is nothing to learn from, so do not offer to learn.
  if (ticket === null) feedbackGiven = true;

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

  return { egg: egg as Egg, setup: setup as CookSetup, logNominalTarget: target };
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
