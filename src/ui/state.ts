/**
 * The page's model, in one place (`state`, a `Model`: model.ts), and what it
 * derives: the egg and the pot on screen, how the cook starts, and the time
 * to a rolling boil. Each derivation takes the model it reads, so `update`
 * and `view` can ask it of any model, not only this page's.
 *
 * The app is the timer. It measures the time to a rolling boil rather than
 * asking the user to stopwatch it elsewhere, which is the one measurement the
 * model cannot guess and the user cannot be bothered to take separately.
 *
 * While idle the controls are the cook to be: the settings, read as core's
 * `CookChoices` (`choicesOf`). Once a cook is running it is core's
 * `RunningCook` (src/core/running.ts): its start, its own choices and what it
 * observed, with everything else - the deadlines, the time, the record -
 * derived as its `CookPlan`. A running cook is described by its own choices,
 * never by the settings, which another tab may have changed since.
 */

import { Egg, SizeClass, eggFromMass, eggFromMinorDiameter, sizeClassesFor, sizeTableFor } from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { roomInUse } from '../core/inputs.js';
import { CookChoices, CookPot, Phase, cookSetupOf, phaseAt } from '../core/running.js';
import type { CookNeed } from '../core/step.js';
import type { Learning } from './learned.js';
import type { Model } from './model.js';
import { Settings, UiStartMode, estimateTimeToBoil } from './store.js';
import { REGION } from './units.js';

/** The carton's size classes, by the browser's region (`REGION`, in units.ts)
 *  alone: not the language, and not the units - an American carton is an
 *  American carton in grams too. Fixed for the life of the page. A stored
 *  index is read against it, and keeps its name if the region has changed
 *  since it was saved. */
export const sizeClasses = sizeClassesFor(REGION);

/** Nothing wanted. */
export const NO_NEED: CookNeed = { surface: null, before: false, beforeSurface: null, wakeAt_s: null };

/** A model with nothing on it yet: the settings, the pans and the calibration
 *  are `boot()`'s to read (app.ts). */
export function emptyModel(): Model {
  return {
    settings: null!,
    controls: null!,
    boilMemory: null!,
    calib: null!,
    sharing: false,
    readOnly: false,
    storedId_ms: null,
    deletedHere: false,
    share: null,
    redraws: { controls: 0, units: 0, doneness: 0, alarm: 0, echo: 0, learned: 0, share: 0, words: 0 },
    echoSource: null,
    note: { rev: 0, say: 'learned' },
    profiles: [],
    idleAnswer: null,
    solution: null,
    decision: null,
    outcome: null,
    chosen: null,
    profile: null,
    unsolved: false,
    aim: null,
    edit: null,
    controlsStart_s: null,
    nudgeDraw: 0,
    held: null,
    live: null,
    cook: null,
    plan: null,
    leanHint_s: 0,
    need: NO_NEED,
    ending: [],
    before: [],
    surfaces: [],
    appVersion: '',
    prior: '',
    pull_s: null,
    written: null,
    works: true,
    closed: false,
    questions: 'open',
    reloaded: false,
    probeHeld: false,
  };
}

/** The page's model (model.ts): what cook.ts's `dispatch` keeps, and reads
 *  for the page. The settings, the pans and the calibration are read from
 *  storage by `boot()` (app.ts), not when this module is imported, so a test
 *  can import it. */
export const state: Model = emptyModel();

/* --------------------------------------------------------------- physics */

/** The settings as core's choices: the cook the controls describe, for the
 *  carton of `region` (`sizeClassesFor`). The egg is its size class's mass, or
 *  the measured egg's, from its width; the room counts only with the probe on
 *  (`roomInUse`). Sous-vide is answered by src/core/sousvide.ts and starts no
 *  cook, so as far as the cook solver is concerned it is an egg going into
 *  water already hot. Pure, so a test can ask it. */
export function choicesOf(settings: Settings, region: string | null): CookChoices {
  const classes = sizeClassesFor(region);
  const byClass = settings.sizeIndex >= 0 && settings.sizeIndex < classes.length;
  return {
    mass_kg: byClass ? classes[settings.sizeIndex].mass_kg : eggFromMinorDiameter(settings.customMinor_mm / 1000).mass_kg,
    massFrom: byClass ? 'class' : settings.measuredBy,
    sizeTable: byClass ? sizeTableFor(region) : null,
    eggFrom: settings.startTempMode,
    customStart_C: settings.customStart_C,
    room_C: roomInUse(settings.probe, settings.room_C),
    startMode: settings.startMode === 'cold' ? 'cold' : 'hot',
    afterBoil: settings.afterBoil,
    cooling: settings.cooling,
    waterLitres: settings.waterLitres,
    eggCount: settings.eggCount,
    altitude_m: settings.altitude_m,
    level: settings.doneness,
  };
}

