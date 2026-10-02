/**
 * The web app's ticket (`src/ui/ticket.ts`): the cook frozen at "Eggs in",
 * which the running screen describes and the calibration learns from.
 *
 * A ticket read back after a reload is taken whole or not at all: a partial
 * one does not throw, it produces a plausible wrong answer and then teaches it
 * to the posterior. So every field it needs is required, and a ticket this
 * build wrote must come back exactly as it went in.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { eggFromMass } from '../src/core/geometry.js';
import { Ticket, restoreTicket, withTimeToBoil } from '../src/ui/ticket.js';

function aTicket(): Ticket {
  return {
    egg: eggFromMass(0.06),
    massFrom: 'class',
    sizeTable: 'eu',
    eggFrom: 'fridge',
    boilRemembered: false,
    setup: {
      startMode: 'cold', afterBoil: 'hold', eggStart_C: 4, ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, cooling: 'ice', waterLitres: 2, eggCount: 2,
    },
    logNominalTarget: 0.9,
    units: 'metric',
    lean_s: 12,
    outcome: {
      pTooSoft: 0.2, pJustRight: 0.6, pTooFirm: 0.2, pWhiteRunny: 0.05, pWhiteTender: 0.25, pWhiteFirm: 0.7,
      levelLow: 0.3, levelMedian: 0.4, levelHigh: 0.5, lean: 'balanced',
    },
    peakYolk_C: 66,
    lang: 'en',
    probeMoment: true,
  };
}

/** As written to storage and read back. */
function stored(k: unknown): unknown {
  return JSON.parse(JSON.stringify(k));
}

test('a ticket this build wrote comes back as it went in', () => {
  const k = aTicket();
  assert.deepEqual(restoreTicket(stored(k)), k);
  const measured: Ticket = { ...k, massFrom: 'scale', sizeTable: null, outcome: null };
  assert.deepEqual(restoreTicket(stored(measured)), measured, 'a weighed egg, started before the odds were in');
});

test('every field is required: a ticket missing any one is refused', () => {
  for (const key of Object.keys(aTicket())) {
    const k = stored(aTicket()) as Record<string, unknown>;
    delete k[key];
    assert.equal(restoreTicket(k), null, `without ${key}`);
  }
  for (const key of ['eggStart_C', 'ambient_C', 'boiling_C', 'timeToBoil_s', 'waterLitres', 'eggCount']) {
    const k = stored(aTicket()) as { setup: Record<string, unknown> };
    delete k.setup[key];
    assert.equal(restoreTicket(k), null, `without setup.${key}`);
  }
  for (const key of ['radius_m', 'minorDiameter_m', 'mass_kg', 'volume_m3']) {
    const k = stored(aTicket()) as { egg: Record<string, unknown> };
    k.egg[key] = 0;
    assert.equal(restoreTicket(k), null, `with egg.${key} zero`);
  }
});

test('a ticket that is not one of this build\'s is refused, not patched', () => {
  const bad: [string, (k: Record<string, unknown>) => void][] = [
    ['a class egg with no carton', (k) => { k['sizeTable'] = null; }],
    ['a weighed egg with a carton', (k) => { k['massFrom'] = 'scale'; }],
    ['an unknown start', (k) => { (k['setup'] as Record<string, unknown>)['startMode'] = 'sous'; }],
    ['an unknown cooling', (k) => { (k['setup'] as Record<string, unknown>)['cooling'] = 'snow'; }],
    ['an unknown heat', (k) => { (k['setup'] as Record<string, unknown>)['afterBoil'] = 'simmer'; }],
    ['an unknown egg source', (k) => { k['eggFrom'] = 'garden'; }],
    ['unknown units', (k) => { k['units'] = 'cubits'; }],
    ['no language', (k) => { k['lang'] = ''; }],
    ['a target that is not a number', (k) => { k['logNominalTarget'] = 'soft'; }],
    ['an outcome that is not one', (k) => { k['outcome'] = { lean: 'soft' }; }],
  ];
  for (const [what, spoil] of bad) {
    const k = stored(aTicket()) as Record<string, unknown>;
    spoil(k);
    assert.equal(restoreTicket(k), null, what);
  }
  assert.equal(restoreTicket(null), null);
  assert.equal(restoreTicket('ticket'), null);
});

test('a setup without a heat after the boil is refused, not read as the heat held', () => {
  const k = stored(aTicket()) as { setup: Record<string, unknown> };
  delete k.setup['afterBoil'];
  assert.equal(restoreTicket(k), null);
});

test('withTimeToBoil moves the time to boil and nothing else, on a copy', () => {
  const k = aTicket();
  const measured = withTimeToBoil(k, 512);
  assert.equal(measured.setup.timeToBoil_s, 512);
  assert.equal(k.setup.timeToBoil_s, 480, 'the ticket it was given is untouched');
  assert.deepEqual({ ...measured, setup: { ...measured.setup, timeToBoil_s: 480 } }, k);
});
