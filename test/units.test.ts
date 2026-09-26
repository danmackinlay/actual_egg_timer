/**
 * Metric and Imperial (LANGUAGE.md §4, PLAN.md F3).
 *
 * The one promise that matters: a cook who types 2.4 oz sees 2.4 oz again,
 * however the value was stored, clamped and carried through the egg's
 * geometry. It is checked here for every value every input can hold, and
 * `fixtures/units.json` holds the Swift port to the same answers.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LIMITS } from '../src/core/policy.js';
import {
  SIZE_CLASSES, US_SIZE_CLASSES, eggFromMass, eggFromMinorDiameter,
} from '../src/core/geometry.js';
import { parseCatalogue, render } from '../src/core/copy.js';
import {
  IMPERIAL_PINT_L, Measure, OUNCE_G, QUANTITIES, Quantity, UNIT_SYSTEMS, US_QUART_L,
  UnitSystem, chooseUnits, display, displayText, effectiveUnits, fromSI, measureFor, parse,
  readChosenUnits, regionalUnits, sizeClassLabel, toSI,
} from '../src/core/units.js';
import { eggRecordFor, Cooked } from '../src/ui/calibration.js';
import { startHot, advance } from '../src/ui/machine.js';
import { parseRecord } from '../src/core/record.js';

const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** Every measure either app can ask for: each quantity in each system, and
 *  water in and out of the US. */
function everyMeasure(): Measure[] {
  const out: Measure[] = [];
  for (const q of QUANTITIES) {
    for (const system of UNIT_SYSTEMS) {
      out.push(measureFor(q, system, 'US'));
      if (q === 'water') out.push(measureFor(q, system, 'GB'));
    }
  }
  return out;
}

/** Every value on an input's grid, inside its bounds. */
function grid(m: Measure): number[] {
  if (m.bounds === null) return [];
  const values: number[] = [];
  const lo = Math.round(m.bounds.lo / m.step);
  const hi = Math.round(m.bounds.hi / m.step);
  for (let n = lo; n <= hi; n++) values.push(n * m.stepNum / m.stepDen);
  return values;
}

function rendered(m: Measure, si: number): string {
  return render(EN, m.formatKey, { value: displayText(m, si) });
}

// --------------------------------------------------------------------------
// 1. The conversions
// --------------------------------------------------------------------------

test('1a. the fixed points convert exactly', () => {
  assert.equal(fromSI('F', 0), 32);
  assert.equal(fromSI('F', 100), 212);
  assert.equal(fromSI('F', -40), -40);
  assert.equal(toSI('F', 212), 100);
  assert.equal(toSI('oz', 1), OUNCE_G);
  assert.equal(toSI('in', 1), 25.4);
  assert.equal(toSI('ft', 1), 0.3048);
  assert.equal(toSI('qt', 1), US_QUART_L);
  assert.equal(toSI('pt', 1), IMPERIAL_PINT_L);
  for (const unit of ['C', 'g', 'mm', 'm', 'L'] as const) assert.equal(fromSI(unit, 12.34), 12.34);
});

test('1b. every conversion undoes itself to a trillionth', () => {
  for (const unit of ['C', 'F', 'g', 'oz', 'mm', 'in', 'm', 'ft', 'L', 'qt', 'pt'] as const) {
    for (const x of [-400, -2, 0, 0.25, 4, 44, 68, 100, 5000]) {
      const back = toSI(unit, fromSI(unit, x));
      assert.ok(Math.abs(back - x) <= 1e-12 * Math.max(1, Math.abs(x)), `${unit} ${x} -> ${back}`);
    }
  }
});

// --------------------------------------------------------------------------
// 2. The table
// --------------------------------------------------------------------------