/** The cook the settings describe, as core's choices: the idle screen's,
 *  and the next cook's. */
export function idleChoices(m: Model): CookChoices {
  return choicesOf(m.settings, REGION);
}

/**
 * `settings` with a cook's choices over them, as the controls show them: the
 * egg's class by its mass in `classes` (this page's carton), else the egg
 * measured, its width from its mass; the rest field by field. What the
 * choices do not hold - the units, the language, the sound, the probe - is
 * the settings'. A room the choices count makes the probe on. Pure.
 */
export function settingsOfChoices(settings: Settings, ch: CookChoices, classes: SizeClass[]): Settings {
  const index = ch.massFrom === 'class' ? classes.findIndex((c) => c.mass_kg === ch.mass_kg) : -1;
  const byClass = index >= 0;
  return {
    ...settings,
    sizeIndex: index,
    customMinor_mm: byClass ? settings.customMinor_mm : eggFromMass(ch.mass_kg).minorDiameter_m * 1000,
    measuredBy: byClass || ch.massFrom === 'class' ? settings.measuredBy : ch.massFrom,
    startTempMode: ch.eggFrom,
    customStart_C: ch.customStart_C,
    startMode: ch.startMode,
    afterBoil: ch.afterBoil,
    cooling: ch.cooling,
    waterLitres: ch.waterLitres,
    eggCount: ch.eggCount,
    altitude_m: ch.altitude_m,
    doneness: ch.level,
    probe: ch.room_C !== null ? true : settings.probe,
    room_C: ch.room_C !== null ? ch.room_C : settings.probe ? null : settings.room_C,
  };
}

/** The egg and the pot the settings describe, for a time to a rolling boil:
 *  core's `cookSetupOf`, the one assembly both apps and a running cook share. */
export function idlePot(m: Model, boil_s: number = timeToBoil_s(m)): CookPot {
  return cookSetupOf(idleChoices(m), boil_s);
}

/** The egg the controls describe. */
export function currentEgg(m: Model): Egg {
  return cookSetupOf(choicesOf(m.controls, REGION), timeToBoil_s(m)).egg;
}

/** The room as the cook measured it, while it counts, or null to assume one
 *  (`roomInUse`: only with the probe on), as the controls say. */
export function room_C(m: Model): number | null {
  return roomInUse(m.controls.probe, m.controls.room_C);
}

export function boilingPoint_C(m: Model): number {
  return boilingPointAtAltitude(m.controls.altitude_m);
}

/** Sous-vide on the idle screen: it starts no cook, so a running one never
 *  is. */
export function isSousVide(m: Model): boolean {
  return m.cook === null && m.settings.startMode === 'sous';
}

/** Time to a rolling boil on the settings' pot, remembered or guessed, s: the
 *  pan's one measured number, and the one thing the solver needs that the
 *  settings do not hold. A running cook's is its plan's - the guess, the slow
 *  hob's, or the tap - never this. A hot start never times it and the physics
 *  never reads it there - with the heat off the pan's cooling comes from the
 *  water volume (see panTimeConstant) - but the setup still carries the
 *  remembered value, so the record can say which pan was assumed. */
export function timeToBoil_s(m: Model): number {
  return estimateTimeToBoil(m.boilMemory, m.settings.waterLitres);
}

/** The phase of the cook on screen at `now_ms`: idle, or what core's
 *  `phaseAt` reads from the running cook's plan. */
export function phaseNow(m: Model, now_ms: number): Phase {
  return m.plan === null ? 'IDLE' : phaseAt(m.plan.deadlines, now_ms / 1000);
}

/** How the cook on screen starts: the running cook's, or the settings'. */
export function startModeNow(m: Model): UiStartMode {
  return m.cook?.choices.startMode ?? m.settings.startMode;
}

/** What has been learned, as it stands now, for learned.ts to say. */
export function learning(m: Model): Learning {
  return { eggs: m.calib.eggsLogged, boilMemory: m.boilMemory, waterLitres: m.settings.waterLitres };
}
