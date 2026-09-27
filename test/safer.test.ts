/**
 * The play-safe levels (src/core/reach.ts, "playing safe").
 *
 * The claims: a reading is the outcome the app shows at that level; the
 * range rises with the level, which the bisection rests on, everywhere but
 * the one known step at a white-bound soft end; the bisection lands where a
 * full scan of the slider's grid does; each answer meets its definition and
 * is null exactly when no move is needed or none is possible; and no answer
 * is ever a level the slider would refuse.
 *
 * The fixture (`fixtures/safer.json`) pins the arithmetic for the Swift port.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decide, decisionGridRequest, decisionInputs } from '../src/core/decide.js';
import { DoseGrid } from '../src/core/doseGrid.js';
import { createPrior } from '../src/core/infer.js';
import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { predictOutcome } from '../src/core/outcome.js';
import { donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import { CALIBRATION_SEED, SLIDER_STEPS } from '../src/core/policy.js';
import {
  Calibration, buildRequestedGrid, calibrationDoneness, calibrationParams,
} from '../src/core/record.js';
import {
  OddsProfile, offeredPositions, oddsProfile, outcomeAtLevel, saferLevels,
} from '../src/core/reach.js';

const EGG = eggFromMass(0.068);

function setupOf(over: Partial<CookSetup> = {}): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'hold', waterLitres: 2, eggCount: 2, ...over,
  };
}

const SETUP = setupOf();
const COUNTER = setupOf({ cooling: 'counter' });
const PARTICLES = 300;

/** The production surface's extent at a third of its cost, as
 *  test/reach.test.ts has it. */
function gridFor(c: Calibration, setup: CookSetup): DoseGrid {
  const q = decisionGridRequest(decisionInputs(c, EGG, setup));
  const count = Math.ceil((q.spec.timeMax_s - q.spec.timeMin_s) / 20) + 1;
  return buildRequestedGrid({
    ...q, spec: { ...q.spec, alphaCount: 9, timeMax_s: q.spec.timeMin_s + 20 * (count - 1), timeCount: count },
  });
}

/** A posterior that knows its cook, as test/reach.test.ts has it: the
 *  time-scale to 2%, the taste and the white to a twentieth of a decade. */
function knowing(white: number, eggsLogged = 4): Calibration {
  const post = createPrior(PARTICLES, CALIBRATION_SEED);
  for (let i = 0; i < post.particles.length; i++) {
    const p = post.particles[i];
    const z = Math.log(p.alpha_m2s / ALPHA_DEFAULT) / ALPHA_REL_SD;
    post.particles[i] = {
      ...p,
      alpha_m2s: ALPHA_DEFAULT * Math.exp(0.02 * z),
      logDoseOffset: 0.05 * p.logDoseOffset / 0.22,
      whiteOffset: white + 0.05 * p.whiteOffset / 0.5,
    };
  }
  return { posterior: post, eggsLogged: eggsLogged };
}

const FRESH: Calibration = { posterior: createPrior(PARTICLES, CALIBRATION_SEED), eggsLogged: 0 };
const KNOWN = knowing(0);

interface Pot {
  name: string;
  c: Calibration;
  setup: CookSetup;
  grid: DoseGrid;
  profile: OddsProfile;
  /** levelLow and levelHigh at every offered position, from `lo`. */
  lo: number;
  hi: number;
  low: number[];
  high: number[];
}

function scanned(name: string, c: Calibration, setup: CookSetup): Pot {
  const grid = gridFor(c, setup);
  const profile = oddsProfile(c, EGG, setup, grid);
  const range = offeredPositions(profile);
  if (range === null) throw new Error(`${name}: nothing offered`);
  const low: number[] = [];
  const high: number[] = [];
  for (let k = range.lo; k <= range.hi; k++) {
    const o = outcomeAtLevel(c, EGG, setup, grid, k / SLIDER_STEPS);
    low.push(o.levelLow);
    high.push(o.levelHigh);
  }
  return { name, c, setup, grid, profile, lo: range.lo, hi: range.hi, low, high };
}

const POTS: Pot[] = [
  scanned('fresh install', FRESH, SETUP),
  scanned('a cook it knows', KNOWN, SETUP),
  scanned('a cook it knows, on the counter', KNOWN, COUNTER),
];

test('1. a reading is the outcome the app shows at that level', () => {
  const pot = POTS[1];
  for (const level of [0.22, 0.41, 0.62, 0.9]) {
    const sol = solveCookTime(EGG, pot.setup, calibrationParams(pot.c), calibrationDoneness(pot.c, level));
    const logTarget = Math.log10(donenessFromSlider(level).yolkDose_min);
    const d = decide(pot.c, pot.grid, sol, logTarget);
    assert.deepEqual(
      outcomeAtLevel(pot.c, EGG, pot.setup, pot.grid, level),
      predictOutcome(pot.c.posterior, pot.grid, d.cookTime_s, logTarget),
    );
  }
});

