/**
 * The web readout (`phaseView`, src/ui/phaseView.ts): what the screen says at
 * any moment of a cook, in words.
 *
 * Which keys it says is core's (`phaseKeys`, pinned for both apps by
 * fixtures/wording.json); these tests hold the web to those keys, and to the
 * arguments it fills them with - above all that a running cook is described
 * by its own choices and its plan (src/core/running.ts), never by the
 * controls, which a second tab may have changed since "Eggs in".
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIZE_CLASSES } from '../src/core/geometry.js';
import { parseCatalogue } from '../src/core/copy.js';
import { PULL_GRACE_SECONDS } from '../src/core/policy.js';
import {
  CookChoices, CookPlan, RunningCook, eventsDue, guessLengthened, replan, startCook, withBoil, withOut, writeEvents,
} from '../src/core/running.js';
import { phaseKeys } from '../src/core/wording.js';
import { forceFormatLocale, t, useCatalogue } from '../src/ui/copy.js';
import { formatClock, spokenClock } from '../src/ui/countdown.js';
import { ReadoutFacts, phaseView } from '../src/ui/phaseView.js';
import { show, useUnits } from '../src/ui/units.js';
import { knowing } from '../tools/common.js';

useCatalogue(parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8'))));
forceFormatLocale('en-GB');
useUnits('metric');

const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);
const S = T0 / 1000;
const C = knowing({ particles: 200, eggsLogged: 0 });

/** The controls say a hot start at altitude with the heat off; the cook, a
 *  cold start at sea level with the heat held. Whatever the screen says while
 *  the cook runs must be the cook's. */
function facts(over: Partial<ReadoutFacts> = {}): ReadoutFacts {
  return {
    cookTime_s: 720,
    whiteSets: true,
    controls: {
      startMode: 'hot', afterBoil: 'off', cooling: 'tap', waterLitres: 3, boiling_C: 90, timeToBoil_s: 400,
    },
    boilKnown: false,
    probeWanted: false,
    probePending: false,
    ...over,
  };
}

const CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[1].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.4,
};

function cookOf(over: Partial<CookChoices> = {}): RunningCook {
  return startCook(T0 / 1000, { ...CHOICES, ...over }, 0, { '2.0': 480 }, 'metric', 'en');
}

function planOf(cook: RunningCook, now_s: number): CookPlan {
  return replan(cook, C, null, 0, now_s);
}

test('idle: the controls\' pot, in the words phaseKeys chose', () => {
  const cold = facts({ controls: { ...facts().controls, startMode: 'cold', afterBoil: 'hold' } });
  const v = phaseView(null, null, T0, cold);
  const keys = phaseKeys({
    phase: 'IDLE', startMode: 'cold', afterBoil: 'hold', cooling: 'tap', whiteSets: true, boilKnown: false,
    probeWanted: false,
  });
  assert.equal(v.label, t(keys.label));
  assert.equal(v.digits, formatClock(720));
  assert.equal(v.subline, t(keys.subline, { boil: formatClock(400), water: show('water', 3) }));
  assert.equal(v.spoken, t('spoken.total', { time: spokenClock(720) }));
  assert.equal(v.primary, t('action.startHeating'));
  assert.equal(v.primaryDisabled, false);
  assert.equal(v.hint, t(keys.hint ?? '', { time: formatClock(720) }));
  assert.equal(v.secondaryVisible, false, 'nothing to cancel');
});

test('idle: a hot start has no ramp, and a white that never sets offers nothing to start', () => {
  const v = phaseView(null, null, T0, facts({ whiteSets: false }));
  assert.equal(v.primary, t('action.eggsIn'));
  assert.equal(v.primaryDisabled, true);
  assert.equal(v.hint, t('action.hint.whiteNeverSets'));
});

test('a cold start heating: counts down to the plan\'s pull on the cook\'s pot, and can be cancelled', () => {
  const cook = cookOf();
  const now_s = S + 60;
  const plan = planOf(cook, now_s);
  const v = phaseView(cook, plan, now_s * 1000, facts());
  assert.equal(v.label, t('readout.phase.heating'));
  assert.equal(v.digits, formatClock(plan.deadlines.cookEnd_s - now_s));
  assert.equal(v.subline, t('readout.sub.heating', { elapsed: formatClock(60), boil: formatClock(480) }));
  assert.equal(v.primary, t('action.fullBoil'));
  assert.equal(v.hint, t('action.hint.heating'), 'the cook holds the heat; the controls\' "off" is not read');
  assert.equal(v.secondaryVisible, true);
});

