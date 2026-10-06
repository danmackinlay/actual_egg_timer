/**
 * The page's state, in one place (`state`), and what it derives: the egg and
 * the pot on screen, how the cook starts, and the time to a rolling boil.
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
  Egg, eggFromMass, eggFromMinorDiameter, sizeClassesFor, sizeTableFor,
} from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { CookSetup, StartMode } from '../core/protocol.js';
import { Solution } from '../core/solve.js';
import { BoilMemory, ambientFor, roomInUse, startTempPreset_C } from '../core/policy.js';
import { Decision } from '../core/decide.js';
import { DecidedAnswer, OddsProfile } from '../core/reach.js';
import { MassFrom } from '../core/record.js';
import { Outcome } from '../core/outcome.js';
import { Calibration } from './calibration.js';
import { Learning } from './learned.js';
import { Machine } from './machine.js';
import { Settings, UiStartMode, estimateTimeToBoil } from './store.js';
import { Ticket } from './ticket.js';
import { REGION } from './units.js';

/** The carton's size classes, by the browser's region (`REGION`, in units.ts)
 *  alone: not the language, and not the units - an American carton is an
 *  American carton in grams too. Fixed for the life of the page. A stored
 *  index is read against it, and keeps its name if the region has changed
 *  since it was saved. */
export const sizeClasses = sizeClassesFor(REGION);
/** The same table by name, for the record: a Large is 68 g in one and 60.2 g in
 *  the other. */
export const sizeTable = sizeTableFor(REGION);

/** What the page holds: the setup, what has been learned, the cook under way
 *  and the answer on screen. */
interface PageState {
  settings: Settings;
  boilMemory: BoilMemory;
  /** Posterior over the model's uncertain constants, learned from how the
   *  user's own eggs actually turn out. Before any feedback this is the prior
   *  mean, i.e. the literature values. */
  calib: Calibration;
  machine: Machine;
  solution: Solution | null;
  /** The choice behind the time on screen while idle: the odds, and how
   *  far it leaned from the mean solve. Null until the
   *  setup's decision surface has been built, and on the sous-vide screen. */
  decision: Decision | null;
  /** What the egg at the chosen time will be like (src/core/outcome.ts): the
   *  direction sentence, the white's line and the bracket under the slider.
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
  /** What the running cook is, frozen at the moment it started (ticket.ts). */
  ticket: Ticket | null;
}

/** The page's state. The first four are read from storage by `boot()`
 *  (app.ts), not when this module is imported, so a test can import it. */
export const state: PageState = {
  settings: null!,
  boilMemory: null!,
  calib: null!,
  machine: null!,
  solution: null,
  decision: null,
  outcome: null,
  chosen: null,
  profile: null,
  idleWarning: '',
  ticket: null,
};

/* --------------------------------------------------------------- physics */

export function currentEgg(): Egg {
  const settings = state.settings;
  if (settings.sizeIndex < 0 || settings.sizeIndex >= sizeClasses.length) {
    return eggFromMinorDiameter(settings.customMinor_mm / 1000);
  }
  return eggFromMass(sizeClasses[settings.sizeIndex].mass_kg);
}

/** Which input the egg on screen came from: the size class, or whichever of the
 *  three measurements was typed in last. They all end up as one diameter, so
 *  this is the only place the difference survives - and it is the egg-level
 *  noise the fit needs (a class is a 10 g bucket; a scale is a gram). */
export function massFrom(): MassFrom {
  if (state.settings.sizeIndex >= 0 && state.settings.sizeIndex < sizeClasses.length) return 'class';
  return state.settings.measuredBy;
}

/** The room as the cook measured it, while it counts, or null to assume one
 *  (`roomInUse`: only with the probe on). */
export function room_C(): number | null {
  return roomInUse(state.settings.probe, state.settings.room_C);
}

function eggStart_C(): number {
  if (state.settings.startTempMode === 'custom') return state.settings.customStart_C;
  return startTempPreset_C(state.settings.startTempMode, room_C());
}

/** The room, as far as the model is concerned. The rule - a measured room is
 *  the room; otherwise an egg that has been sitting out IS the room, and a
 *  fridge egg says nothing - is core policy. */
function ambient_C(): number {
  return ambientFor(eggStart_C(), room_C());
}

export function boilingPoint_C(): number {
  return boilingPointAtAltitude(state.settings.altitude_m);
}

/** What the solver is told. The Start control has three positions; the model
 *  has two. Sous-vide is answered by src/core/sousvide.ts instead, so as far as
 *  the cook solver is concerned it is an egg going into water already hot. */
function coreStartMode(): StartMode {
  return state.settings.startMode === 'cold' ? 'cold' : 'hot';
}

export function isSousVide(): boolean {
  return state.settings.startMode === 'sous';
}

/** What the solver is told about the POT. The egg is a separate argument
 *  everywhere the core takes both, so there is no mass here to keep in step. */
export function buildSetup(timeToBoil_s: number): CookSetup {
  const settings = state.settings;
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
export function timeToBoil_s(): number {
  if (state.machine.phase !== 'IDLE' && startModeNow() === 'cold') return state.machine.assumedBoil_s;
  return estimateTimeToBoil(state.boilMemory, state.settings.waterLitres);
}

/** The pot of the cook under way: the ticket's, frozen at "Eggs in", and never
 *  the controls', which another tab may have changed since. Null while idle. */
function runningSetup(): CookSetup | null {
  return state.machine.phase !== 'IDLE' && state.ticket !== null ? state.ticket.setup : null;
}

/** How the cook on screen starts: the running cook's, or the controls'. */
export function startModeNow(): UiStartMode {
  return runningSetup()?.startMode ?? state.settings.startMode;
}

/** What has been learned, as it stands now, for learned.ts to say. */
export function learning(): Learning {
  return { eggs: state.calib.eggsLogged, boilMemory: state.boilMemory, waterLitres: state.settings.waterLitres };
}