test('2a. the steps are LANGUAGE.md §4\'s table', () => {
  const imperial = (q: Quantity, region: string | null = 'US') => measureFor(q, 'imperial', region);
  assert.deepEqual([imperial('temperature').unit, imperial('temperature').step], ['F', 1]);
  assert.deepEqual([imperial('eggTemp').unit, imperial('eggTemp').step], ['F', 1]);
  assert.deepEqual([imperial('boilingPoint').unit, imperial('boilingPoint').step], ['F', 0.1]);
  assert.deepEqual([imperial('mass').unit, imperial('mass').step], ['oz', 0.1]);
  assert.deepEqual([imperial('girth').unit, imperial('girth').step], ['in', 0.1]);
  assert.deepEqual([imperial('width').unit, imperial('width').step], ['in', 0.02]);
  assert.deepEqual([imperial('altitude').unit, imperial('altitude').step], ['ft', 100]);
  assert.deepEqual([imperial('water').unit, imperial('water').step], ['qt', 0.25]);
  assert.deepEqual([imperial('water', 'GB').unit, imperial('water', null).unit], ['pt', 'pt']);
  assert.equal(measureFor('water', 'imperial', 'us').unit, 'qt', 'the region is not case-sensitive');
  assert.equal(measureFor('water', 'metric', 'US').unit, 'L', 'metric is litres everywhere');
});

test('2b. the decimals shown are the decimals of the step', () => {
  for (const m of everyMeasure()) {
    const places = String(m.step).split('.')[1]?.length ?? 0;
    assert.equal(m.decimals, places, `${m.quantity} in ${m.unit}`);
  }
});

test('2c. an input\'s bounds are on its grid, inside the model\'s limits, and as wide as they can be', () => {
  for (const m of everyMeasure()) {
    if (m.limit === null) {
      assert.equal(m.bounds, null, `${m.quantity} is a readout`);
      continue;
    }
    const b = m.bounds;
    assert.ok(b !== null);
    for (const x of [b.lo, b.hi]) {
      assert.equal(x, Math.round(x / m.step) * m.stepNum / m.stepDen, `${m.quantity} ${m.unit}: ${x} on the grid`);
      const si = toSI(m.unit, x);
      assert.ok(si >= m.limit.lo - 1e-9 && si <= m.limit.hi + 1e-9, `${m.quantity} ${m.unit}: ${x} inside`);
    }
    // One step further out is outside the limit: the rounding went inward, not further.
    assert.ok(toSI(m.unit, b.lo - m.step) < m.limit.lo, `${m.quantity} ${m.unit}: lo is the lowest`);
    assert.ok(toSI(m.unit, b.hi + m.step) > m.limit.hi, `${m.quantity} ${m.unit}: hi is the highest`);
  }
  const oz = measureFor('mass', 'imperial', 'US');
  assert.deepEqual(oz.bounds, { lo: 0.9, hi: 4.2 });
  assert.deepEqual(measureFor('eggTemp', 'imperial', 'US').bounds, { lo: 29, hi: 104 });
  assert.deepEqual(measureFor('altitude', 'imperial', 'US').bounds, { lo: -1300, hi: 16400 });
  assert.deepEqual(measureFor('water', 'metric', 'US').bounds, LIMITS.waterLitres);
});

// --------------------------------------------------------------------------
// 3. The round trip
// --------------------------------------------------------------------------

test('3a. a cook who types 2.4 oz sees 2.4 oz again', () => {
  const oz = measureFor('mass', 'imperial', 'US');
  const stored = parse(oz, 2.4) as number;
  assert.ok(Math.abs(stored - 2.4 * OUNCE_G) < 1e-9);
  assert.equal(displayText(oz, stored), '2.4');
  assert.equal(rendered(oz, stored), '2.4 oz');
});

test('3b. every value every input can hold comes back as typed', () => {
  let checked = 0;
  for (const m of everyMeasure()) {
    for (const typed of grid(m)) {
      const si = parse(m, typed);
      assert.ok(si !== null && m.limit !== null);
      assert.ok(si >= m.limit.lo && si <= m.limit.hi, `${m.quantity} ${m.unit} ${typed}: clamped`);
      assert.equal(display(m, si), typed, `${m.quantity} ${m.unit}: typed ${typed}`);
      assert.equal(displayText(m, si), typed.toFixed(m.decimals));
      checked += 1;
    }
  }
  assert.ok(checked > 1000, `${checked} values`);
});