test('a slow hob: once the guess is lengthened, the time heated counts up, never a time left (review 3)', () => {
  const cook = cookOf();
  for (const heated of [900, 1000, 1500]) {
    const now_s = S + heated;
    const plan = planOf(cook, now_s);
    assert.equal(guessLengthened(plan), true, `lengthened by ${heated} s`);
    const v = phaseView(cook, plan, now_s * 1000, facts());
    assert.equal(v.label, t('readout.phase.heating'));
    assert.equal(v.digits, formatClock(heated), 'the time heated, not the pull the clock is chasing');
    assert.equal(v.subline, t('readout.sub.heating', {
      elapsed: formatClock(heated), boil: formatClock(plan.setup.timeToBoil_s),
    }));
    assert.equal(v.spoken, v.subline, 'no "left" spoken either');
    assert.notEqual(v.digits, formatClock(0));
  }
});

test('cooking: the time to boil is the tap, the boiling point the cook\'s, not the controls\'', () => {
  const tapped = withBoil(cookOf(), S + 500);
  const plan = planOf(tapped, S + 500);
  const now_s = S + 600;
  const v = phaseView(tapped, plan, now_s * 1000, facts());
  assert.equal(v.label, t('readout.phase.cookingBoiling'));
  assert.equal(v.digits, formatClock(plan.cookTime_s - 600));
  assert.equal(v.subline, t('readout.sub.cookingCold', {
    boil: formatClock(500), after: formatClock(plan.cookTime_s - 500),
  }));
  assert.equal(v.hint, t('action.hint.cookingBoiling', { boiling: show('temperature', plan.setup.boiling_C) }));
  assert.equal(v.primary, null, 'no button while it cooks');
  assert.equal(v.secondaryVisible, true);
});

test('the pull, the cooling and done', () => {
  const hot = cookOf({ startMode: 'hot' });
  const plan = planOf(hot, S);
  const pull_s = plan.deadlines.cookEnd_s;
  const atPull = phaseView(hot, plan, (pull_s + 3) * 1000, facts());
  assert.equal(atPull.label, t('readout.phase.pull'));
  assert.equal(atPull.digits, `+${formatClock(3)}`, 'counted from the deadline, not from when the tab noticed');
  assert.equal(atPull.primary, t('action.pulled.ice'));
  assert.equal(atPull.hint, t('action.hint.pull', { seconds: Math.ceil(PULL_GRACE_SECONDS - 3) }));

  const out = withOut(hot, plan, pull_s + 5);
  const cooling = planOf(out, pull_s + 5);
  const cool = phaseView(out, cooling, (pull_s + 5) * 1000, facts({ probeWanted: true }));
  assert.equal(cool.label, t('readout.phase.coolingIce'));
  assert.equal(cool.digits, formatClock(cooling.cool_s));
  assert.equal(cool.subline, t('readout.sub.coolingProbe'));
  assert.equal(cool.secondaryVisible, true);

  const end_s = (cooling.deadlines.coolEnd_s ?? 0) + 1;
  const done = writeEvents(out, eventsDue(out, cooling, end_s));
  const finished = planOf(done, end_s);
  const plain = phaseView(done, finished, end_s * 1000, facts());
  assert.equal(plain.digits, formatClock(finished.cookTime_s));
  assert.equal(plain.subline, t('readout.sub.doneHot', { boil: formatClock(0), cooking: formatClock(finished.cookTime_s) }));
  assert.equal(plain.spoken, t('spoken.done'));
  assert.equal(plain.primary, t('action.startAgain'));
  assert.equal(plain.secondaryVisible, false, 'a finished cook has nothing to cancel');
  assert.equal(phaseView(done, finished, end_s * 1000, facts({ probePending: true })).spoken, t('spoken.probe'));
});
