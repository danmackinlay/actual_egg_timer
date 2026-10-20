/**
 * What a script driving the page may ask of it (`npm run e2e`,
 * tools/e2e.ts): `window.aetTest`, on a page served from this machine only,
 * and not shipped (main.ts, src/ui/dev/).
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
 */

import type { CertaintyReading } from '../../core/certainty.ts';
import type { CopyArgs } from '../../core/copy.ts';
import type { BoilMemory } from '../../core/boil.ts';
import { type Phase, type RunningCook, guessLengthened } from '../../core/running.ts';
import { readStoredCook } from '../storedCook.ts';
import type { ElementId } from '../dom.ts';
import { STORES } from '../stores.ts';
import type { EggRecord } from '../../core/record.ts';
import { flushDraw, pageModel, pageStores } from '../cook.ts';
import { t, timeOfDay } from '../copy.ts';
import { inHand } from '../idle.ts';
import { isDevHost, nowMs } from '../now.ts';
import { jobsAnswered } from '../offThread.ts';
import { phaseNow } from '../state.ts';
import { idleSolution } from '../answer.ts';
import type { Settings } from '../store.ts';
import { finalEggs } from '../effects.ts';

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
  labels: Record<'heating' | 'pull' | 'done' | 'coolingIce' | 'coolingTap' | 'coolingBowl' | 'coolingEggCup' | 'cookingBoiling', string>;
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
  /** Whether the white sets at the time on screen: the running cook's
   *  plan's, else the idle answer's; null with neither. */
  whiteSets: boolean | null;
  /** The running cook as stored, its text, and the cook it reads as, folded
   *  from its log (`readStoredCook`), or null. */
  stored: string | null;
  storedCook: RunningCook | null;
  /** The results log, how many of it are folded in, how many still to
   *  fold, and how many are final. */
  log: EggRecord[];
  eggsLogged: number;
  eggsBehind: number;
  finalEggs: number;
  share: { on: boolean; sent: number };
  inHand: { timers: number; jobs: number; requests: number };
  /** The jobs sent off the main thread since the page loaded: answered by
   *  the grid worker, and built on the page when it could not be had. */
  gridJobs: { offThread: number; onThread: number };
}

interface TestApi {
  snapshot(): Snapshot;
  whenIdle(timeout_ms?: number): Promise<void>;
  t(key: string, args?: CopyArgs): string;
  timeOfDay(ms: number): string;
}

const text = (id: ElementId): string => document.getElementById(id)?.textContent ?? '';

/** The cook stored as `text` reads, or null. */
function storedCookOf(text: string | null): RunningCook | null {
  try {
    return text === null ? null : readStoredCook(JSON.parse(text))?.cook ?? null;
  } catch {
    return null;
  }
}

function snapshot(): Snapshot {
  // The page as the model now stands, not a frame behind it.
  flushDraw();
  const now = nowMs();
  const m = pageModel();
  const plan = m.plan;
  const chosen = m.solved?.chosen ?? null;
  const primary = document.getElementById('primary');
  const stores = pageStores();
  const share = stores.sharing.state();
  return {
    now_ms: now,
    phase: phaseNow(m, now),
    label: text('phaseLabel'),
    digits: text('digits'),
    subline: text('sublineText'),
    primary: primary === null || primary.hidden ? null : primary.textContent,
    feedback: document.getElementById('feedback')?.hidden === false,
    target: text('feedbackTarget'),
    labels: {
      heating: t('readout.phase.heating'), pull: t('readout.phase.pull'), done: t('readout.phase.done'),
      coolingIce: t('readout.phase.coolingIce'), coolingTap: t('readout.phase.coolingTap'),
      coolingBowl: t('readout.phase.coolingBowl'),
      coolingEggCup: t('readout.phase.coolingEggCup'), cookingBoiling: t('readout.phase.cookingBoiling'),
    },
    settings: m.settings,
    boilMemory: m.boilMemory,
    chosen: chosen === null ? null : { level: chosen.level },
    cook: m.cook,
    deadlines: plan === null ? null : plan.deadlines,
    decided: plan !== null && plan.decided !== null,
    lengthened: plan !== null && guessLengthened(plan),
    certainty: plan === null ? null : plan.certainty,
    peakYolk_C: plan === null ? null : plan.solution.result.peakYolk_C,
    whiteSets: plan !== null ? plan.solution.whiteSets : m.solved === null ? null : idleSolution(m.solved).whiteSets,
    stored: localStorage.getItem(STORES.cook.key),
    storedCook: storedCookOf(localStorage.getItem(STORES.cook.key)),
    log: stores.learner.keptState().log,
    eggsLogged: m.calib.eggsLogged,
    eggsBehind: stores.learner.eggsBehind(),
    finalEggs: finalEggs(stores, m),
    share: { on: share.on, sent: share.sent },
    inHand: inHand(),
    gridJobs: jobsAnswered(),
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

/** `window.aetTest`; nothing on any host but this machine. */
export function installTestApi(): void {
  if (typeof window === 'undefined' || !isDevHost(location.hostname)) return;
  const api: TestApi = { snapshot: snapshot, whenIdle: whenIdle, t: t, timeOfDay: timeOfDay };
  (window as unknown as { aetTest: TestApi }).aetTest = api;
}
