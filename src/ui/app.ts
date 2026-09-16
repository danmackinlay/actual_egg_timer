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

import { T_ROOM_C } from '../core/constants.js';
import { Egg, eggFromMass, eggFromMinorDiameter, SIZE_CLASSES } from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import {
  DONENESS_ANCHORS, DonenessAnchor, Solution,
  donenessFromSlider, solveCookTime,
} from '../core/solve.js';
import { Feedback } from '../core/infer.js';
import {
  Calibration, loadCalibration, saveCalibration, calibrationParams,
  calibrationSpread, recordOutcome,
} from './calibration.js';
import {
  LIMITS, Limit, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber,
  estimateTimeToBoil, hasBoilMemory, loadBoilMemory, loadSettings,
  rememberTimeToBoil, saveSettings,
} from './store.js';
import { sousVideCopy } from './sousvide.js';
import {
  Machine, advance, beginCooling, idleMachine, recordBoil, reviseProvisional,
  secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull, startCold, startHot,
  COOLING_SECONDS, PULL_GRACE_SECONDS,
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
  tempFridgeDeg: el<HTMLSpanElement>('tempFridgeDeg'),
  tempRoomDeg: el<HTMLSpanElement>('tempRoomDeg'),
  sousDeg: el<HTMLSpanElement>('sousDeg'),
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
const calib: Calibration = loadCalibration();
let machine: Machine = idleMachine(settings.cooling);
let solution: Solution | null = null;
/** Set when the requested doneness had to be clamped; empty otherwise. */
let refusal = '';
let ticker: Ticker | null = null;
let solveHandle = 0;
let lastRevise_ms = 0;
let lastAnnounced = '';
/** One report per egg: the feedback buttons go away once one is pressed. */
let feedbackGiven = false;

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

/** An egg at or above this has been sitting out, and so says what the room
 *  is. Below it the egg came from somewhere colder than any kitchen and says
 *  nothing about the room at all. */
const ROOM_FROM_EGG_MIN_C = 15;

/** The room, as far as the model is concerned.
 *
 *  There is no separate input for it, and there should not be: on the app's
 *  default path - eggs into boiling water, straight into an ice bath - the room
 *  is worth nothing at all, and on a cold start it is worth about two seconds
 *  per degree. It earns its keep in exactly two places, resting on the counter
 *  and standing with the heat off, and in both of those the user has usually
 *  already told us: an egg that has been sitting out IS at room temperature.
 *  A fridge egg says nothing about the room, so that case keeps the default. */
function ambient_C(): number {
  const egg = eggStart_C();
  return egg >= ROOM_FROM_EGG_MIN_C ? egg : T_ROOM_C;
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

function buildSetup(egg: Egg, timeToBoil_s: number): CookSetup {
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
    eggMass_kg: egg.mass_kg,
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

/** Peak yolk temperature the slider is asking for, interpolated between the
 *  anchors. The dose scale is logarithmic precisely so that this is linear in
 *  temperature, so a straight interpolation is right - and it costs nothing,
 *  which lets the reading track the thumb while the real solve catches up. */
function targetPeakYolk_C(level: number): number {
  for (let i = 1; i < DONENESS_ANCHORS.length; i += 1) {
    const hi = DONENESS_ANCHORS[i];
    const lo = DONENESS_ANCHORS[i - 1];
    if (level <= hi.level) {
      const span = hi.level - lo.level;
      const f = span <= 0 ? 0 : (level - lo.level) / span;
      return lo.approxPeakYolk_C + f * (hi.approxPeakYolk_C - lo.approxPeakYolk_C);
    }
  }
  return DONENESS_ANCHORS[DONENESS_ANCHORS.length - 1].approxPeakYolk_C;
}

function anchorNear(level: number): DonenessAnchor {
  let best = DONENESS_ANCHORS[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const anchor of DONENESS_ANCHORS) {
    const gap = Math.abs(anchor.level - level);
    if (gap < bestGap) {
      bestGap = gap;
      best = anchor;
    }
  }
  return best;
}

/** Why the requested doneness was refused, and what to do about it. The point
 *  is to teach the constraint, not merely to block the control. */
function refusalText(wanted: number, softest: number, cooling: Cooling): string {
  const wantedLabel = anchorNear(wanted).label.toLowerCase();
  const softestLabel = anchorNear(softest).label.toLowerCase();
  // A sliver of unreachable track at the runny end is normal and not worth a
  // sentence; only explain a refusal the user can actually feel.
  if (wantedLabel === softestLabel) return '';
  if (cooling === 'counter') {
    return `Resting on the counter keeps cooking the yolk — ${wantedLabel} isn't reachable. `
      + `Softest here is ${softestLabel}. Use an ice bath.`;
  }
  if (cooling === 'tap') {
    return `A cold tap doesn't pull the heat out fast enough — ${wantedLabel} isn't reachable. `
      + `Softest here is ${softestLabel}. Ice water gets you further.`;
  }
  return `Any shorter and the white is still raw — ${wantedLabel} isn't reachable for this egg. `
    + `Softest here is ${softestLabel}.`;
}

/** The standing method's worst failure: the water falls past the temperature
 *  the white needs before the white has had it, so there is no cook here at
 *  all - not a soft one, not a hard one. */
function whiteNeverSetsText(): string {
  return `With the heat off this pan never sets the white: the water falls below `
    + `what the white needs while the egg is still in it. Nothing on the slider is `
    + `reachable. More water, a slower boil, or keep it boiling.`;
}

/** The standing method's own failure: the pan cools off before the yolk gets
 *  where it was asked to go, and no amount of waiting fixes it. */
function standingRefusalText(wanted: number, hardest: number): string {
  const wantedLabel = anchorNear(wanted).label.toLowerCase();
  const hardestLabel = anchorNear(hardest).label.toLowerCase();
  // Same rule as the soft end: a sliver off the top is not worth a sentence.
  if (wantedLabel === hardestLabel) return '';
  return `With the heat off, the water runs out before the yolk gets there — `
    + `${wantedLabel} isn't reachable in ${settings.waterLitres} L. `
    + `Hardest here is ${hardestLabel}. More water, or keep it boiling.`;
}

/** Positions per unit of slider travel. The input element's step is set from
 *  this, so a snapped level always lands where the thumb can sit. */
const SLIDER_STEPS = 100;

/** Round a level onto the slider's grid, away from the unreachable side. The
 *  nudge keeps a level already on the grid from being pushed a whole step by
 *  floating-point noise. */
function snapUp(level: number): number {
  return clampNumber(Math.ceil(level * SLIDER_STEPS - 1e-9) / SLIDER_STEPS, LIMITS.doneness, 1);
}

function snapDown(level: number): number {
  return clampNumber(Math.floor(level * SLIDER_STEPS + 1e-9) / SLIDER_STEPS, LIMITS.doneness, 0);
}

/** Solve for the current inputs, clamping the slider to what is physically
 *  achievable. `reachable: false` means even the shortest cook that sets the
 *  white already overshoots the requested yolk. Sets `refusal` as a side
 *  effect, and may move the slider. */
function solve(timeToBoil_s: number): Solution {
  const egg = currentEgg();
  const setup = buildSetup(egg, timeToBoil_s);
  const params = calibrationParams(calib);
  let result = solveCookTime(egg, setup, params, donenessFromSlider(settings.doneness));

  if (result.reachable) {
    refusal = '';
    return result;
  }

  // Two ways to be unreachable, and they snap the slider in opposite
  // directions: too soft for the white (snap up), or harder than a cooling pan
  // can manage (snap down).
  if (!result.whiteSets) {
    // Nothing to snap to: the slider has no reachable position at all. The
    // numbers shown are the furthest this pan goes, which is the only honest
    // thing left to put on screen.
    refusal = whiteNeverSetsText();
    return result;
  }

  if (settings.doneness > result.hardestLevel) {
    // No re-solve: the solver already answered with the furthest this pan goes,
    // so the numbers on screen are the numbers for the only cook on offer.
    refusal = standingRefusalText(settings.doneness, result.hardestLevel);
    const capped = snapDown(result.hardestLevel);
    if (capped < settings.doneness) {
      settings.doneness = capped;
      dom.doneness.value = String(capped);
      saveSettings(settings);
    }
    return result;
  }

  refusal = refusalText(settings.doneness, result.softestLevel, settings.cooling);
  const snapped = snapUp(result.softestLevel);
  if (snapped > settings.doneness) {
    settings.doneness = snapped;
    dom.doneness.value = String(snapped);
    // Re-solve at the snapped position so the numbers on screen are the
    // numbers for the cook the user is now being offered.
    const retry = solveCookTime(egg, setup, params, donenessFromSlider(snapped));
    if (retry.reachable) result = retry;
    saveSettings(settings);
  }
  return result;
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

/** One line on what the model expects of this cook. */
function textureNote(peakYolk_C: number, peakWhite_C: number): string {
  const white = peakWhite_C < 71 ? 'white just set'
    : peakWhite_C < 82 ? 'white set'
      : 'white firm';
  const yolk = peakYolk_C < 58 ? 'yolk liquid'
    : peakYolk_C < 63 ? 'yolk soft, barely thickened'
      : peakYolk_C < 68 ? 'yolk jammy'
        : peakYolk_C < 73 ? 'yolk fudgy'
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
  dom.primaryHint.textContent = hint;
}

function render(now_ms: number): void {
  const sol = solution;
  if (sol === null) return;

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
  dom.warn.textContent = refusal;
  dom.warn.hidden = refusal === '';
  dom.donenessValue.textContent = donenessValueText(sol.result.peakYolk_C);
  renderDonenessScale(sol);

  let label = '';
  let digits = '';
  let subline = '';
  let spoken = '';

  // Sous-vide is answered honestly and separately: no cook to run, no clock to
  // start, and a start time that has already been and gone.
  if (isSousVide() && machine.phase === 'IDLE') {
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
    dom.statYolk.textContent = `${est.bath_C.toFixed(0)}°C`;
    dom.note.textContent = copy.note;
    dom.warn.textContent = copy.warn;
    dom.warn.hidden = false;
    setPrimary('', copy.hint, false);
    dom.secondary.hidden = true;
    dom.feedback.hidden = true;

    const key = `SOUS|${copy.headline}`;
    if (key !== lastAnnounced) {
      lastAnnounced = key;
      dom.announce.textContent = `Sous-vide. You should have started ${copy.headline.toLowerCase()},`
        + ` ${copy.subline}`;
    }
    return;
  }

  if (machine.phase === 'IDLE') {
    label = 'Total time';
    digits = formatClock(cookTime_s);
    subline = settings.startMode === 'cold'
      ? `${hasBoilMemory(boilMemory) ? 'assumes' : 'guesses'} ${formatClock(boil_s)} to a rolling boil`
      : 'from eggs in to eggs out';
    spoken = `Total ${spokenClock(cookTime_s)}`;
    setPrimary(
      settings.startMode === 'cold' ? 'Start heating' : 'Eggs in',
      settings.startMode === 'cold'
        ? 'eggs in the pan, lid on, then tap'
        : standing
          ? 'eggs into boiling water, then lid on and heat off'
          : `water at a full rolling boil, and kept there for the whole ${formatClock(cookTime_s)}`,
      true,
    );
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
    dom.secondary.hidden = true;
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

/* -------------------------------------------------------------- recompute */

function recompute(): void {
  solution = solve(timeToBoil_s());
  render(Date.now());
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

/* ------------------------------------------------------------ calibration */

function renderCalibNote(): void {
  if (calib.eggsLogged === 0) {
    dom.calibNote.textContent = 'Telling it tunes the model to your eggs and your pan.';
    return;
  }
  dom.calibNote.textContent =
    `tuned on ${calib.eggsLogged} egg${calib.eggsLogged === 1 ? '' : 's'}`
    + ` · ±${calibrationSpread(calib).toFixed(0)}%`;
}

/** Fold one outcome into the posterior. Rebuilding the dose surface takes a
 *  couple of seconds, so the buttons are disabled while it runs - it happens
 *  once, after the egg is eaten, never in the render path. The readout is left
 *  describing the egg that was eaten; the recalibrated model shows up on the
 *  next "Start again". */
function onFeedback(value: Feedback): void {
  if (feedbackGiven) return;
  feedbackGiven = true;
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;
  dom.calibNote.textContent = 'learning…';

  const egg = currentEgg();
  const setup = buildSetup(egg, timeToBoil_s());
  const logTarget = Math.log10(donenessFromSlider(settings.doneness).yolkDose_min);

  // Yield first so the disabled state and the "learning" note actually paint
  // before the synchronous grid build blocks the main thread.
  window.setTimeout(() => {
    recordOutcome(calib, egg, setup, machine.cookTime_s, logTarget, value);
    saveCalibration(calib);
    for (let i = 0; i < buttons.length; i++) buttons[i].disabled = false;
    dom.feedback.hidden = true;
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
  saveSettings(settings);
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
    solution = solve(assumed);
    machine = reviseProvisional(machine, solution.result.cookTime_s, assumed);
  }

  const step = advance(machine, now);
  if (step.machine !== machine) {
    machine = step.machine;
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
  machine = idleMachine(settings.cooling);
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
    solution = solve(boil);
    const cook = solution.result.cookTime_s;
    machine = settings.startMode === 'cold'
      ? startCold(now, cook, boil, settings.cooling)
      : startHot(now, cook, settings.cooling);
    lastRevise_ms = now;
    startTicking();
    blip();
    render(now);
    return;
  }

  if (machine.phase === 'HEATING') {
    const measured = secondsHeating(machine, now);
    boilMemory = rememberTimeToBoil(boilMemory, settings.waterLitres, measured);
    solution = solve(measured);
    machine = recordBoil(machine, now, solution.result.cookTime_s);
    blip();
    onTick();
    return;
  }

  if (machine.phase === 'PULL') {
    machine = beginCooling(machine, now);
    if (machine.phase === 'DONE') finishCook();
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
  dom.tempFridgeDeg.textContent = `${START_TEMP_PRESETS_C.fridge}°`;
  dom.tempRoomDeg.textContent = `${START_TEMP_PRESETS_C.room}°`;
  dom.sousDeg.textContent = `${SOUS_VIDE_BATH_C}°`;
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
  setMuted(settings.muted);
  renderMute();

  const fbButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < fbButtons.length; i++) {
    fbButtons[i].addEventListener('click', () => {
      const raw = Number(fbButtons[i].dataset['fb']);
      onFeedback((raw === -1 ? -1 : raw === 1 ? 1 : 0) as Feedback);
    });
  }

  // A reload mid-cook loses the deadlines; better to say so by starting clean
  // than to resume a timer that may be minutes wrong.
  recompute();
}
