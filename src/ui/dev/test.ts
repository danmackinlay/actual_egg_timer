/**
 * What a script driving the page may ask of it (`npm run e2e`, tools/e2e.ts,
 * and the copy capture, tools/copySnapshot.ts): `window.aetTest`, on a page
 * served from this machine only, and not shipped (main.ts, src/ui/dev/).
 *
 * The scripts read the page through this and the page itself (what is on
 * screen, what is stored), never by importing the app's modules: a module
 * can be split, renamed or remade, and only this has to keep its shape. A
 * build from another commit is driven by today's harness as long as it
 * does (`npm run e2e -- --tree <dir>`).
 *
 *   snapshot()   the page's state, as plain data (`Snapshot`)
 *   whenIdle()   resolves once the page has nothing in hand (idle.ts): no
 *                timer of a person's span, no job off the main thread, no
 *                request, for three looks running
 *   t(key, args) the words of a key, as the page renders them
 *   timeOfDay(ms)  a moment, as the page says a time of day
 *
 * `?seed=<n>` on the address seeds the page's one random draw (the nudge,
 * answer.ts), so a capture is the same on every run; it is kept for the tab
 * across a reload, and starts again from the seed at each load.
 */

import { CertaintyReading } from '../../core/certainty.js';
import { CopyArgs } from '../../core/copy.js';
import { BoilMemory } from '../../core/boil.js';
import { Phase, RunningCook, guessLengthened } from '../../core/running.js';
import { EggRecord } from '../../core/record.js';
import { eggsBehind, keptState } from '../calibration.js';
import { flushDraw } from '../cook.js';
import { t, timeOfDay } from '../copy.js';
import { inHand } from '../idle.js';
import { isDevHost, nowMs, useRandom } from '../now.js';
import { shareState } from '../share.js';
import { phaseNow, state } from '../state.js';
import { Settings } from '../store.js';
import { finalEggs } from '../update.js';

/** The page as a script sees it. */
export interface Snapshot {
  /** The page's time, ms since 1970. */
  now_ms: number;
  phase: Phase;
  /** What is on screen: the phase's label, the digits, the line under
   *  them, the primary button's words (null while it is hidden), whether
   *  the questions after the egg are shown, and what they ask about. */
  label: string;
  digits: string;
  subline: string;
  primary: string | null;
  feedback: boolean;
  target: string;
  /** The phases' labels as this page words them. */
  labels: Record<'heating' | 'pull' | 'done' | 'coolingIce' | 'cookingBoiling', string>;
  settings: Settings;
  /** The pans remembered: litres to the time to boil, s. */
  boilMemory: BoilMemory;
  /** The level decided for at idle; null until a time is decided. */
  chosen: { level: number } | null;
  /** The running cook, and what its plan says. */
  cook: RunningCook | null;
  deadlines: { cookEnd_s: number; coolEnd_s: number | null; provisional: boolean; outAt_s: number | null } | null;
  decided: boolean;
  lengthened: boolean;
  certainty: CertaintyReading | null;
  peakYolk_C: number | null;
  /** The running cook as stored (`aet.cook.v5`), its text. */
  stored: string | null;
  /** The results log, how many of it are folded in, how many still to
   *  fold, and how many are final. */
  log: EggRecord[];
  eggsLogged: number;
  eggsBehind: number;
  finalEggs: number;
  share: { on: boolean; sent: number };
  inHand: { timers: number; jobs: number; requests: number };
}

export interface TestApi {
  snapshot(): Snapshot;
  whenIdle(timeout_ms?: number): Promise<void>;
  t(key: string, args?: CopyArgs): string;
  timeOfDay(ms: number): string;
}

const text = (id: string): string => document.getElementById(id)?.textContent ?? '';

function snapshot(): Snapshot {
  // The page as the model now stands, not a frame behind it.
  flushDraw();
  const now = nowMs();
  const plan = state.plan;
  const primary = document.getElementById('primary');
  const share = shareState();
  return {
    now_ms: now,
    phase: phaseNow(state, now),
    label: text('phaseLabel'),
    digits: text('digits'),
    subline: text('sublineText'),
    primary: primary === null || primary.hidden ? null : primary.textContent,
    feedback: document.getElementById('feedback')?.hidden === false,
    target: text('feedbackTarget'),
    labels: {
      heating: t('readout.phase.heating'), pull: t('readout.phase.pull'), done: t('readout.phase.done'),
      coolingIce: t('readout.phase.coolingIce'), cookingBoiling: t('readout.phase.cookingBoiling'),
    },
    settings: state.settings,
    boilMemory: state.boilMemory,
    chosen: state.chosen === null ? null : { level: state.chosen.level },
    cook: state.cook,
    deadlines: plan === null ? null : plan.deadlines,
    decided: plan !== null && plan.decided !== null,
    lengthened: plan !== null && guessLengthened(plan),
    certainty: plan === null ? null : plan.certainty,
    peakYolk_C: plan === null ? null : plan.solution.result.peakYolk_C,
    stored: localStorage.getItem('aet.cook.v5'),
    log: keptState().log,
    eggsLogged: state.calib.eggsLogged,
    eggsBehind: eggsBehind(),
    finalEggs: finalEggs(),
    share: { on: share.on, sent: share.sent },
    inHand: inHand(),
  };
}

/** Resolves once nothing has been in hand for three looks 40 ms apart, so
 *  whatever a job's or a request's answer set off has run too; rejects,
 *  saying what is in hand, after `timeout_ms`. The looks are plain timers,
 *  not counted. */
function whenIdle(timeout_ms = 60_000): Promise<void> {
  const end = Date.now() + timeout_ms;
  return new Promise((resolve, reject) => {
    let quiet = 0;
    const look = (): void => {
      const h = inHand();
      quiet = h.timers + h.jobs + h.requests === 0 ? quiet + 1 : 0;
      if (quiet >= 3) resolve();
      else if (Date.now() > end) reject(new Error(`not idle after ${timeout_ms / 1000} s: ${JSON.stringify(h)}`));
      else setTimeout(look, 40);
    };
    look();
  });
}

/** sessionStorage: this tab's seed, kept across a reload. */
const SEED_KEY = 'aet.devSeed';

/** A draw from [0, 1) seeded by `seed` (mulberry32). */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed the address asks for, or the tab kept; taken out of the address. */
function seedAsked(): number | null {
  const url = new URL(location.href);
  const asked = url.searchParams.get('seed');
  if (asked !== null) {
    url.searchParams.delete('seed');
    history.replaceState(history.state, '', url.href);
  }
  let kept: string | null = null;
  try {
    if (asked !== null) sessionStorage.setItem(SEED_KEY, asked);
    kept = sessionStorage.getItem(SEED_KEY);
  } catch {
    kept = asked;
  }
  const seed = kept === null ? NaN : Number(kept);
  return Number.isInteger(seed) ? seed : null;
}

/** `window.aetTest`, and the seed asked for; nothing on any host but this
 *  machine. */
export function installTestApi(): void {
  if (typeof window === 'undefined' || !isDevHost(location.hostname)) return;
  const seed = seedAsked();
  if (seed !== null) useRandom(seeded(seed));
  const api: TestApi = { snapshot: snapshot, whenIdle: whenIdle, t: t, timeOfDay: timeOfDay };
  (window as unknown as { aetTest: TestApi }).aetTest = api;
}