test('2. the range rises with the level, but for one step at a white-bound soft end', () => {
  for (const pot of POTS) {
    for (const series of [pot.low, pot.high]) {
      for (let i = 1; i < series.length; i++) {
        const drop = series[i - 1] - series[i];
        if (drop <= 1e-12) continue;
        // The only dip allowed: the first step up from the counter's softest
        // offered level, where the white binds the choice, and small.
        assert.equal(pot.setup.cooling, 'counter', `${pot.name}: falls ${drop} at ${(pot.lo + i) / 100}`);
        assert.equal(i, 1, `${pot.name}: falls ${drop} at ${(pot.lo + i) / 100}`);
        assert.ok(drop < 0.01, `${pot.name}: falls ${drop}`);
      }
    }
  }
});

test('3. the bisection lands where a full scan does, and each answer meets its definition', () => {
  for (const pot of POTS) {
    for (let k = pot.lo; k <= pot.hi; k += 7) {
      const level = k / SLIDER_STEPS;
      const s = saferLevels(pot.c, EGG, pot.setup, pot.grid, pot.profile, level);
      const at = (level: number): number => Math.round(level * SLIDER_STEPS) - pot.lo;

      // The scan: the softest position at or over k whose 10% point reaches
      // the level, and the firmest at or under whose 90% point stays under.
      let firm: number | null = null;
      for (let j = k; j <= pot.hi; j++) if (pot.low[j - pot.lo] >= level) { firm = j; break; }
      let soft: number | null = null;
      for (let j = k; j >= pot.lo; j--) if (pot.high[j - pot.lo] <= level) { soft = j; break; }
      const where = `${pot.name} at ${level}`;
      assert.equal(s.firmerLevel, firm === null || firm === k ? null : firm / SLIDER_STEPS, `${where}: firmer`);
      assert.equal(s.softerLevel, soft === null || soft === k ? null : soft / SLIDER_STEPS, `${where}: softer`);

      // Null means the level already does it, or nothing offered does.
      if (s.firmerLevel === null) {
        assert.ok(pot.low[k - pot.lo] >= level || pot.low[pot.hi - pot.lo] < level, `${where}: firmer null`);
      } else {
        assert.ok(pot.low[at(s.firmerLevel)] >= level);
        assert.ok(pot.low[at(s.firmerLevel) - 1] < level);
        assert.ok(s.firmerLevel > level && s.firmerLevel <= pot.hi / SLIDER_STEPS);
      }
      if (s.softerLevel === null) {
        assert.ok(pot.high[k - pot.lo] <= level || pot.high[0] > level, `${where}: softer null`);
      } else {
        assert.ok(pot.high[at(s.softerLevel)] <= level);
        assert.ok(pot.high[at(s.softerLevel) + 1] > level);
        assert.ok(s.softerLevel < level && s.softerLevel >= pot.lo / SLIDER_STEPS);
      }
    }
  }
});

test('4. on a fresh install at jammy it points a long way each side; for a cook it knows, a short way', () => {
  const fresh = saferLevels(FRESH, EGG, SETUP, POTS[0].grid, POTS[0].profile, 0.41);
  const known = saferLevels(KNOWN, EGG, SETUP, POTS[1].grid, POTS[1].profile, 0.41);
  assert.ok(fresh.firmerLevel !== null && fresh.firmerLevel >= 0.6, `fresh firmer ${fresh.firmerLevel}`);
  assert.ok(fresh.softerLevel !== null && fresh.softerLevel <= 0.2, `fresh softer ${fresh.softerLevel}`);
  assert.ok(known.firmerLevel !== null && known.firmerLevel - 0.41 < fresh.firmerLevel - 0.41);
  assert.ok(known.softerLevel !== null && 0.41 - known.softerLevel < 0.41 - fresh.softerLevel);
});

test('5. never a level the slider would refuse', () => {
  // The odds' reach narrows the range to 0.35-0.55: a firmer level that would
  // need more is not offered, and one inside it is.
  const pot = POTS[1];
  const narrowed: OddsProfile = { ...pot.profile, softest: 0.35, hardest: 0.55 };
  const wide = saferLevels(pot.c, EGG, pot.setup, pot.grid, pot.profile, 0.5);
  assert.ok(wide.firmerLevel !== null && wide.firmerLevel > 0.55, `unnarrowed ${wide.firmerLevel}`);
  const s = saferLevels(pot.c, EGG, pot.setup, pot.grid, narrowed, 0.5);
  assert.equal(s.firmerLevel, null);
  assert.ok(s.softerLevel === null || s.softerLevel >= 0.35);
  const t = saferLevels(pot.c, EGG, pot.setup, pot.grid, narrowed, 0.36);
  assert.ok(t.firmerLevel !== null && t.firmerLevel <= 0.55);
  assert.equal(t.softerLevel, null);

  // And nothing at all where the white never sets.
  const empty: OddsProfile = {
    points: [], best: 0, physicalSoftest: 1, physicalHardest: 0, softest: null, hardest: null,
  };
  assert.deepEqual(saferLevels(pot.c, EGG, pot.setup, pot.grid, empty, 0.41), { firmerLevel: null, softerLevel: null });
});

test('6. the ends: nothing firmer than hard, nothing softer than the softest offered', () => {
  const pot = POTS[1];
  assert.equal(saferLevels(pot.c, EGG, pot.setup, pot.grid, pot.profile, 1).firmerLevel, null);
  assert.equal(saferLevels(pot.c, EGG, pot.setup, pot.grid, pot.profile, pot.lo / SLIDER_STEPS).softerLevel, null);
});
