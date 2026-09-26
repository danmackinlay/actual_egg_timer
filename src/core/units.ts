/**
 * Metric and Imperial: what a number looks like on screen, and what a typed
 * number means to the model.
 *
 * Core stays in SI (invariant 3: convert only at the UI boundary). What this
 * module owns is making both UIs convert IDENTICALLY, which they cannot do if
 * each has its own conversion factors, its own rounding and its own idea of
 * where an input's bounds are. Design: LANGUAGE.md §4.
 *
 * Three things live here:
 *
 *  - the conversions, one factor per unit;
 *  - for each quantity the UI shows or takes, in each system, the unit, the
 *    step and the number of decimals it is shown to;
 *  - the round trip, which is the part that is easy to get wrong.
 *
 * THE ROUND TRIP. A cook who types 2.4 oz must see 2.4 oz again - after a
 * reload, after the value has been clamped in grams, after it has been through
 * the mass-to-diameter geometry and back - and never 2.39. The rule is:
 *
 *  1. the model's value is stored in SI, clamped by `LIMITS` in SI;
 *  2. what is shown is that value converted, rounded to the step, and held
 *     inside the input's bounds, which are the SI limits converted and rounded
 *     INWARD to the step, so that every bound is a value the input accepts;
 *  3. a field is re-parsed only when the cook edits it, never because some
 *     other control moved. (That part is the apps' job.)
 *
 * For any value on the step grid inside the bounds, converting to SI moves it
 * by float noise at most, the clamp moves it by float noise at most (the bound
 * converted back sits inside the SI limit, by construction), and converting
 * back and rounding to the grid undoes both, because float noise is a
 * trillionth of a step and the rounding forgives half of one.
 * `fixtures/units.json` checks this for every grid value of every input, in
 * both languages.
 *
 * Grid values are computed as `n * num / den` from integers - 24 * 1 / 10 for
 * 2.4 - which is the double nearest the decimal, exactly what parsing "2.4"
 * gives. Rounding is `floor(x + 0.5)`, spelled out, because `Math.round` and
 * Swift's `rounded()` disagree about negative halves.
 *
 * Pure, like the rest of `src/core/`: no storage, no locale lookups. The apps
 * ask the platform for the region and hand it in.
 */

import { LIMITS, Limit, clamp } from './policy.js';
import { SizeClass } from './geometry.js';
import { Fixed } from './format.js';

/** The one setting. The record's `Units` is the same pair. */
export type UnitSystem = 'metric' | 'imperial';

export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];

/* ------------------------------------------------------------ the units */

/** Every unit either app can show. Water is the only quantity whose Imperial
 *  unit depends on the region: US quarts in the US, imperial pints elsewhere. */
export type UnitId = 'C' | 'F' | 'g' | 'oz' | 'mm' | 'in' | 'm' | 'ft' | 'L' | 'qt' | 'pt';

/** Exact by definition, all of them: the international avoirdupois ounce,
 *  inch and foot of 1959, the US liquid quart, and the imperial pint of the
 *  1985 Weights and Measures Act. */
export const OUNCE_G = 28.349523125;
export const INCH_MM = 25.4;
export const FOOT_M = 0.3048;
export const US_QUART_L = 0.946352946;
export const IMPERIAL_PINT_L = 0.56826125;

/** A value in SI (C, g, mm, m, L) as the given unit. */
export function fromSI(unit: UnitId, si: number): number {
  switch (unit) {
    case 'F': return si * 1.8 + 32;
    case 'oz': return si / OUNCE_G;
    case 'in': return si / INCH_MM;
    case 'ft': return si / FOOT_M;
    case 'qt': return si / US_QUART_L;
    case 'pt': return si / IMPERIAL_PINT_L;
    default: return si;
  }
}

/** A value in the given unit, as SI. */
export function toSI(unit: UnitId, value: number): number {
  switch (unit) {
    case 'F': return (value - 32) / 1.8;
    case 'oz': return value * OUNCE_G;
    case 'in': return value * INCH_MM;
    case 'ft': return value * FOOT_M;
    case 'qt': return value * US_QUART_L;
    case 'pt': return value * IMPERIAL_PINT_L;
    default: return value;
  }
}

/** The catalogue's bare symbol, for the label beside an input, and its
 *  "value and unit" template, for everything else. */
