/**
 * The web readout (`phaseView`, src/ui/phaseView.ts): what the screen says at
 * any moment of a cook, in words.
 *
 * Which keys it says is core's (`phaseKeys`, pinned for both apps by
 * fixtures/wording.json); these tests hold the web to those keys, and to the
 * arguments it fills them with - above all that a running cook is described
 * by its ticket and its machine, never by the controls, which a second tab
 * may have changed since "Eggs in".
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { eggFromMass } from '../src/core/geometry.js';
import { parseCatalogue } from '../src/core/copy.js';
import { phaseKeys } from '../src/core/wording.js';
import { forceFormatLocale, t, useCatalogue } from '../src/ui/copy.js';
import { formatClock, spokenClock } from '../src/ui/countdown.js';
import { advance, beginCooling, idleMachine, recordBoil, startCold, startHot } from '../src/ui/machine.js';
import { ReadoutFacts, phaseView } from '../src/ui/phaseView.js';
import { Ticket } from '../src/ui/ticket.js';
import { show, useUnits } from '../src/ui/units.js';

useCatalogue(parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8'))));
forceFormatLocale('en-GB');
useUnits('metric');

const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);

/** The controls say a hot start at altitude with the heat off; the ticket, a
 *  cold start at sea level with the heat held. Whatever the screen says while
 *  the cook runs must be the ticket's. */
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

function coldTicket(): Ticket {
  return {
    egg: eggFromMass(0.06), massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', boilRemembered: false,
    setup: {
      startMode: 'cold', afterBoil: 'hold', eggStart_C: 4, ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, cooling: 'ice', waterLitres: 2, eggCount: 2,
    },
    logNominalTarget: 0.9, units: 'metric', lean_s: 0, outcome: null, forecast: null, peakYolk_C: 66, lang: 'en',
    probeMoment: true,
  };
}

test('idle: the controls\' pot, in the words phaseKeys chose', () => {
  const cold = facts({ controls: { ...facts().controls, startMode: 'cold', afterBoil: 'hold' } });
  const v = phaseView(idleMachine('ice'), null, T0, cold);
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
  const v = phaseView(idleMachine('ice'), null, T0, facts({ whiteSets: false }));
  assert.equal(v.primary, t('action.eggsIn'));
  assert.equal(v.primaryDisabled, true);
  assert.equal(v.hint, t('action.hint.whiteNeverSets'));
});

test('a cold start heating: counts down to the pull on the ticket\'s pot, and can be cancelled', () => {
  const m = startCold(T0, 900, 480, 'ice', 0.4);
  const now = T0 + 60_000;
  const v = phaseView(m, coldTicket(), now, facts());
  assert.equal(v.label, t('readout.phase.heating'));
  assert.equal(v.digits, formatClock(840));
  assert.equal(v.subline, t('readout.sub.heating', { elapsed: formatClock(60), boil: formatClock(480) }));
  assert.equal(v.primary, t('action.fullBoil'));
  assert.equal(v.hint, t('action.hint.heating'), 'the ticket holds the heat; the controls\' "off" is not read');
  assert.equal(v.secondaryVisible, true);
});

test('cooking: the boiling point is the ticket\'s, not the controls\'', () => {
  const boiled = recordBoil(startCold(T0, 900, 480, 'ice', 0.4), T0 + 500_000, 910);
  const v = phaseView(boiled, coldTicket(), T0 + 600_000, facts());
  assert.equal(v.label, t('readout.phase.cookingBoiling'));
  assert.equal(v.hint, t('action.hint.cookingBoiling', { boiling: show('temperature', 100) }));
  assert.equal(v.primary, null, 'no button while it cooks');
  assert.equal(v.secondaryVisible, true);
});

test('the pull, the cooling and done', () => {
  const hot: Ticket = { ...coldTicket(), setup: { ...coldTicket().setup, startMode: 'hot' } };
  const m = startHot(T0, 600, 'ice', 0.4);
  const pull = advance(m, T0 + 601_000).machine;
  assert.equal(pull.phase, 'PULL');
  const atPull = phaseView(pull, hot, T0 + 603_000, facts());
  assert.equal(atPull.label, t('readout.phase.pull'));
  assert.equal(atPull.digits, `+${formatClock(3)}`, 'counted from the deadline, not from when the tab noticed');
  assert.equal(atPull.primary, t('action.pulled.ice'));

  const cooling = beginCooling(pull, T0 + 605_000);
  assert.equal(cooling.phase, 'COOLING');
  const cool = phaseView(cooling, hot, T0 + 605_000, facts({ probeWanted: true }));
  assert.equal(cool.label, t('readout.phase.coolingIce'));
  assert.equal(cool.subline, t('readout.sub.coolingProbe'));
  assert.equal(cool.secondaryVisible, true);

  const done = advance(cooling, T0 + 3_600_000).machine;
  assert.equal(done.phase, 'DONE');
  const plain = phaseView(done, hot, T0 + 3_600_000, facts());
  assert.equal(plain.digits, formatClock(600));
  assert.equal(plain.subline, t('readout.sub.doneHot', { boil: formatClock(0), cooking: formatClock(600) }));
  assert.equal(plain.spoken, t('spoken.done'));
  assert.equal(plain.primary, t('action.startAgain'));
  assert.equal(plain.secondaryVisible, false, 'a finished cook has nothing to cancel');
  assert.equal(phaseView(done, hot, T0 + 3_600_000, facts({ probePending: true })).spoken, t('spoken.probe'));
});
