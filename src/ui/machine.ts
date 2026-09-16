/**
 * The cooking state machine.
 *
 *   IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
 *
 * Every state carries absolute epoch deadlines rather than durations, so the
 * whole thing is a pure function of `Date.now()` and survives the tab being
 * backgrounded, suspended, or reloaded.
 *
 * Cold start: t = 0 is the moment the egg goes into the cold pan, which is the
 * same t = 0 the physics core uses, so `cookEnd = startedAt + cookTime_s`
 * covers the heating ramp and the boil together. The time to boil is a guess
 * until the user taps "Full rolling boil"; then it is a measurement, the cook
 * is re-solved and the deadline moves.
 *
 * Hot start: HEATING is skipped entirely and t = 0 is the moment the eggs are
 * lowered in.
 */

import { Cooling } from '../core/protocol.js';

export type Phase = 'IDLE' | 'HEATING' | 'COOKING' | 'PULL' | 'COOLING' | 'DONE';

/** Counted-down cooling. Carryover is what ruins a soft egg, so this is a
 *  stage of the cook, not a suggestion appended to the end of it. */
export const COOLING_SECONDS = 180;

/** If nobody confirms the transfer, assume it happened. A stalled timer at the
 *  hob is worse than a slightly optimistic one. */
export const PULL_GRACE_SECONDS = 20;

export interface Machine {
  phase: Phase;
  cooling: Cooling;
  /** Epoch ms when the egg entered the pan/water. 0 while idle. */
  startedAt_ms: number;
  /** Epoch ms of the rolling-boil tap. 0 until tapped; unused on a hot start. */
  boiledAt_ms: number;
  /** Epoch ms the egg must come out of the water. */
  cookEnd_ms: number;
  /** Epoch ms the egg left the water. */
  pulledAt_ms: number;
  /** Epoch ms cooling finishes. 0 unless cooling. */
  coolEnd_ms: number;
  /** Cook time currently in force, s (from egg-in to egg-out). */
  cookTime_s: number;
  /** Time to a rolling boil currently assumed, s. */
  assumedBoil_s: number;
  /** True while `assumedBoil_s` is remembered/guessed rather than measured. */
  provisional: boolean;
}

export function idleMachine(cooling: Cooling): Machine {
  return {
    phase: 'IDLE',
    cooling: cooling,
    startedAt_ms: 0,
    boiledAt_ms: 0,
    cookEnd_ms: 0,
    pulledAt_ms: 0,
    coolEnd_ms: 0,
    cookTime_s: 0,
    assumedBoil_s: 0,
    provisional: false,
  };
}

/** Cold start: the egg is already in the pan, so the clock starts now and the
 *  countdown shows a provisional total from the remembered time to boil. */
export function startCold(
  now_ms: number, cookTime_s: number, assumedBoil_s: number, cooling: Cooling,
): Machine {
  return {
    phase: 'HEATING',
    cooling: cooling,
    startedAt_ms: now_ms,
    boiledAt_ms: 0,
    cookEnd_ms: now_ms + cookTime_s * 1000,
    pulledAt_ms: 0,
    coolEnd_ms: 0,
    cookTime_s: cookTime_s,
    assumedBoil_s: assumedBoil_s,
    provisional: true,
  };
}

/** Hot start: water is already at a rolling boil, eggs go in now. */
export function startHot(now_ms: number, cookTime_s: number, cooling: Cooling): Machine {
  return {
    phase: 'COOKING',
    cooling: cooling,
    startedAt_ms: now_ms,
    boiledAt_ms: now_ms,
    cookEnd_ms: now_ms + cookTime_s * 1000,
    pulledAt_ms: 0,
    coolEnd_ms: 0,
    cookTime_s: cookTime_s,
    assumedBoil_s: 0,
    provisional: false,
  };
}

/** The rolling-boil tap: the time to boil stops being a guess. `cookTime_s` is
 *  the re-solved total, so the countdown snaps to the corrected remainder. */
export function recordBoil(m: Machine, now_ms: number, cookTime_s: number): Machine {
  if (m.phase !== 'HEATING') return m;
  return {
    ...m,
    phase: 'COOKING',
    boiledAt_ms: now_ms,
    cookEnd_ms: m.startedAt_ms + cookTime_s * 1000,
    cookTime_s: cookTime_s,
    assumedBoil_s: (now_ms - m.startedAt_ms) / 1000,
    provisional: false,
  };
}

/** A slow hob outruns the provisional estimate. Rather than let the countdown
 *  reach zero while the pan is still heating, the guess is revised upward and
 *  the cook re-solved. The displayed number stays honest instead of alarming
 *  at an egg that has not started cooking. */
export function reviseProvisional(m: Machine, cookTime_s: number, assumedBoil_s: number): Machine {
  if (m.phase !== 'HEATING') return m;
  return {
    ...m,
    cookEnd_ms: m.startedAt_ms + cookTime_s * 1000,
    cookTime_s: cookTime_s,
    assumedBoil_s: assumedBoil_s,
  };
}

/** Egg is out of the water: start the counted cooling, or finish if it is
 *  being left on the counter (where "cooling" is just carryover). */
export function beginCooling(m: Machine, now_ms: number): Machine {
  if (m.phase !== 'PULL') return m;
  if (m.cooling === 'counter') {
    return { ...m, phase: 'DONE', pulledAt_ms: m.pulledAt_ms, coolEnd_ms: 0 };
  }
  return { ...m, phase: 'COOLING', coolEnd_ms: now_ms + COOLING_SECONDS * 1000 };
}

/** Something that should make a noise. */
export type MachineEvent = 'none' | 'pull' | 'done';

export interface Advance {
  machine: Machine;
  event: MachineEvent;
}

/** Drive deadlines. Pure: same inputs, same outputs, no timers involved. */
export function advance(m: Machine, now_ms: number): Advance {
  if (m.phase === 'COOKING' && now_ms >= m.cookEnd_ms) {
    return {
      machine: { ...m, phase: 'PULL', pulledAt_ms: m.cookEnd_ms },
      event: 'pull',
    };
  }
  if (m.phase === 'PULL' && now_ms >= m.pulledAt_ms + PULL_GRACE_SECONDS * 1000) {
    const next = beginCooling(m, m.pulledAt_ms + PULL_GRACE_SECONDS * 1000);
    return { machine: next, event: next.phase === 'DONE' ? 'done' : 'none' };
  }
  if (m.phase === 'COOLING' && now_ms >= m.coolEnd_ms) {
    return { machine: { ...m, phase: 'DONE' }, event: 'done' };
  }
  return { machine: m, event: 'none' };
}

/** True while a cook is in progress (used to decide about wake locks and
 *  whether the inputs should still be editable). */
export function isRunning(m: Machine): boolean {
  return m.phase === 'HEATING' || m.phase === 'COOKING'
    || m.phase === 'PULL' || m.phase === 'COOLING';
}

/** Seconds until the egg must come out. May be negative. */
export function secondsToPull(m: Machine, now_ms: number): number {
  return (m.cookEnd_ms - now_ms) / 1000;
}

/** Seconds of counted cooling left. */
export function secondsToCool(m: Machine, now_ms: number): number {
  return (m.coolEnd_ms - now_ms) / 1000;
}

/** How long the pan has been heating, s. */
export function secondsHeating(m: Machine, now_ms: number): number {
  return (now_ms - m.startedAt_ms) / 1000;
}

/** Seconds of cooking after the boil was reached - the number every recipe
 *  quotes, and the only part of a cold start that is comparable to one. */
export function secondsAfterBoil(m: Machine): number {
  return m.cookTime_s - m.assumedBoil_s;
}