const UNIT_KEYS: Record<UnitId, { unit: string; format: string }> = {
  C: { unit: 'unit.celsius', format: 'format.celsius' },
  F: { unit: 'unit.fahrenheit', format: 'format.fahrenheit' },
  g: { unit: 'unit.grams', format: 'format.grams' },
  oz: { unit: 'unit.ounces', format: 'format.ounces' },
  mm: { unit: 'unit.millimetres', format: 'format.millimetres' },
  in: { unit: 'unit.inches', format: 'format.inches' },
  m: { unit: 'unit.metres', format: 'format.metres' },
  ft: { unit: 'unit.feet', format: 'format.feet' },
  L: { unit: 'unit.litres', format: 'format.litres' },
  qt: { unit: 'unit.quarts', format: 'format.quarts' },
  pt: { unit: 'unit.pints', format: 'format.pints' },
};

/* ------------------------------------------------------- the quantities */

/**
 * Every number with a unit that either app shows or takes.
 *
 *  - `temperature`   a readout: peak yolk, the bath, the presets, a hint. 1 degree.
 *  - `eggTemp`       the typed egg temperature, the one temperature input.
 *  - `boilingPoint`  the water's boiling point, to a tenth of a degree.
 *  - `mass`, `girth`, `width`   the egg, weighed or measured.
 *  - `altitude`, `water`        the kitchen and the pan.
 */
export type Quantity =
  | 'temperature' | 'eggTemp' | 'boilingPoint' | 'mass' | 'girth' | 'width' | 'altitude' | 'water';

export const QUANTITIES: readonly Quantity[] = [
  'temperature', 'eggTemp', 'boilingPoint', 'mass', 'girth', 'width', 'altitude', 'water',
];

/** A step, as a ratio of integers: 1/10 for 0.1, 1/50 for 0.02, 100/1. */
interface Step { num: number; den: number; decimals: number }

interface QuantitySpec {
  /** The SI limit it is clamped to, or null for a readout nobody types. */
  limit: Limit | null;
  metric: { unit: UnitId } & Step;
  /** `unit` is ignored for water, which asks the region. */
  imperial: { unit: UnitId } & Step;
}

/**
 * LANGUAGE.md §4's table, which is the spec for Imperial. The metric steps are
 * what the web inputs already offered, rounded to what they already showed, so
 * a metric cook sees nothing move: 1 g, 1 mm round the girth, 0.5 mm across,
 * 50 m, 0.25 L. The iOS weight slider moved in half grams and the altitude
 * stepper in 100 m; both now take the table.
 */
const SPECS: Record<Quantity, QuantitySpec> = {
  temperature: {
    limit: null,
    metric: { unit: 'C', num: 1, den: 1, decimals: 0 },
    imperial: { unit: 'F', num: 1, den: 1, decimals: 0 },
  },
  eggTemp: {
    limit: LIMITS.eggTemp_C,
    metric: { unit: 'C', num: 1, den: 1, decimals: 0 },
    imperial: { unit: 'F', num: 1, den: 1, decimals: 0 },
  },
  boilingPoint: {
    limit: null,
    metric: { unit: 'C', num: 1, den: 10, decimals: 1 },
    imperial: { unit: 'F', num: 1, den: 10, decimals: 1 },
  },
  mass: {
    limit: LIMITS.mass_g,
    metric: { unit: 'g', num: 1, den: 1, decimals: 0 },
    imperial: { unit: 'oz', num: 1, den: 10, decimals: 1 },
  },
  girth: {
    limit: LIMITS.girth_mm,
    metric: { unit: 'mm', num: 1, den: 1, decimals: 0 },
    imperial: { unit: 'in', num: 1, den: 10, decimals: 1 },
  },
  width: {
    limit: LIMITS.minor_mm,
    metric: { unit: 'mm', num: 1, den: 2, decimals: 1 },
    imperial: { unit: 'in', num: 1, den: 50, decimals: 2 },
  },
  altitude: {
    limit: LIMITS.altitude_m,
    metric: { unit: 'm', num: 50, den: 1, decimals: 0 },
    imperial: { unit: 'ft', num: 100, den: 1, decimals: 0 },
  },
  water: {
    limit: LIMITS.waterLitres,
    metric: { unit: 'L', num: 1, den: 4, decimals: 2 },
    imperial: { unit: 'qt', num: 1, den: 4, decimals: 2 },
  },
};

