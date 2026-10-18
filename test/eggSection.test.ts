/**
 * The egg in cross-section, drawn (src/ui/eggSection.ts): the outlines and the
 * fills, without a page.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { type SectionPalette, heatAt, heatFills, ringFills, ringPoints } from '../src/ui/eggSection.ts';
import { HEAT_STOPS_C, advanceSection, createSection, sectionView } from '../src/core/section.ts';
import { readFileSync } from 'node:fs';
import { eggFromMass } from '../src/core/geometry.ts';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET } from '../src/core/solve.ts';
import { EGG_LENGTH_RATIO, YOLK_RADIUS_FRAC } from '../src/core/constants.ts';
import { appSetup } from '../tools/common.ts';

const PALETTE: SectionPalette = {
  yolkRunny: [255, 0, 0],
  yolkJammy: [0, 255, 0],
  yolkHard: [0, 0, 255],
  whiteRaw: [10, 10, 10],
  whiteSet: [250, 250, 250],
};

function radius(p: [number, number]): number {
  return Math.hypot(p[0], p[1]);
}

/** The shell's width at height y, from its outline. */
function widthAt(y: number): number {
  const shell = ringPoints(1.0);
  const xs: number[] = [];
  for (let i = 0; i < shell.length; i++) {
    const [ax, ay] = shell[i];
    const [bx, by] = shell[(i + 1) % shell.length];
    if ((ay - y) * (by - y) <= 0 && ay !== by) xs.push(ax + (bx - ax) * (y - ay) / (by - ay));
  }
  return Math.max(...xs) - Math.min(...xs);
}

test('the shell is the model\'s egg, standing on its blunt end', () => {
  const shell = ringPoints(1.0);
  const ys = shell.map((p) => p[1]);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  const length = top - bottom;
  const width = Math.max(...shell.map((p) => p[0])) - Math.min(...shell.map((p) => p[0]));
  assert.ok(Math.abs(length / width - EGG_LENGTH_RATIO) < 0.05, `length/width ${length / width}`);
  // A quarter of the way in from each end: the blunt end, below, is the wider.
  const mid = (top + bottom) / 2;
  const blunt = widthAt(mid - length / 4);
  const pointed = widthAt(mid + length / 4);
  assert.ok(blunt / pointed > 1.15, `blunt ${blunt}, pointed ${pointed}`);
});

test('the yolk is round, and every outline lies inside the next', () => {
  for (const p of ringPoints(YOLK_RADIUS_FRAC)) {
    assert.ok(Math.abs(radius(p) - radius(ringPoints(YOLK_RADIUS_FRAC)[0])) < 1e-12);
  }
  let inner = ringPoints(0.05);
  for (let x = 0.1; x <= 1.0001; x += 0.05) {
    const outer = ringPoints(Math.min(x, 1));
    for (let i = 0; i < outer.length; i++) {
      assert.ok(radius(outer[i]) > radius(inner[i]), `x ${x.toFixed(2)}, point ${i}`);
    }
    inner = outer;
  }
});

test('a raw egg is runny yolk and clear white; a hard one is the other ends', () => {
  const setup = appSetup();
  const s = createSection(eggFromMass(0.060), setup, DEFAULT_PARAMS);
  const raw = ringFills(sectionView(s, WHITE_DOSE_TARGET), PALETTE);
  assert.equal(raw[0], '#ff0000');
  assert.equal(raw[raw.length - 1], '#0a0a0a');
  advanceSection(s, eggFromMass(0.060), setup, 1800, null);
  const hard = ringFills(sectionView(s, WHITE_DOSE_TARGET), PALETTE);
  assert.equal(hard[0], '#0000ff');
  assert.equal(hard[hard.length - 1], '#fafafa');
});

/** A colour at each heat stop, told apart by its red. */
const HEAT: [number, number, number][] = [[0, 0, 0], [50, 0, 0], [100, 0, 0], [150, 0, 0], [200, 0, 0]];

test('the heat map is each stop\'s colour at its temperature, blended between, held beyond', () => {
  for (let i = 0; i < HEAT_STOPS_C.length; i++) assert.deepEqual(heatAt(HEAT_STOPS_C[i], HEAT), HEAT[i]);
  assert.deepEqual(heatAt(-5, HEAT), HEAT[0]);
  assert.deepEqual(heatAt(130, HEAT), HEAT[HEAT.length - 1]);
  const between = heatAt((HEAT_STOPS_C[2] + HEAT_STOPS_C[3]) / 2, HEAT);
  assert.equal(between[0], 125);
});

test('a raw egg in the fridge is cold all through; a boiled one hot at the shell; the first moment uniform', () => {
  const setup = appSetup();
  const egg = eggFromMass(0.060);
  const s = createSection(egg, setup, DEFAULT_PARAMS);
  const start = heatFills(sectionView(s, WHITE_DOSE_TARGET), HEAT, setup.eggStart_C);
  assert.ok(start.every((f) => f === start[0]), 'every ring at the egg\'s own temperature');
  advanceSection(s, egg, setup, 900, null);
  const hot = heatFills(sectionView(s, WHITE_DOSE_TARGET), HEAT, null);
  assert.ok(parseInt(hot[hot.length - 1].slice(1, 3), 16) > parseInt(hot[0].slice(1, 3), 16), 'the shell hotter than the centre');
});

test('styles.css has a heat colour for each stop, in both schemes', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  for (const name of ['--heat-cold', '--heat-cool', '--heat-mid', '--heat-warm', '--heat-hot']) {
    assert.equal(css.split(`${name}:`).length - 1, 2, `${name} in the dark and the light`);
  }
  assert.equal(HEAT_STOPS_C.length, 5);
});