test('3c. and through the egg: mass and girth come back through the one diameter they are stored as', () => {
  // The web stores a measured egg as its minor diameter and rebuilds all three
  // boxes from it after a reload. Each box must still say what was typed.
  for (const system of UNIT_SYSTEMS) {
    const mass = measureFor('mass', system, null);
    for (const typed of grid(mass)) {
      const minor_mm = eggFromMass((parse(mass, typed) as number) / 1000).minorDiameter_m * 1000;
      if (minor_mm < LIMITS.minor_mm.lo || minor_mm > LIMITS.minor_mm.hi) continue;
      const back = eggFromMinorDiameter(minor_mm / 1000).mass_kg * 1000;
      assert.equal(displayText(mass, back), typed.toFixed(mass.decimals), `${system} mass ${typed}`);
    }
    const girth = measureFor('girth', system, null);
    for (const typed of grid(girth)) {
      const minor_mm = (parse(girth, typed) as number) / Math.PI;
      if (minor_mm < LIMITS.minor_mm.lo || minor_mm > LIMITS.minor_mm.hi) continue;
      assert.equal(displayText(girth, Math.PI * minor_mm), typed.toFixed(girth.decimals), `${system} girth ${typed}`);
    }
  }
});

test('3d. a stored value at a limit shows as the input\'s bound, never a step outside it', () => {
  for (const m of everyMeasure()) {
    if (m.limit === null || m.bounds === null) continue;
    assert.equal(display(m, m.limit.lo), m.bounds.lo, `${m.quantity} ${m.unit} floor`);
    assert.equal(display(m, m.limit.hi), m.bounds.hi, `${m.quantity} ${m.unit} ceiling`);
    assert.equal(display(m, m.limit.lo - 1000), m.bounds.lo);
    assert.equal(display(m, m.limit.hi + 1000), m.bounds.hi);
  }
  // 25 g is 0.88 oz; the input's floor is 0.9, and that is what it shows.
  assert.equal(displayText(measureFor('mass', 'imperial', 'US'), 25), '0.9');
});

test('3e. typed past a bound is clamped in SI, and nothing typed is no reading', () => {
  const f = measureFor('eggTemp', 'imperial', 'US');
  assert.equal(parse(f, 500), LIMITS.eggTemp_C.hi);
  assert.equal(parse(f, -500), LIMITS.eggTemp_C.lo);
  assert.equal(parse(f, Number.NaN), null);
  assert.equal(parse(f, Number.POSITIVE_INFINITY), null);
  // Off the grid is the cook's business: the model cooks what was typed.
  const oz = measureFor('mass', 'imperial', 'US');
  assert.equal(parse(oz, 2.43), 2.43 * OUNCE_G);
  assert.equal(displayText(oz, 2.43 * OUNCE_G), '2.4');
});

test('3f. switching systems moves nothing: the value is stored, not the text', () => {
  const litres = 2;
  const metric = measureFor('water', 'metric', 'US');
  const imperial = measureFor('water', 'imperial', 'US');
  assert.equal(displayText(metric, litres), '2.00');
  assert.equal(displayText(imperial, litres), '2.00'); // 2.11 qt, to the quarter
  assert.equal(displayText(metric, litres), '2.00', 'and back again, still 2 L');
});

test('3g. readouts: every temperature carries its unit', () => {
  const c = measureFor('temperature', 'metric', null);
  const f = measureFor('temperature', 'imperial', null);
  assert.equal(rendered(c, 4), '4 °C');
  assert.equal(rendered(f, 4), '39 °F');
  assert.equal(rendered(f, 20), '68 °F');
  assert.equal(rendered(f, 58), '136 °F');
  assert.equal(rendered(measureFor('boilingPoint', 'metric', null), 100), '100.0 °C');
  assert.equal(rendered(measureFor('boilingPoint', 'imperial', null), 94.9), '202.8 °F');
  // Halves go up on both platforms, negative ones too.
  assert.equal(displayText(c, -0.5), '0');
  assert.equal(displayText(c, -1.5), '-1');
  assert.equal(displayText(c, -0.4), '0', 'never "-0"');
});

