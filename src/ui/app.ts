/**
 * The application: inputs -> solver -> readout, and the cook itself.
 *
 * The app is the timer. It measures the time to a rolling boil rather than
 * asking the user to stopwatch it elsewhere, which is the one measurement the
 * model cannot guess and the user cannot be bothered to take separately.
 */

import { Egg, eggFromMass, eggFromMinorDiameter, SIZE_CLASSES } from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
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
  Settings, clampNumber, estimateTimeToBoil, hasBoilMemory,
  loadBoilMemory, loadSettings, rememberTimeToBoil, saveSettings,
} from './store.js';
import {
  Machine, advance, beginCooling, idleMachine, isRunning, recordBoil, reviseProvisional,
  secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull, startCold, startHot,
  COOLING_SECONDS, PULL_GRACE_SECONDS,
} from './machine.js';
import { Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, startTicker, stopAlarm } from './clock.js';

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
  doneness: el<HTMLInputElement>('doneness'),
  donenessBlocked: el<HTMLDivElement>('donenessBlocked'),
  donenessTicks: el<HTMLDivElement>('donenessTicks'),
  donenessValue: el<HTMLParagraphElement>('donenessValue'),
  size: el<HTMLSelectElement>('size'),
  customSizeField: el<HTMLDivElement>('customSizeField'),
  customMinor: el<HTMLInputElement>('customMinor'),
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

/** Posterior over the model's uncertain constants, learned from how the user's
 *  own eggs actually turn out. Before any feedback this is the prior mean,
 *  i.e. the literature values. */
let calib: Calibration = loadCalibration();

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
let machine: Machine = idleMachine(settings.cooling);
let solution: Solution | null = null;
/** Time to boil, s, that the current solution was computed with. */
let solvedBoil_s = 0;
/** Set when the requested doneness had to be clamped; empty otherwise. */
let refusal = '';
let ticker: Ticker | null = null;
let solveHandle = 0;
let lastRevise_ms = 0;
let lastAnnounced = '';

/* --------------------------------------------------------------- physics */

function currentEgg(): Egg {
  if (settings.sizeIndex < 0 || settings.sizeIndex >= SIZE_CLASSES.length) {
    return eggFromMinorDiameter(settings.customMinor_mm / 1000);
  }
  return eggFromMass(SIZE_CLASSES[settings.sizeIndex].mass_kg);
}

function eggStart_C(): number {
  if (settings.startTempMode === 'fridge') return 4;
  if (settings.startTempMode === 'room') return 20;
  return settings.customStart_C;
}

function boilingPoint_C(): number {
  return boilingPointAtAltitude(settings.altitude_m);
}

function buildSetup(egg: Egg, timeToBoil_s: number): CookSetup {
  return {
    startMode: settings.startMode,
    eggStart_C: eggStart_C(),
    ambient_C: 20,
    boiling_C: boilingPoint_C(),
    timeToBoil_s: settings.startMode === 'cold' ? timeToBoil_s : 0,
    cooling: settings.cooling,
    waterLitres: settings.waterLitres,
    eggCount: settings.eggCount,
    eggMass_kg: egg.mass_kg,
  };
}

