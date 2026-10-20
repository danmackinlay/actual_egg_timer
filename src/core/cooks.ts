/**
 * The cooks an app holds, over `step` (step.ts): the one on screen, and
 * those ended whose egg's record is still to be made. A cook that ends with
 * its record still to make - the surface, or the calibration before this
 * egg or a surface on it, still to build - leaves the screen at once and
 * waits in `ending`, stepped as each lands, until it is logged and
 * forgotten; one logged and forgotten goes. A new cook may start beside it.
 *
 * Every effect a step asks for is tagged with whose cook it is
 * (`CooksEffect`): its id, whether it was on screen, and whether it has
 * ended, so an app writes an ended cook only over its own stored copy, never
 * over a newer cook's. The alarms, the ring and the silence are the
 * screen's: those of a cook off screen are dropped here.
 *
 * An event at a moment the cook on screen is too old to pick back up
 * (`cookTooOld`) comes after the tick that ends it: the egg is final then,
 * so an answer or a correction after it is not taken, and nothing about the
 * egg is logged again. Only too old: an event never waits for any other
 * tick the clock has due.
 *
 * Which eggs are still open (`openEggs`): those logged whose record may yet
 * change - the egg on screen until it is too old, and an ended one whose
 * record is to be made again. Sharing holds them back.
 *
 * What is each app's: when and where the steps run, what is built for them,
 * what is stored and how, and carrying out the effects. The app gives each
 * cook's calibration before its egg and local day (`CookAt`), since core
 * has no time zone. Pure, like the rest of `src/core/`. `Cooks.swift` is
 * held to it by the traces in `fixtures/cooks.json`.
 */

import type { AppName, Calibration } from './record.ts';
import { type CookSurface, type RunningCook, answersLogged, cookTooOld, endedAt_s, openEggId } from './running.ts';
import {
  type CookBefore, type CookEffect, type CookEnv, type CookEvent, type CookNeed, type CookState, asRanStale, step,
} from './step.ts';

/** A cook ended before its egg's record could be made, and what it waits
 *  for. */
export interface EndingCook extends CookState {
  need: CookNeed;
}

/** The cooks an app holds: the one on screen (its cook null while idle),
 *  what it waits for, and those ended whose record is still to be made. */
export interface Cooks {
  screen: CookState;
  need: CookNeed;
  ending: EndingCook[];
}

/** What the app holds for one of its cooks: the calibration before its egg,
 *  once asked for and built, and the local day it started (as corrected),
 *  in the app's time zone. */
export interface CookAt {
  id_ms: number;
  before: CookBefore | null;
  day: string;
}

/** What the app holds for a step of its cooks: `CookEnv`'s, with each cook's
 *  own in `at`. `day` is today's, for a cook not in `at`: one starting. */
export interface CooksEnv {
  calibration: Calibration;
  surfaces: CookSurface[];
  app: AppName;
  appVersion: string;
  prior: string;
  day: string;
  at: CookAt[];
}

/** An effect, with whose cook it is: the one on screen (or starting there)
 *  when it was stepped, or one ended off it; and whether that cook had ended,
 *  or gone, when the step was over. */
export interface CooksEffect {
  id_ms: number;
  onScreen: boolean;
  ended: boolean;
  effect: CookEffect;
}

/** The cooks as a step leaves them, and what the app must do. */
export interface CooksStep {
  cooks: Cooks;
  effects: CooksEffect[];
}

/** A cook as it was stored: what a relaunch picks back up. */
export interface CookStored {
  cook: RunningCook;
  leanHint_s: number;
}

/** A cook, and what it waits for. */
export interface CookWaiting {
  cook: RunningCook;
  need: CookNeed;
}

const NO_NEED: CookNeed = { surface: null, before: false, beforeSurface: null, wakeAt_s: null };
const IDLE: CookState = { cook: null, plan: null, leanHint_s: 0 };

/** No cooks: the screen idle, nothing ending. */
export function noCooks(): Cooks {
  return { screen: IDLE, need: NO_NEED, ending: [] };
}

/** What the app holds for a step of `cook`, or of a cook starting. */
function envOf(env: CooksEnv, cook: RunningCook | null): CookEnv {
  let before: CookBefore | null = null;
  let day = env.day;
  if (cook !== null) {
    for (let i = 0; i < env.at.length; i++) {
      if (env.at[i].id_ms === cook.id_ms) {
        before = env.at[i].before;
        day = env.at[i].day;
      }
    }
  }
  return {
    calibration: env.calibration, surfaces: env.surfaces, before: before, app: env.app, appVersion: env.appVersion,
    prior: env.prior, day: day,
  };
}

/** Whether an effect is the screen's: the alarms, the ring, the silence. */
function screens(e: CookEffect): boolean {
  return e.kind === 'alarms' || e.kind === 'ring' || e.kind === 'silence';
}

/** The cook on screen stepped with `event`, its effects tagged into
 *  `effects`: still on screen, waiting in `ending`, or gone. */
