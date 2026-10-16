/**
 * fixtures/hand.json: the correction in hand (src/core/hand.ts).
 *
 *  - `sequences`: what the cook does to the controls, as each app sends it
 *    where they differ, and every timer `handStep` sets come round at its
 *    time (`replay`): each step the event and what it made. Among them the
 *    four ways the two apps once committed differently: a long press on a
 *    radio, a size then a weight, leaving inside a settle, and which touches
 *    are another control.
 *  - `choices`: what a commit of each group makes of a cook before and after
 *    the pull (`handChoices`).
 *  - `previews`: the cook the aimed-for egg is planned on (`previewCook`).
 *  - `starts`: the start's − and + to each of the cook's limits
 *    (`startStepped`).
 */

import {
  type HandEvent, type HandGroup, type HandState, type HandStep, type HandTimer, handChoices, handStep, nothingInHand,
  previewCook, startStepped,
} from '../../src/core/hand.ts';
import { type CookChoices, type RunningCook, startCook, withBoil, writeEvents } from '../../src/core/running.ts';

import { BASE_CHOICES, MEMORY, START_S } from './shared.ts';

/** A sequence as an app sends it: the cook's events, without the timers. */
export interface HandSequence {
  note: string;
  /** Which app sends it so, where the two differ. */
  app: 'web' | 'ios' | 'both';
  events: HandEvent[];
  /** The commits it makes, `group@at_s`, in order. */
  commits: string[];
}

const TIMER_ORDER: HandTimer[] = ['settle', 'preview', 'hold'];

/** `events` handed to `handStep` in order, with every timer it sets come
 *  round at its time: before an event at or after it, and after the last
 *  until none is left. A timer set for a moment already past comes round at
 *  once. */
export function replay(events: HandEvent[]): { event: HandEvent; out: HandStep }[] {
  let state: HandState = nothingInHand();
  const set: Partial<Record<HandTimer, number>> = {};
  const steps: { event: HandEvent; out: HandStep }[] = [];
  let now = events.length > 0 ? events[0].at_s : 0;
  const feed = (event: HandEvent): void => {
    const out = handStep(state, event);
    steps.push({ event: event, out: out });
    state = out.state;
    for (const t of out.timers) {
      if (t.at_s === null) delete set[t.timer];
      else set[t.timer] = Math.max(t.at_s, event.at_s);
    }
  };
  const due = (until: number | null): HandTimer | null => {
    let first: HandTimer | null = null;
    for (const t of TIMER_ORDER) {
      const at = set[t];
      if (at === undefined || (until !== null && at > until)) continue;
      if (first === null || at < (set[first] as number)) first = t;
    }
    return first;
  };
  const fire = (until: number | null): void => {
    for (let t = due(until); t !== null; t = due(until)) {
      const at = set[t] as number;
      delete set[t];
      now = Math.max(now, at);
      feed({ kind: 'timer', at_s: now, timer: t });
    }
  };
  for (const e of events) {
    fire(e.at_s);
    now = e.at_s;
    feed(e);
  }
  fire(null);
  return steps;
}

/** The commits a replay makes, `group@at_s`. */
export function commitsOf(steps: { event: HandEvent; out: HandStep }[]): string[] {
  const made: string[] = [];
  for (const s of steps) if (s.out.commit !== null) made.push(`${s.out.commit}@${Math.round(s.event.at_s * 1000) / 1000}`);
  return made;
}

const change = (at_s: number, group: HandGroup): HandEvent => ({ kind: 'change', at_s: at_s, group: group });
const down = (at_s: number, group: HandGroup): HandEvent => ({ kind: 'down', at_s: at_s, group: group });
const up = (at_s: number): HandEvent => ({ kind: 'up', at_s: at_s });
/** A tap on a − or +: down, the change, up. */
const tap = (at_s: number, group: HandGroup): HandEvent[] => [down(at_s, group), change(at_s + 0.05, group), up(at_s + 0.1)];