/** One quantity in one unit: everything an input or a readout needs. */
export interface Measure {
  quantity: Quantity;
  unit: UnitId;
  /** The input's step, as a number: 0.1, 0.02, 100. */
  step: number;
  stepNum: number;
  stepDen: number;
  /** Digits after the point on screen. */
  decimals: number;
  /** The catalogue key of the bare symbol, for the label beside an input. */
  unitKey: string;
  /** The catalogue key of "{value} unit". */
  formatKey: string;
  /** The SI limit, or null for a readout. */
  limit: Limit | null;
  /** The limit in this unit, rounded INWARD to the step, so that both ends
   *  are values the input accepts and the model allows. Null for a readout. */
  bounds: Limit | null;
}

/** The unit water is measured in under Imperial: the US quart in the US, the
 *  imperial pint everywhere else. Region only, as for the size classes. */
export function imperialWaterUnit(region: string | null | undefined): UnitId {
  return typeof region === 'string' && region.toUpperCase() === 'US' ? 'qt' : 'pt';
}

export function measureFor(
  quantity: Quantity, system: UnitSystem, region: string | null | undefined,
): Measure {
  const spec = SPECS[quantity];
  const s = system === 'imperial' ? spec.imperial : spec.metric;
  const unit = system === 'imperial' && quantity === 'water' ? imperialWaterUnit(region) : s.unit;
  const m: Measure = {
    quantity: quantity,
    unit: unit,
    step: s.num / s.den,
    stepNum: s.num,
    stepDen: s.den,
    decimals: s.decimals,
    unitKey: UNIT_KEYS[unit].unit,
    formatKey: UNIT_KEYS[unit].format,
    limit: spec.limit,
    bounds: null,
  };
  if (spec.limit !== null) {
    // A trillionth of a step of slack, so that a limit that converts exactly
    // onto the grid (40 C is 104 F) is not pushed a whole step inward by the
    // last bit of a multiplication.
    const lo = Math.ceil(fromSI(unit, spec.limit.lo) * s.den / s.num - 1e-9);
    const hi = Math.floor(fromSI(unit, spec.limit.hi) * s.den / s.num + 1e-9);
    m.bounds = { lo: onGrid(m, lo), hi: onGrid(m, hi) };
  }
  return m;
}

/* ---------------------------------------------------------- the grid */

/** The n-th point of the step grid: n * num / den, which is the double
 *  nearest the decimal it stands for. Never -0, which prints as "-0". */
function onGrid(m: Measure, n: number): number {
  const v = n * m.stepNum / m.stepDen;
  return v === 0 ? 0 : v;
}

/** The nearest grid point to a value in the measure's unit. Halves go up,
 *  on both platforms, by writing the rounding out. */
export function snap(m: Measure, value: number): number {
  return onGrid(m, Math.floor(value * m.stepDen / m.stepNum + 0.5));
}

/* ------------------------------------------------- display and parse */

/**
 * What the screen shows for a value stored in SI: converted, rounded to the
 * step, and kept inside the input's bounds. A value clamped to the SI floor
 * can round to a point just outside the inward bounds, and the input would
 * then call its own contents invalid; the bounds win.
 *
 * A number that is not finite is not a reading: it shows as the floor, like
 * `clamp` treats it, or as zero for a readout.
 */
export function display(m: Measure, si: number): number {
  if (!Number.isFinite(si)) return m.bounds === null ? 0 : m.bounds.lo;
  const v = snap(m, fromSI(m.unit, si));
  return m.bounds === null ? v : clamp(v, m.bounds);
}

/** `display`, as plain decimal digits with a point and no grouping: what a
 *  web `<input type="number">` holds, which is machine text in every locale.
 *  What the cook READS goes through `quantityText` and the formatting locale
 *  instead ("2,4 oz" in Czech). */
export function displayText(m: Measure, si: number): string {
  return display(m, si).toFixed(m.decimals);
}

/** What a typed number means, in SI: converted, then clamped by `LIMITS` in
 *  SI. Null when there is no number, so the app can keep what it had - a
 *  blank field is "not yet typed", not zero. Not rounded to the step: an
 *  off-grid number is the cook's to type, and the model cooks what was typed. */