// --------------------------------------------------------------------------
// 4. The setting
// --------------------------------------------------------------------------

test('4a. only the US starts in Imperial on the web', () => {
  assert.equal(regionalUnits({ region: 'US' }), 'imperial');
  assert.equal(regionalUnits({ region: 'us' }), 'imperial');
  for (const region of ['GB', 'AU', 'CA', 'CZ', 'LR', '', null]) {
    assert.equal(regionalUnits({ region: region }), 'metric', String(region));
  }
});

test('4b. on iOS the temperature preference wins, then the measurement system', () => {
  assert.equal(regionalUnits({ region: 'US', measurementSystem: 'us', temperature: 'celsius' }), 'metric');
  assert.equal(regionalUnits({ region: 'AU', measurementSystem: 'metric', temperature: 'fahrenheit' }), 'imperial');
  assert.equal(regionalUnits({ region: 'GB', measurementSystem: 'uk' }), 'metric');
  assert.equal(regionalUnits({ region: 'GB', measurementSystem: 'us' }), 'imperial');
  assert.equal(regionalUnits({ region: 'US', measurementSystem: 'metric' }), 'metric');
});

test('4c. a choice is stored as a choice, and only a change of system is a flip', () => {
  assert.deepEqual(chooseUnits(null, 'metric', 'imperial'), { chosen: 'imperial', flip: 'metricToImperial' });
  assert.deepEqual(chooseUnits('imperial', 'metric', 'metric'), { chosen: 'metric', flip: 'imperialToMetric' });
  // Choosing what is already on screen is still a choice, and not a flip.
  assert.deepEqual(chooseUnits(null, 'imperial', 'imperial'), { chosen: 'imperial', flip: null });
  // A stored choice outlives the default changing under it.
  assert.equal(effectiveUnits('metric', 'imperial'), 'metric');
  assert.equal(effectiveUnits(null, 'imperial'), 'imperial');
  for (const raw of ['Imperial', 'kelvin', '', 0, true, null, undefined]) {
    assert.equal(readChosenUnits(raw), null, String(raw));
  }
  assert.equal(readChosenUnits('imperial'), 'imperial');
});

// --------------------------------------------------------------------------
// 5. Size labels and the record
// --------------------------------------------------------------------------

function labelOf(table: typeof SIZE_CLASSES, i: number, system: UnitSystem): string {
  const label = sizeClassLabel(table[i], system);
  return render(EN, label.key, { mass: render(EN, label.mass.key, { value: label.mass.value }) });
}

test('5a. a size class shows its own mass in either system, and keeps its region\'s name', () => {
  assert.equal(labelOf(SIZE_CLASSES, 2, 'metric'), 'Large — 68 g');
  assert.equal(labelOf(SIZE_CLASSES, 2, 'imperial'), 'Large — 2.4 oz');
  assert.equal(labelOf(US_SIZE_CLASSES, 2, 'metric'), 'Large — 60 g');
  assert.equal(labelOf(US_SIZE_CLASSES, 2, 'imperial'), 'Large — 2.1 oz');
  assert.equal(labelOf(SIZE_CLASSES, 1, 'imperial'), 'Medium — 2.0 oz', 'the tenth is kept');
});

test('5b. the record says which system the cook was reading, and stays SI', () => {
  const cooked: Cooked = {
    egg: eggFromMass(0.068), massFrom: 'class', sizeTable: 'us', eggFrom: 'fridge',
    boilRemembered: false, units: 'imperial',
    setup: {
      startMode: 'hot', afterBoil: 'hold', eggStart_C: 4, ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, cooling: 'ice', waterLitres: 2, eggCount: 2,
    },
  };
  const m = advance(startHot(1_750_000_000_000, 400, 'ice', 0.4), 1_750_000_500_000).machine;
  const r = eggRecordFor(cooked, m, 0);
  assert.equal(r.units, 'imperial');
  assert.equal(r.egg.mass_g, 68);
  assert.equal(r.setup.eggStart_C, 4);
  assert.notEqual(parseRecord(r), null);
});
