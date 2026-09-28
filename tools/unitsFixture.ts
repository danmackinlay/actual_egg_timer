/**
 * `fixtures/units.json`: Metric and Imperial, as `src/core/units.ts` answers.
 *
 * Its own module, called from `tools/fixtures.ts`, because it is a whole
 * contract of its own and that file is already long. Five things are pinned:
 *
 *  - every conversion, both ways, at points that matter (freezing, boiling,
 *    the limits, the defaults);
 *  - every measure - each quantity in each system, in and out of the US - with
 *    its unit, step, decimals, catalogue keys and inward-rounded bounds;
 *  - what is displayed for a stored SI value: on the grid, between grid
 *    points, on exact halves, at and past every limit, negative, and not a
 *    number at all;
 *  - THE ROUND TRIP, for every grid value of every input: typed, stored in
 *    SI, displayed again, and the display must be what was typed. The
 *    generator refuses to write a fixture in which it is not;
 *  - the regional default and the explicit choice, including the flip F6
 *    listens for, and the size labels in both systems, rendered in English.
 */

import { Catalogue, render } from '../src/core/copy.js';
import { SIZE_CLASSES, US_SIZE_CLASSES } from '../src/core/geometry.js';
import {
  Measure, PlatformUnits, QUANTITIES, UNIT_SYSTEMS, UnitId, UnitSystem, chooseUnits, display,
  displayText, fromSI, measureFor, parse, quantityText, readChosenUnits, regionalUnits,
  sizeClassLabel, snap, toSI,
} from '../src/core/units.js';

const UNITS: UnitId[] = ['C', 'F', 'g', 'oz', 'mm', 'in', 'm', 'ft', 'L', 'qt', 'pt'];

/** SI points per unit: the edges of every limit, the defaults, and a few
 *  values a kitchen actually meets. */
const SI_POINTS: Record<UnitId, number[]> = {
  C: [-40, -2, 0, 4, 20, 37, 40, 58, 60, 63, 65, 82.4, 100, 101.3],
  F: [-40, -2, 0, 4, 20, 37, 40, 58, 60, 63, 65, 82.4, 100, 101.3],
  g: [25, 28.349523125, 46.1, 48, 60.2, 68, 74, 90],
  oz: [25, 28.349523125, 46.1, 48, 60.2, 68, 74, 90],
  mm: [30, 43.5, 44, 60, 90, 137, 200],
  in: [30, 43.5, 44, 60, 90, 137, 200],
  m: [-400, 0, 304.8, 1609, 5000],
  ft: [-400, 0, 304.8, 1609, 5000],
  L: [0.25, 0.56826125, 0.946352946, 1.8, 2, 12],
  qt: [0.25, 0.56826125, 0.946352946, 1.8, 2, 12],
  pt: [0.25, 0.56826125, 0.946352946, 1.8, 2, 12],
};

const REGIONS: (string | null)[] = ['US', null];

interface MeasureCase { system: UnitSystem; region: string | null; m: Measure }

/** Only the quantities the iOS app has: it weighs eggs and never measures a
 *  girth or a width, and its core has neither (D4). The web's are tested in
 *  test/units.test.ts. */
const SWIFT_QUANTITIES = QUANTITIES.filter((q) => q !== 'girth' && q !== 'width');

function measures(): MeasureCase[] {
  const out: MeasureCase[] = [];
  for (const q of SWIFT_QUANTITIES) {
    // The region reaches only water; every other quantity is asked once.
    const regions = q === 'water' ? REGIONS : [null];
    for (const system of UNIT_SYSTEMS) {
      for (const region of regions) out.push({ system, region, m: measureFor(q, system, region) });
    }
  }
  return out;
}

/** Stored values to display, for one measure: its grid near the default, the
 *  points between and exactly halfway between grid points (in its own unit),
 *  its limits and beyond, and the values that are not numbers. */
function displayPoints(m: Measure): number[] {
  const points = new Set<number>(SI_POINTS[m.unit]);
  const step = m.step;
  const centre = m.bounds === null ? fromSI(m.unit, SI_POINTS[m.unit][3]) : (m.bounds.lo + m.bounds.hi) / 2;
  const base = snap(m, centre);
  for (const k of [-1, 0, 0.25, 0.5, 0.75, 1, 1.5]) points.add(toSI(m.unit, base + k * step));
  if (m.limit !== null) {
    for (const x of [m.limit.lo, m.limit.hi]) {
      points.add(x);
      points.add(x - 1e-9);
      points.add(x + 1e-9);
    }
    points.add(m.limit.lo - 1000);
    points.add(m.limit.hi + 1000);
  }
  return [...points];
}