export const SEQUENCES: HandSequence[] = [
  {
    note: 'a long press on a radio: Room tapped, then Custom held; the web sees the fingers, and the lift of a press that changed nothing settles',
    app: 'web',
    events: [down(0, 'eggFrom'), up(0.1), change(0.1, 'eggFrom'), down(0.5, 'eggFrom'), up(1.2), change(1.2, 'eggFrom')],
    commits: ['eggFrom@2.7'],
  },
  {
    note: 'a long press on a radio, as iOS\'s picker reports it: two changes, no finger',
    app: 'ios',
    events: [change(0.1, 'eggFrom'), change(1.2, 'eggFrom')],
    commits: ['eggFrom@2.7'],
  },
  {
    note: 'a size, then a weight: the menu and the field are both the egg\'s mass, one commit',
    app: 'web',
    events: [down(0, 'mass'), up(0.1), change(1, 'mass'), down(1.5, 'mass'), up(1.6), change(2, 'mass'), change(2.2, 'mass')],
    commits: ['mass@3.7'],
  },
  {
    note: 'a size, then a weight, as iOS sends it: the picker and the typing report no finger',
    app: 'ios',
    events: [change(1, 'mass'), change(2, 'mass'), change(2.2, 'mass')],
    commits: ['mass@3.7'],
  },
  {
    note: 'the room from the "from" panel, then from Settings: one group, one commit',
    app: 'both',
    events: [...tap(0, 'room'), ...tap(0.6, 'room')],
    commits: ['room@2.2'],
  },
  {
    note: 'left inside a settle (the page hidden, or Control Centre pulled down): committed then, and a change after it is a new one',
    app: 'both',
    events: [...tap(0, 'eggCount'), { kind: 'leave', at_s: 0.6 }, ...tap(2, 'eggCount')],
    commits: ['eggCount@0.6', 'eggCount@3.6'],
  },
  {
    note: 'left with a finger on the slider: committed, the press gone with the page, and the aimed-for egg let go after its hold',
    app: 'both',
    events: [down(0, 'level'), change(0.2, 'level'), { kind: 'leave', at_s: 0.4 }],
    commits: ['level@0.4'],
  },
  {
    note: 'a − or + tapped, then the thermometer\'s reading touched: another control, committed at once',
    app: 'both',
    events: [...tap(0, 'eggCount'), { kind: 'moveOn', at_s: 0.5, control: 'probe' }],
    commits: ['eggCount@0.5'],
  },
  {
    note: 'a − or + tapped, then a Settings switch: another control, committed at once',
    app: 'both',
    events: [...tap(0, 'waterLitres'), { kind: 'moveOn', at_s: 0.5, control: 'setting' }],
    commits: ['waterLitres@0.5'],
  },
  {
    note: 'the buttons and the clauses: each commits what is in hand before it acts, and nothing when nothing is',
    app: 'both',
    events: [
      change(0, 'afterBoil'), { kind: 'moveOn', at_s: 0.4, control: 'clause' },
      change(1, 'cooling'), { kind: 'moveOn', at_s: 1.2, control: 'stillInWater' },
      { kind: 'moveOn', at_s: 1.3, control: 'primary' },
      change(2, 'startMode'), { kind: 'moveOn', at_s: 2.1, control: 'cancel' }, { kind: 'fresh', at_s: 2.1 },
    ],
    commits: ['afterBoil@0.4', 'cooling@1.2', 'startMode@2.1'],
  },
  {
    note: 'two groups by the keyboard, no finger: the first commits as it was when the second\'s change comes, and the second settles',
    app: 'both',
    events: [change(0, 'eggCount'), change(0.3, 'eggCount'), change(0.8, 'waterLitres')],
    commits: ['eggCount@0.8', 'waterLitres@2.3'],
  },
  {
    note: 'a finger on another group commits the change in hand',
    app: 'both',
    events: [...tap(0, 'eggCount'), down(0.5, 'level'), change(0.6, 'level'), up(0.8)],
    commits: ['eggCount@0.5', 'level@0.8'],
  },
  {
    note: 'a drag of the slider: planned once a burst in, committed on the lift, the aimed-for egg let go a settle after the last change',
    app: 'both',
    events: [down(0, 'level'), change(0.05, 'level'), change(0.1, 'level'), change(0.2, 'level'), change(0.4, 'level'), up(0.5)],
    commits: ['level@0.5'],
  },
  {
    note: 'the slider touched and lifted without moving: nothing in hand, nothing committed',
    app: 'both',
    events: [down(0, 'level'), up(0.2)],
    commits: [],
  },
  {
    note: 'a − or + held until it repeats: committed on the lift',
    app: 'both',
    events: [down(0, 'eggCount'), change(0.01, 'eggCount'), change(0.4, 'eggCount'), change(0.5, 'eggCount'), up(0.9)],
    commits: ['eggCount@0.9'],
  },
  {
    note: 'a − or + tapped twice inside a settle: one commit, a settle after the second lift',
    app: 'both',
    events: [...tap(0, 'eggCount'), ...tap(0.8, 'eggCount')],
    commits: ['eggCount@2.4'],
  },
  {
    note: 'the hold set again on a lift with nothing in hand: a finger down past the hold keeps the aimed-for egg until it lifts',
    app: 'both',
    events: [down(0, 'level'), change(0.1, 'level'), up(0.3), down(1, 'level'), up(2)],
    commits: ['level@0.3'],
  },
  {
    note: 'the controls drawn afresh inside a settle: everything in hand dropped, every timer cancelled',
    app: 'both',
    events: [...tap(0, 'eggCount'), { kind: 'fresh', at_s: 0.5 }],
    commits: [],
  },
  {
    note: 'the start\'s − tapped, then held: committed on the lift',
    app: 'both',
    events: [...tap(0, 'startedAt'), down(0.5, 'startedAt'), change(0.55, 'startedAt'), change(0.95, 'startedAt'), up(1.1)],
    commits: ['startedAt@1.1'],
  },
];

