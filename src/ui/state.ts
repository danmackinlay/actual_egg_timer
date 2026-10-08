/**
 * The page's state, in one place (`state`), and what it derives: the egg and
 * the pot on screen, how the cook starts, and the time to a rolling boil.
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
 * never by the settings, which another tab may have changed since
 * (DECISIONS.md 97).
 */

import { Egg, eggFromMinorDiameter, sizeClassesFor, sizeTableFor } from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Solution } from '../core/solve.js';
import { BoilMemory, Phase, phaseAt, roomInUse } from '../core/policy.js';
import { Decision } from '../core/decide.js';
import { DecidedAnswer, OddsProfile } from '../core/reach.js';
import { MassFrom } from '../core/record.js';
import { Outcome } from '../core/outcome.js';
import { CookChoices, CookPlan, CookPot, RunningCook, cookSetupOf } from '../core/running.js';
import { Calibration } from './calibration.js';
import { Learning } from './learned.js';
import { Settings, UiStartMode, estimateTimeToBoil } from './store.js';
import { REGION } from './units.js';

/** The carton's size classes, by the browser's region (`REGION`, in units.ts)
 *  alone: not the language, and not the units - an American carton is an
 *  American carton in grams too. Fixed for the life of the page. A stored
 *  index is read against it, and keeps its name if the region has changed
 *  since it was saved. */
export const sizeClasses = sizeClassesFor(REGION);

/** What the page holds: the setup, what has been learned, the cook under way
 *  and the answer on screen. */
interface PageState {
  settings: Settings;
  boilMemory: BoilMemory;
  /** Posterior over the model's uncertain constants, learned from how the
   *  user's own eggs actually turn out. Before any feedback this is the prior
   *  mean, i.e. the literature values. */
  calib: Calibration;
  /** The solve behind the time on screen while idle. */
  solution: Solution | null;
  /** The choice behind the time on screen while idle: the odds, and how
   *  far it leaned from the mean solve. Null until the
   *  setup's decision surface has been built, and on the sous-vide screen. */
  decision: Decision | null;
  /** What the egg at the chosen time will be like (src/core/outcome.ts): the
   *  white's line and the bracket under the slider; how sure I am is `chosen`'s.
   *  Read at the decided time on the same surface, whenever `decision` is, and
   *  null whenever it is. */
  outcome: Outcome | null;
  /** The whole of the answer on screen as core decided it (`decideAnswer`),
   *  whose parts `solution`, `decision` and `outcome` are: the advice reads
   *  the level it was decided at and whether it is wanted. Null whenever
   *  `decision` is. */
  chosen: DecidedAnswer | null;
  /** The odds at every level for the pot on screen and the posterior as it
   *  stands (reach.ts): the track's shading, and the range the slider offers.
   *  Null until it has been worked out, which follows the pot's surface; until
   *  then the physical limits are the whole rule, as they were before. */
  profile: OddsProfile | null;
  /** The warning line while idle: a refusal when the requested doneness had to
   *  be moved, or the level's low odds (`warningKey`); empty otherwise. */
  idleWarning: string;
  /** The cook under way (src/core/running.ts): its start, its choices and
   *  what it observed, as stored under `aet.cook.v4`; null while idle. */
  cook: RunningCook | null;
  /** Everything derived from `cook` (`replan`), planned again only when
   *  something new is known - an event, a surface landing, the slow hob's
   *  moment, a reload - never on every tick. Null exactly when `cook` is. */
  plan: CookPlan | null;
  /** The lean last decided for the cook under way, s: the interim a plan
   *  carries while its pot's surface is being built (`carriedSolution`). A
   *  cache, stored with the cook, never truth. */
  leanHint_s: number;
}

/** The page's state. The first three are read from storage by `boot()`
 *  (app.ts), not when this module is imported, so a test can import it. */
export const state: PageState = {
  settings: null!,
  boilMemory: null!,
  calib: null!,
  solution: null,
  decision: null,
  outcome: null,
  chosen: null,
  profile: null,
  idleWarning: '',
  cook: null,
  plan: null,
  leanHint_s: 0,
};

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

/** The cook the controls describe, as core's choices. */
export function idleChoices(): CookChoices {
  return choicesOf(state.settings, REGION);
}

/** The egg and the pot the controls describe, for a time to a rolling boil:
 *  core's `cookSetupOf`, the one assembly both apps and a running cook share. */
export function idlePot(timeToBoil_s: number): CookPot {
  return cookSetupOf(idleChoices(), timeToBoil_s);
}

/** The egg the controls describe. */
export function currentEgg(): Egg {
  return idlePot(timeToBoil_s()).egg;
}

/** Which input the egg on screen came from: the size class, or whichever of the
 *  three measurements was typed in last. They all end up as one diameter, so
 *  this is the only place the difference survives - and it is the egg-level
 *  noise the fit needs (a class is a 10 g bucket; a scale is a gram). */
export function massFrom(): MassFrom {
  return idleChoices().massFrom;
}

/** The room as the cook measured it, while it counts, or null to assume one
 *  (`roomInUse`: only with the probe on). */
export function room_C(): number | null {
  return roomInUse(state.settings.probe, state.settings.room_C);
}

export function boilingPoint_C(): number {
  return boilingPointAtAltitude(state.settings.altitude_m);
}

export function isSousVide(): boolean {
  return state.settings.startMode === 'sous';
}

/** Time to a rolling boil on the controls' pot, remembered or guessed, s: the
 *  pan's one measured number, and the one thing the solver needs that the
 *  settings do not hold. A running cook's is its plan's - the guess, the slow
 *  hob's, or the tap - never this. A hot start never times it and the physics
 *  never reads it there - with the heat off the pan's cooling comes from the
 *  water volume (see panTimeConstant) - but the setup still carries the
 *  remembered value, so the record can say which pan was assumed. */
export function timeToBoil_s(): number {
  return estimateTimeToBoil(state.boilMemory, state.settings.waterLitres);
}

/** The phase of the cook on screen at `now_ms`: idle, or what core's
 *  `phaseAt` reads from the running cook's plan. */
export function phaseNow(now_ms: number): Phase {
  return state.plan === null ? 'IDLE' : phaseAt(state.plan.deadlines, now_ms / 1000);
}

/** How the cook on screen starts: the running cook's, or the controls'. */
export function startModeNow(): UiStartMode {
  return state.cook?.choices.startMode ?? state.settings.startMode;
}

/** What has been learned, as it stands now, for learned.ts to say. */
export function learning(): Learning {
  return { eggs: state.calib.eggsLogged, boilMemory: state.boilMemory, waterLitres: state.settings.waterLitres };
}