function roundTrip(m: Measure): { typed: number; si: number; text: string }[] {
  if (m.bounds === null) return [];
  const rows: { typed: number; si: number; text: string }[] = [];
  const lo = Math.round(m.bounds.lo / m.step);
  const hi = Math.round(m.bounds.hi / m.step);
  for (let n = lo; n <= hi; n++) {
    const typed = n * m.stepNum / m.stepDen;
    const si = parse(m, typed) as number;
    const text = displayText(m, si);
    if (text !== typed.toFixed(m.decimals)) {
      throw new Error(`${m.quantity} in ${m.unit}: typed ${typed}, shown ${text}`);
    }
    rows.push({ typed, si, text });
  }
  return rows;
}

/** Typed values that are NOT on the grid or inside the bounds: below, above,
 *  a third of a step off, and a number the field could never hold. */
function typedEdges(m: Measure): { typed: number | null; si: number | null; text: string | null }[] {
  const typed: number[] = m.bounds === null
    ? [0, 1.23456]
    : [
      m.bounds.lo - m.step, m.bounds.hi + m.step, m.bounds.lo - 1000 * m.step,
      m.bounds.lo + m.step / 3, m.bounds.hi - m.step / 3,
    ];
  const rows: { typed: number | null; si: number | null; text: string | null }[] = typed.map((t) => {
    const si = parse(m, t);
    return { typed: t, si, text: si === null ? null : displayText(m, si) };
  });
  // Not a number: JSON cannot carry NaN, so it is written as null.
  rows.push({ typed: null, si: parse(m, Number.NaN), text: null });
  return rows;
}

const PLATFORMS: PlatformUnits[] = [
  { region: 'US' }, { region: 'us' }, { region: 'GB' }, { region: 'AU' }, { region: 'CZ' },
  { region: 'LR' }, { region: '' }, { region: null },
  { region: 'US', measurementSystem: 'us' },
  { region: 'US', measurementSystem: 'metric' },
  { region: 'GB', measurementSystem: 'uk' },
  { region: 'AU', measurementSystem: 'metric' },
  { region: 'US', measurementSystem: 'us', temperature: 'fahrenheit' },
  { region: 'US', measurementSystem: 'us', temperature: 'celsius' },
  { region: 'AU', measurementSystem: 'metric', temperature: 'fahrenheit' },
  { region: 'GB', measurementSystem: 'uk', temperature: 'celsius' },
  { region: 'GB', measurementSystem: null, temperature: null },
];

export function unitsFixture(english: Catalogue): Record<string, unknown> {
  const all = measures();
  return {
    $comment: 'Generated by tools/unitsFixture.ts from src/core/units.ts. Do not hand-edit.',
    generator: 'npm run fixtures',
    conversions: UNITS.map((unit) => ({
      unit: unit,
      cases: SI_POINTS[unit].map((si) => {
        const value = fromSI(unit, si);
        return { si: si, value: value, back: toSI(unit, value) };
      }),
    })),
    measures: all.map(({ system, region, m }) => ({
      quantity: m.quantity,
      system: system,
      region: region,
      unit: m.unit,
      step: m.step,
      stepNum: m.stepNum,
      stepDen: m.stepDen,
      decimals: m.decimals,
      unitKey: m.unitKey,
      formatKey: m.formatKey,
      limit: m.limit,
      bounds: m.bounds,
      display: displayPoints(m).map((si) => {
        const q = quantityText(m, si);
        return {
          si: si,
          value: display(m, si),
          text: displayText(m, si),
          rendered: render(english, q.key, { value: q.value }),
        };
      }),
      notANumber: { value: display(m, Number.NaN), text: displayText(m, Number.NaN) },
      roundTrip: roundTrip(m),
      typed: typedEdges(m),
    })),
    regional: PLATFORMS.map((p) => ({
      region: p.region,
      measurementSystem: p.measurementSystem ?? null,
      temperature: p.temperature ?? null,
      units: regionalUnits(p),
    })),
    choose: [null, 'metric', 'imperial'].flatMap((chosen) => UNIT_SYSTEMS.flatMap((regional) => UNIT_SYSTEMS.map(
      (next) => {
        const c = chooseUnits(chosen as UnitSystem | null, regional, next);
        return { chosen: chosen, regional: regional, next: next, stored: c.chosen, flip: c.flip };
      },
    ))),
    stored: ['metric', 'imperial', 'Imperial', 'kelvin', '', 0, true, null].map((raw) => ({
      raw: raw, chosen: readChosenUnits(raw),
    })),
    sizeLabels: [['eu', SIZE_CLASSES], ['us', US_SIZE_CLASSES]].flatMap(([table, classes]) =>
      (classes as typeof SIZE_CLASSES).flatMap((c) => UNIT_SYSTEMS.map((system) => {
        const label = sizeClassLabel(c, system);
        return {
          table: table,
          key: c.key,
          system: system,
          mass: label.mass,
          text: render(english, label.key, { mass: render(english, label.mass.key, { value: label.mass.value }) }),
        };
      }))),
  };
}