const cold: RunningCook = startCook(START_S, BASE_CHOICES, 0, MEMORY, 'metric', 'en');
const tapped = withBoil(cold, START_S + 532.5);
const pulled = writeEvents(tapped, {
  ...tapped.events, pulled: { due_s: START_S + 851.2, out_s: START_S + 858.9, by: 'cook', confirmed: true },
});
const cooled = writeEvents(pulled, { ...pulled.events, cooledAt_s: START_S + 1031.9 });

/** The controls saying something else of every choice. */
const SAID: CookChoices = {
  mass_kg: 0.0637, massFrom: 'scale', sizeTable: null, eggFrom: 'custom', customStart_C: 17, room_C: 24,
  startMode: 'hot', afterBoil: 'off', cooling: 'bowl', tapWater_C: 14, bowlLitres: 1.5, bowlWater_C: 11,
  waterLitres: 3, eggCount: 4, altitude_m: 1200, level: 0.83,
};

const GROUPS: HandGroup[] = [
  'mass', 'eggFrom', 'customStart', 'room', 'startMode', 'afterBoil', 'cooling', 'tapWater', 'bowlLitres', 'bowlWater',
  'waterLitres', 'eggCount', 'altitude', 'level', 'startedAt',
];

/** What the plan reads of a cook previewed: its start, choices and events,
 *  when it was last corrected, and how long its log is. A level's preview
 *  is not its log folded (`levelPreview`), so the cook is written as it
 *  stands, not as a log. */
function previewed(c: RunningCook) {
  return {
    startedAt_s: c.startedAt_s, choices: c.choices, events: c.events, correctedAt_s: c.correctedAt_s, logLength: c.log.length,
  };
}

export function handFixture() {
  const sequences = SEQUENCES.map((q) => {
    const steps = replay(q.events);
    const made = commitsOf(steps);
    if (JSON.stringify(made) !== JSON.stringify(q.commits)) {
      throw new Error(`${q.note}: commits ${JSON.stringify(made)}, not ${JSON.stringify(q.commits)}`);
    }
    return { note: q.note, app: q.app, steps: steps.map((s) => ({ event: s.event, ...s.out })) };
  });
  const cooks: { name: string; cook: RunningCook }[] = [{ name: 'heating', cook: tapped }, { name: 'pulled', cook: pulled }];
  const choices = [];
  for (const c of cooks) {
    for (const g of GROUPS) {
      choices.push({ cook: c.name, group: g, choices: handChoices(c.cook, SAID, g) });
    }
  }
  const now_s = START_S + 1200;
  const previews = [];
  for (const c of cooks) {
    for (const g of ['mass', 'level', 'startedAt'] as HandGroup[]) {
      previews.push({ cook: c.name, group: g, start_s: START_S - 120, now_s: now_s, preview: previewed(previewCook(c.cook, SAID, g, START_S - 120, now_s)) });
    }
  }
  const startCooks = [{ name: 'cold', cook: cold }, { name: 'heating', cook: tapped }, { name: 'pulled', cook: pulled }, { name: 'cooled', cook: cooled }];
  const starts = [];
  for (const c of startCooks) {
    for (const [from_s, up_, at_s] of [
      [START_S, true, START_S + 30], [START_S, true, START_S + 300], [START_S + 500, true, START_S + 1500],
      [START_S + 850, true, START_S + 1500], [START_S + 1000, true, START_S + 1500], [START_S, false, START_S + 300],
      [START_S - 7170, false, START_S + 300], [START_S - 7200, false, START_S + 300],
    ] as [number, boolean, number][]) {
      starts.push({ cook: c.name, from_s: from_s, up: up_, now_s: at_s, ...startStepped(c.cook, from_s, up_, at_s) });
    }
  }
  return {
    about: 'The correction in hand (src/core/hand.ts): event sequences with every timer come round, what a commit of each group makes of a cook before and after the pull, the cook the aimed-for egg is planned on, and the start\'s − and + to each limit.',
    cooks: [...cooks, { name: 'cold', cook: cold }, { name: 'cooled', cook: cooled }],
    said: SAID,
    sequences: sequences,
    choices: choices,
    previews: previews,
    starts: starts,
  };
}