export function parse(m: Measure, typed: number): number | null {
  if (!Number.isFinite(typed)) return null;
  const si = toSI(m.unit, typed);
  return m.limit === null ? si : clamp(si, m.limit);
}

/** A number and its unit, as the catalogue key and the value to put in it.
 *  The app renders `t(key, { value })`: core does not speak English, and the
 *  renderer writes the value in the formatting locale, to the measure's
 *  decimals - "2.4 oz", "2,4 oz", "1,500 m". */
export interface QuantityText {
  key: string;
  value: Fixed;
}

export function quantityText(m: Measure, si: number): QuantityText {
  return { key: m.formatKey, value: { value: display(m, si), decimals: m.decimals } };
}

/** What the size menu says for a class: its name, which is its catalogue key,
 *  and its mass in the cook's units - "Large — 68 g", "Large — 2.1 oz". The
 *  classes follow the region and not the units (an American carton is an
 *  American carton in grams too), so only the number changes. The label rounds;
 *  the model cooks the mass to a tenth of a gram. */
export interface SizeLabel {
  key: string;
  mass: QuantityText;
}

export function sizeClassLabel(c: SizeClass, system: UnitSystem): SizeLabel {
  return { key: c.key, mass: quantityText(measureFor('mass', system, null), c.mass_kg * 1000) };
}

/* ------------------------------------------------------------ the setting */

/** What the platform says about the cook's preferences. The web knows only a
 *  region; iOS also knows the measurement system and, since iOS 16, the
 *  temperature unit the cook picked in Settings. */
export interface PlatformUnits {
  region: string | null;
  /** Foundation's `Locale.MeasurementSystem`: metric, us or uk. */
  measurementSystem?: 'metric' | 'us' | 'uk' | null;
  /** The system temperature preference, where there is one. */
  temperature?: 'celsius' | 'fahrenheit' | null;
}

/**
 * The system a cook starts in, before they choose.
 *
 * The temperature preference wins when the platform has one, because it is
 * the one a cook set on purpose and temperature is most of what this app
 * shows: an Australian who asked their phone for Fahrenheit gets Imperial, and
 * an American who asked for Celsius gets metric. Then the measurement system,
 * where only `us` is Imperial - the UK system is miles and pints on the road
 * and grams and Celsius in the kitchen. Then the region, where only `US` is.
 */
export function regionalUnits(p: PlatformUnits): UnitSystem {
  if (p.temperature === 'fahrenheit') return 'imperial';
  if (p.temperature === 'celsius') return 'metric';
  if (p.measurementSystem !== undefined && p.measurementSystem !== null) {
    return p.measurementSystem === 'us' ? 'imperial' : 'metric';
  }
  return typeof p.region === 'string' && p.region.toUpperCase() === 'US' ? 'imperial' : 'metric';
}

/** The system in use: the cook's choice if they made one, the region's
 *  otherwise. The two are stored apart, so that a later change to the default
 *  cannot overwrite a choice, and so that a choice can be told from a default. */
export function effectiveUnits(chosen: UnitSystem | null, regional: UnitSystem): UnitSystem {
  return chosen ?? regional;
}

/** An explicit change of system, in the direction it went. F6 listens for
 *  `metricToImperial`: it is the switch into the English of 1750
 *  (LANGUAGE.md §6), and only a cook's own choice may throw it. */
export type UnitsFlip = 'metricToImperial' | 'imperialToMetric';

export interface UnitsChoice {
  /** What to store: the cook chose this. Stored even when it equals the
   *  region's default, because it is still a choice. */
  chosen: UnitSystem;
  /** The flip it makes, or null when the system on screen does not change. */
  flip: UnitsFlip | null;
}

/** The cook picks a system. */
export function chooseUnits(
  chosen: UnitSystem | null, regional: UnitSystem, next: UnitSystem,
): UnitsChoice {
  const before = effectiveUnits(chosen, regional);
  const flip: UnitsFlip | null = before === next ? null
    : next === 'imperial' ? 'metricToImperial' : 'imperialToMetric';
  return { chosen: next, flip: flip };
}

/** A stored choice, or null for none: anything else in storage is not one. */
export function readChosenUnits(raw: unknown): UnitSystem | null {
  return raw === 'metric' || raw === 'imperial' ? raw : null;
}
