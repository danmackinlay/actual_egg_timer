/**
 * The egg in cross-section (src/core/section.ts): the same cook as `simulate`,
 * carried forward a tick at a time, with a dose at every ring.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECTION_YOLK_SAMPLES, SECTION_WHITE_SAMPLES, advanceSection, createSection, previewSection, sectionView,
} from '../src/core/section.js';
import { eggFromMass } from '../src/core/geometry.js';
import { coolingTemperature } from '../src/core/protocol.js';
import {
  DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, simulate, sliderFromYolkDose, solveCookTime,
} from '../src/core/solve.js';
import { CARRYOVER_WINDOW, DT_SIM, YOLK_RADIUS_FRAC } from '../src/core/constants.js';
import { appSetup } from '../tools/common.js';

const EGG = eggFromMass(0.060);
const CENTRE = 0;
const INNER_WHITE = SECTION_YOLK_SAMPLES;
const SHELL = SECTION_YOLK_SAMPLES + SECTION_WHITE_SAMPLES - 1;

function relClose(actual: number, expected: number, rel: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= rel * Math.abs(expected),
    `${what}: expected ${expected} within ${rel} relative, got ${actual}`,
  );
}

test('section 1. the rings run centre to shell, with the yolk edge sampled as both', () => {
  const s = createSection(EGG, appSetup(), DEFAULT_PARAMS);
  assert.equal(s.x.length, SECTION_YOLK_SAMPLES + SECTION_WHITE_SAMPLES);
  assert.equal(s.x[CENTRE], 0);
  assert.equal(s.x[INNER_WHITE - 1], YOLK_RADIUS_FRAC);
  assert.equal(s.x[INNER_WHITE], YOLK_RADIUS_FRAC);
  assert.equal(s.x[SHELL], 1);
  assert.equal(s.yolk[INNER_WHITE - 1], true);
  assert.equal(s.yolk[INNER_WHITE], false);
  assert.equal(s.outer[INNER_WHITE - 1], YOLK_RADIUS_FRAC);
  assert.equal(s.outer[SHELL], 1);
  for (let i = 1; i < s.x.length; i++) {
    assert.ok(s.outer[i] > s.outer[i - 1], `outer edges rise at ${i}`);
    assert.ok(s.outer[i] >= s.x[i], `ring ${i} contains its sample`);
  }
});

test('section 2. at t = 0 nothing is set and the shell is at the water', () => {
  // Not "every ring at the egg's start": at t = 0 the shell's step from the
  // egg to the water is a fresh discontinuity, which 40 terms cannot
  // represent at the centre (CLAUDE.md, invariant 7). It is gone in seconds.
  const setup = appSetup({ startMode: 'cold' });
  const v = sectionView(createSection(EGG, setup, DEFAULT_PARAMS), WHITE_DOSE_TARGET);
  assert.ok(Math.abs(v.temperature_C[SHELL] - setup.ambient_C) < 1e-9, 'the shell at the water');
  for (let i = 0; i < v.x.length; i++) assert.equal(v.set[i], 0);
});

for (const [name, setup] of [
  ['hot start, ice', appSetup()],
  ['cold start, heat off, counter', appSetup({ startMode: 'cold', afterBoil: 'off', cooling: 'counter' })],
] as const) {
  test(`section 3. ${name}: the centre and the innermost white are simulate's`, () => {
    const cookTime_s = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(0.41)).result.cookTime_s;
    const result = simulate(EGG, setup, DEFAULT_PARAMS, cookTime_s);
    const s = createSection(EGG, setup, DEFAULT_PARAMS);
    let peakYolk = setup.eggStart_C;
    let peakWhite = setup.eggStart_C;
    // A tick at a time, as a screen would: the peaks are read between steps.
    while (s.t_s < cookTime_s + CARRYOVER_WINDOW) {
      advanceSection(s, EGG, setup, DEFAULT_PARAMS, s.t_s + DT_SIM, s.t_s + DT_SIM >= cookTime_s ? cookTime_s : null);
      const v = sectionView(s, WHITE_DOSE_TARGET);
      if (v.temperature_C[CENTRE] > peakYolk) peakYolk = v.temperature_C[CENTRE];
      if (v.temperature_C[INNER_WHITE] > peakWhite) peakWhite = v.temperature_C[INNER_WHITE];
    }
    assert.equal(peakYolk, result.peakYolk_C);
    assert.equal(peakWhite, result.peakWhite_C);
    // `simulate` stops once the dose rate is a millionth of its peak; this ran
    // on to the end of the window, so the doses agree to about that.
    relClose(s.dose[CENTRE].minutes, result.yolkDose_min, 1e-4, 'yolk dose');
    relClose(s.dose[INNER_WHITE].minutes, result.whiteDose_min, 1e-4, 'white dose');
  });
}

test('section 4. a tick at a time is the same as one long advance', () => {
  const setup = appSetup({ startMode: 'cold', cooling: 'tap' });
  const a = createSection(EGG, setup, DEFAULT_PARAMS);
  const b = createSection(EGG, setup, DEFAULT_PARAMS);
  const out_s = 731.3;
  advanceSection(a, EGG, setup, DEFAULT_PARAMS, 1200, out_s);
  for (let now = 0.2; now <= 1200; now += 0.2) {
    advanceSection(b, EGG, setup, DEFAULT_PARAMS, now, now >= out_s ? out_s : null);
  }
  advanceSection(b, EGG, setup, DEFAULT_PARAMS, 1200, out_s);
  assert.equal(b.t_s, a.t_s);
  assert.deepEqual(b.sphere.amp, a.sphere.amp);
  assert.deepEqual(b.dose.map((d) => d.minutes), a.dose.map((d) => d.minutes));
});

test('section 5. nothing unsets, and the white sets from the shell in', () => {
  const setup = appSetup();
  const s = createSection(EGG, setup, DEFAULT_PARAMS);
  let last = sectionView(s, WHITE_DOSE_TARGET).set;
  let shellSetAt = -1;
  let innerSetAt = -1;
  for (let t = 5; t <= 1500; t += 5) {
    advanceSection(s, EGG, setup, DEFAULT_PARAMS, t, t >= 420 ? 420 : null);
    const now = sectionView(s, WHITE_DOSE_TARGET).set;
    for (let i = 0; i < now.length; i++) assert.ok(now[i] >= last[i], `ring ${i} at ${t} s`);
    if (shellSetAt < 0 && now[SHELL] >= 1) shellSetAt = t;
    if (innerSetAt < 0 && now[INNER_WHITE] >= 1) innerSetAt = t;
    last = now;
  }
  assert.ok(shellSetAt > 0 && innerSetAt > shellSetAt, `shell ${shellSetAt} s, inner ${innerSetAt} s`);
});

test('section 6. once out, the shell follows what the egg cools in', () => {
  const setup = appSetup();
  const s = createSection(EGG, setup, DEFAULT_PARAMS);
  advanceSection(s, EGG, setup, DEFAULT_PARAMS, 400, null);
  assert.equal(s.outAt_s, null);
  advanceSection(s, EGG, setup, DEFAULT_PARAMS, 460, 400);
  assert.equal(s.outAt_s, 400);
  // An ice bath does not read the egg's state, only the water it left.
  const expected = coolingTemperature(s.sphere, EGG, setup, s.t_s - 400, DT_SIM, s.waterAtPull_C, 1.0);
  assert.equal(s.sphere.surface_C, expected);
  // A later, different time out cannot rewrite the one already crossed.
  advanceSection(s, EGG, setup, DEFAULT_PARAMS, 470, 450);
  assert.equal(s.outAt_s, 400);
});

test('section 7. the egg the settings aim for is the egg as eaten: the yolk at the level asked', () => {
  const cases = [
    [appSetup(), 0.41], [appSetup({ startMode: 'cold', cooling: 'tap' }), 0.62], [appSetup({ cooling: 'counter' }), 0.62],
  ] as const;
  for (const [setup, level] of cases) {
    const sol = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(level));
    const r = sol.result;
    const aimed = previewSection(EGG, setup, DEFAULT_PARAMS, r.cookTime_s, WHITE_DOSE_TARGET);
    // The whole carryover is in, as the solve counts it (which stops a
    // little short, once the dose rate is a millionth of its peak): the
    // centre reads the level the solve found, the one asked to within its
    // second.
    assert.ok(Math.abs(aimed.set[CENTRE] - sliderFromYolkDose(r.yolkDose_min)) < 1e-4, `${level}`);
    assert.ok(Math.abs(aimed.set[CENTRE] - level) < 0.02, `${level}: ${aimed.set[CENTRE]}`);
    // The live egg, carried a tick at a time through the cooling, is the same egg.
    const end = r.cookTime_s + CARRYOVER_WINDOW;
    const live = createSection(EGG, setup, DEFAULT_PARAMS);
    for (let t = 7.3; t < end; t += 7.3) {
      advanceSection(live, EGG, setup, DEFAULT_PARAMS, t, t >= r.cookTime_s ? r.cookTime_s : null);
    }
    advanceSection(live, EGG, setup, DEFAULT_PARAMS, end, r.cookTime_s);
    assert.deepEqual(sectionView(live, WHITE_DOSE_TARGET), aimed);
    // At the yolk's peak, which is Done, the dose is not all in: softer than
    // asked, which is why the aimed-for egg is not shown there (DECISIONS.md 98).
    const peak = createSection(EGG, setup, DEFAULT_PARAMS);
    advanceSection(peak, EGG, setup, DEFAULT_PARAMS, r.peakYolkTime_s, r.cookTime_s);
    assert.ok(sectionView(peak, WHITE_DOSE_TARGET).set[CENTRE] < aimed.set[CENTRE] - 0.03);
    assert.equal(aimed.set[SHELL], 1, 'the white set at the shell');
  }
});