/** Best available time to a rolling boil before one has been measured. */
function provisionalBoil_s(): number {
  return estimateTimeToBoil(boilMemory, settings.waterLitres);
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

/** Solve for the current inputs, clamping the slider to what is physically
 *  achievable. `reachable: false` means even the shortest cook that sets the
 *  white already overshoots the requested yolk. */
function solve(timeToBoil_s: number): Solution {
  const egg = currentEgg();
  const setup = buildSetup(egg, timeToBoil_s);
  const params = calibrationParams(calib);
  let result = solveCookTime(egg, setup, params, donenessFromSlider(settings.doneness));
  solvedBoil_s = settings.startMode === 'cold' ? timeToBoil_s : 0;

  if (result.reachable) {
    refusal = '';
    return result;
  }

  refusal = refusalText(settings.doneness, result.softestLevel, settings.cooling);
  const snapped = clampNumber(Math.ceil(result.softestLevel * 100) / 100, 0, 1, 1);
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

function renderDonenessScale(softestLevel: number): void {
  const blockedPercent = Math.max(0, Math.min(100, softestLevel * 100));
  dom.donenessBlocked.style.width = `${blockedPercent}%`;
  dom.doneness.setAttribute('aria-valuetext', anchorNear(settings.doneness).label);
  const ticks = dom.donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    const anchor = DONENESS_ANCHORS[i];
    if (anchor === undefined) continue;
    ticks[i].classList.toggle('blocked', anchor.level < softestLevel - 0.005);
  }
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
  const boil_s = machine.phase === 'IDLE' ? solvedBoil_s : machine.assumedBoil_s;

  dom.statYolk.textContent = `${sol.result.peakYolk_C.toFixed(0)}°C`;
  dom.statAfter.textContent = formatClock(cookTime_s - boil_s);
  dom.statBoil.textContent = `${boilingPoint_C().toFixed(1)}°C`;
  dom.note.textContent = textureNote(sol.result.peakYolk_C, sol.result.peakWhite_C);
  dom.warn.textContent = refusal;
  dom.warn.hidden = refusal === '';
  dom.donenessValue.textContent = `${anchorNear(settings.doneness).label} · `
    + `peak yolk ${sol.result.peakYolk_C.toFixed(0)}°C`;
  renderDonenessScale(sol.softestLevel);

  let label = '';
  let digits = '';
  let subline = '';
  let spoken = '';

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
        : 'water should already be at a full rolling boil',
      true,
    );
    dom.secondary.hidden = true;
  } else if (machine.phase === 'HEATING') {
    label = 'Heating';
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = `${formatClock(secondsHeating(machine, now_ms))} heating · `
      + `provisional, assumes ${formatClock(machine.assumedBoil_s)} to boil`;
    spoken = `Heating. ${spokenClock(secondsToPull(machine, now_ms))} left in total`;
    setPrimary('Full rolling boil', 'wait for the whole surface to roll', true);
    dom.secondary.hidden = false;
    dom.secondary.textContent = 'Cancel';
  } else if (machine.phase === 'COOKING') {
    label = 'Cooking';
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = settings.startMode === 'cold'
      ? `boil took ${formatClock(machine.assumedBoil_s)} · `
        + `${formatClock(secondsAfterBoil(machine))} after the boil`
      : 'in the water';
    spoken = `Cooking. ${spokenClock(secondsToPull(machine, now_ms))} left`;
    setPrimary('', '', false);
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
  solution = solve(
    isRunning(machine) && !machine.provisional && machine.phase !== 'HEATING'
      ? machine.assumedBoil_s
      : provisionalBoil_s(),
  );
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

let feedbackGiven = false;

function renderCalibNote(): void {
  if (calib.eggsLogged === 0) {
    dom.calibNote.textContent = 'Telling it tunes the model to your eggs and your pan.';
    return;
  }
  dom.calibNote.textContent =
    `tuned on ${calib.eggsLogged} egg${calib.eggsLogged === 1 ? '' : 's'}`
    + ` · \u00b1${calibrationSpread(calib).toFixed(0)}%`;
}

/** Fold one outcome into the posterior. Rebuilding the dose surface takes a
 *  couple of seconds, so the buttons are disabled while it runs - it happens
 *  once, after the egg is eaten, never in the render path. */
function onFeedback(value: Feedback): void {
  if (feedbackGiven) return;
  feedbackGiven = true;
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;
  dom.calibNote.textContent = 'learning\u2026';

  const egg = currentEgg();
  const setup = buildSetup(egg, machine.assumedBoil_s);
  const logTarget = Math.log10(donenessFromSlider(settings.doneness).yolkDose_min);

  // Yield first so the disabled state and the "learning" note actually paint
  // before the synchronous grid build blocks the main thread.
  window.setTimeout(() => {
    recordOutcome(calib, egg, setup, machine.cookTime_s, logTarget, value);
    saveCalibration(calib);
    for (let i = 0; i < buttons.length; i++) buttons[i].disabled = false;
    dom.feedback.hidden = true;
    renderCalibNote();
    recompute();
  }, 30);
}

/* ------------------------------------------------------------------ input */

function readInputs(): void {
  const sizeIndex = Number(dom.size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : 2;
  settings.customMinor_mm = clampNumber(dom.customMinor.value, 30, 60, settings.customMinor_mm);
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  settings.customStart_C = clampNumber(dom.customTemp.value, -2, 40, settings.customStart_C);
  settings.altitude_m = clampNumber(dom.altitude.value, -400, 5000, settings.altitude_m);
  settings.startMode = radioValue('startMode', 'cold') as StartMode;
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  settings.waterLitres = clampNumber(dom.litres.value, 0.25, 12, settings.waterLitres);
  settings.eggCount = Math.round(clampNumber(dom.eggCount.value, 1, 24, settings.eggCount));
  settings.doneness = clampNumber(dom.doneness.value, 0, 1, settings.doneness);

  dom.customSizeField.hidden = settings.sizeIndex >= 0;
  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  machine = { ...machine, cooling: settings.cooling };
  saveSettings(settings);
}

function onInput(): void {
  readInputs();
  // Instant feedback on the two readings the eye is on while dragging; the
  // full solve (tens of milliseconds) follows and corrects them.
  dom.donenessValue.textContent = anchorNear(settings.doneness).label;
  dom.statYolk.textContent = `${targetPeakYolk_C(settings.doneness).toFixed(0)}°C`;
  dom.statBoil.textContent = `${boilingPoint_C().toFixed(1)}°C`;
  dom.body.dataset['start'] = settings.startMode;
  scheduleSolve();
}

/* ------------------------------------------------------------------ cook */

function onTick(): void {
  const now = Date.now();

  if (machine.phase === 'HEATING' && secondsToPull(machine, now) < 45
      && now - lastRevise_ms > 10000) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    lastRevise_ms = now;
    const assumed = secondsHeating(machine, now) + 60;
    const revised = solve(assumed);
    solution = revised;
    machine = reviseProvisional(machine, revised.result.cookTime_s, assumed);
  }

  const step = advance(machine, now);
  if (step.machine !== machine) {
    machine = step.machine;
    if (step.event === 'pull') ringAlarm(true);
    if (step.event === 'done') ringAlarm(false);
    if (machine.phase === 'DONE') {
      // Nothing left to count. Stop repainting and let the screen sleep.
      stopTicking();
      releaseScreen();
    }
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

function resetFeedbackLatch(): void {
  feedbackGiven = false;
}

function reset(): void {
  stopAlarm();
  stopTicking();
  releaseScreen();
  resetFeedbackLatch();
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
    const boil = provisionalBoil_s();
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
    rememberTimeToBoil(settings.waterLitres, measured);
    boilMemory = loadBoilMemory();
    solution = solve(measured);
    machine = recordBoil(machine, now, solution.result.cookTime_s);
    blip();
    onTick();
    return;
  }

  if (machine.phase === 'PULL') {
    machine = beginCooling(machine, now);
    if (machine.phase === 'DONE') {
      ringAlarm(false);
      stopTicking();
      releaseScreen();
    }
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
  custom.textContent = 'Measured width…';
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

function applySettingsToDom(): void {
  dom.size.value = String(settings.sizeIndex);
  if (dom.size.value === '') dom.size.value = '-1';
  dom.customMinor.value = String(settings.customMinor_mm);
  selectRadio('startTemp', settings.startTempMode);
  dom.customTemp.value = String(settings.customStart_C);
  selectRadio('startMode', settings.startMode);
  selectRadio('cooling', settings.cooling);
  dom.litres.value = String(settings.waterLitres);
  dom.eggCount.value = String(settings.eggCount);
  dom.altitude.value = String(settings.altitude_m);
  dom.doneness.value = String(settings.doneness);
  dom.customSizeField.hidden = settings.sizeIndex >= 0;
  dom.customTempField.hidden = settings.startTempMode !== 'custom';
}

export function boot(): void {
  buildSizeOptions();
  buildTicks();
  applySettingsToDom();

  const form = el<HTMLFormElement>('controls');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', (event) => event.preventDefault());

  dom.primary.addEventListener('click', onPrimary);
  dom.secondary.addEventListener('click', reset);

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