function stepScreen(q: Cooks, event: CookEvent, env: CooksEnv, effects: CooksEffect[]): Cooks {
  const was = q.screen.cook;
  const s = step(q.screen, event, envOf(env, was));
  const ended = s.cook === null || endedAt_s(s.cook) !== null;
  const cook = s.cook ?? was;
  if (cook === null) return q;
  for (let i = 0; i < s.effects.length; i++) {
    effects.push({ id_ms: cook.id_ms, onScreen: true, ended: ended, effect: s.effects[i] });
  }
  if (s.cook === null) return { screen: IDLE, need: NO_NEED, ending: q.ending };
  if (ended) {
    const waiting: EndingCook = { cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need };
    return { screen: IDLE, need: NO_NEED, ending: [...q.ending, waiting] };
  }
  return { screen: { cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s }, need: s.need, ending: q.ending };
}

/**
 * The cook on screen stepped with `event` (step.ts), after the tick that ends
 * it when it is too old at the event's moment. A start while a cook is on
 * screen, and anything else while none is, changes nothing.
 */
export function cooksStep(q: Cooks, event: CookEvent, env: CooksEnv): CooksStep {
  const effects: CooksEffect[] = [];
  let cooks = q;
  const plan = q.screen.plan;
  if (event.kind !== 'start' && event.kind !== 'tick' && plan !== null && cookTooOld(plan, event.now_s)) {
    cooks = stepScreen(cooks, { kind: 'tick', now_s: event.now_s }, env, effects);
  }
  const on = cooks.screen.cook !== null;
  if (event.kind === 'start' ? on : !on) return { cooks: cooks, effects: effects };
  return { cooks: stepScreen(cooks, event, env, effects), effects: effects };
}

/**
 * A stored cook picked back up at `now_s`, after a relaunch or a reload: a
 * tick of it with no plan yet, in place of any cook on screen and of itself
 * if it was waiting. One too old ends as Start again ends it, and waits for
 * its record if it must.
 */
export function cooksRestore(q: Cooks, stored: CookStored, now_s: number, env: CooksEnv): CooksStep {
  const ending: EndingCook[] = [];
  for (let i = 0; i < q.ending.length; i++) {
    const c = q.ending[i].cook;
    if (c === null || c.id_ms !== stored.cook.id_ms) ending.push(q.ending[i]);
  }
  const effects: CooksEffect[] = [];
  const picked: Cooks = { screen: { cook: stored.cook, plan: null, leanHint_s: stored.leanHint_s }, need: NO_NEED, ending: ending };
  return { cooks: stepScreen(picked, { kind: 'tick', now_s: now_s }, env, effects), effects: effects };
}

/** Something a cook waited for built, at `now_s`: the cook on screen
 *  stepped, then each ended one; those logged and forgotten go. */
export function cooksLanded(q: Cooks, now_s: number, env: CooksEnv): CooksStep {
  const first = cooksStep(q, { kind: 'surfaceLanded', now_s: now_s }, env);
  const effects = first.effects;
  const left: EndingCook[] = [];
  for (let i = 0; i < first.cooks.ending.length; i++) {
    const e = first.cooks.ending[i];
    if (e.cook === null) continue;
    const s = step(e, { kind: 'surfaceLanded', now_s: now_s }, envOf(env, e.cook));
    for (let j = 0; j < s.effects.length; j++) {
      if (!screens(s.effects[j])) effects.push({ id_ms: e.cook.id_ms, onScreen: false, ended: true, effect: s.effects[j] });
    }
    if (s.cook !== null) left.push({ cook: s.cook, plan: s.plan, leanHint_s: s.leanHint_s, need: s.need });
  }
  return { cooks: { screen: first.cooks.screen, need: first.cooks.need, ending: left }, effects: effects };
}

/** Each cook, on screen and ended, with what it waits for: what the app
 *  builds. */
export function cooksWaiting(q: Cooks): CookWaiting[] {
  const out: CookWaiting[] = [];
  if (q.screen.cook !== null) out.push({ cook: q.screen.cook, need: q.need });
  for (let i = 0; i < q.ending.length; i++) {
    const c = q.ending[i].cook;
    if (c !== null) out.push({ cook: c, need: q.ending[i].need });
  }
  return out;
}

/** The cooks whose calibration before their egg is still wanted: those
 *  whose plan as it ran is stale (`asRanStale`). The app keeps those, and
 *  lets the rest go. */
export function beforeWanted(q: Cooks): number[] {
  const out: number[] = [];
  const all = cooksWaiting(q);
  for (let i = 0; i < all.length; i++) if (asRanStale(all[i].cook)) out.push(all[i].cook.id_ms);
  return out;
}

/** The eggs logged and still open at `now_s`, by their cooks' ids: the one
 *  on screen until it is too old to pick back up (`openEggId`), and each
 *  ended one, whose record is to be made again. Every other egg in the log
 *  is final, and may be sent. */
export function openEggs(q: Cooks, now_s: number): number[] {
  const out: number[] = [];
  const s = q.screen.cook;
  if (s !== null && answersLogged(s) !== null && openEggId(s, q.screen.plan, now_s) !== null) out.push(s.id_ms);
  for (let i = 0; i < q.ending.length; i++) {
    const c = q.ending[i].cook;
    if (c !== null && answersLogged(c) !== null) out.push(c.id_ms);
  }
  return out;
}
