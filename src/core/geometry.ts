/**
 * Egg geometry: the user measures the minor (equatorial) diameter with a
 * ruler; the model needs an equivalent-sphere radius and a mass.
 */

import { EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, RHO_EGG } from './constants.js';
import { CopyRef } from './copy.js';

export interface Egg {
  /** Equal-volume sphere radius, m. This is what the conduction model uses. */
  radius_m: number;
  /** Minor (equatorial) diameter as measured, m. */
  minorDiameter_m: number;
  /** Whole-egg mass including shell, kg. */
  mass_kg: number;
  /** Egg volume, m^3. */
  volume_m3: number;
}

/** Volume of an ovoid egg from its minor diameter B, m^3.
 *  V = k_v * L * B^2 with L = B * EGG_LENGTH_RATIO, so V = k_v * ratio * B^3.
 *  k_v = 0.51 rather than pi/6 = 0.5236 because the ovoid taper removes ~2.5%. */
export function eggVolumeFromMinorDiameter(minorDiameter_m: number): number {
  const b = minorDiameter_m;
  return EGG_VOLUME_COEFF * EGG_LENGTH_RATIO * b * b * b;
}

/** Build an Egg from the measured minor diameter, m.
 *  The resulting equal-volume radius works out to 0.5477 * B, i.e. about
 *  1.095 * (B/2) - the ovoid is longer than it is wide, so its equivalent
 *  sphere is slightly larger than the equatorial one. */
export function eggFromMinorDiameter(minorDiameter_m: number): Egg {
  const volume = eggVolumeFromMinorDiameter(minorDiameter_m);
  return eggFromVolume(volume, minorDiameter_m, RHO_EGG * volume);
}

/** Build an Egg from mass, kg - kitchen scales beat ruler-measuring an ovoid. */
export function eggFromMass(mass_kg: number): Egg {
  const volume = mass_kg / RHO_EGG;
  const b = Math.cbrt(volume / (EGG_VOLUME_COEFF * EGG_LENGTH_RATIO));
  return eggFromVolume(volume, b, mass_kg);
}

/** The equal-volume sphere is the one thing both constructors compute. */
function eggFromVolume(volume_m3: number, minorDiameter_m: number, mass_kg: number): Egg {
  return {
    radius_m: Math.cbrt(3.0 * volume_m3 / (4.0 * Math.PI)),
    minorDiameter_m: minorDiameter_m,
    mass_kg: mass_kg,
    volume_m3: volume_m3,
  };
}

/** Characteristic diffusion time tau = R^2/alpha, s. Only this group affects
 *  the answer, which is why radius and diffusivity cannot be fitted separately.
 *  Scales as mass^(2/3) - the exponent in Williams' formula. */
export function diffusionTime(egg: Egg, alpha_m2s: number): number {
  return egg.radius_m * egg.radius_m / alpha_m2s;
}

/** Egg size classes. Labelled by grams deliberately: EU/UK "Large" (63-73 g)
 *  is a US "Extra Large", and a US "Large" (about 60 g, the middle of its USDA range) is an EU "Medium". Using the
 *  names would systematically mis-time for one audience or the other.
 *
 *  There are two tables, and which one a cook sees is decided by region - see
 *  `sizeClassesFor`. Both tables put the same class at the same index for as
 *  far as the shorter one goes (Small, Medium, Large, Extra large), which is
 *  what lets a stored index keep its name when the table changes underneath it
 *  (`carrySizeIndex` in policy.ts).
 *
 *  The name is a catalogue key, one per class per table: an American Large and
 *  an EU Large are different eggs, and a language may want to say so. The
 *  grams on the label come from the mass - see `sizeClassLabel`. */
export interface SizeClass {
  key: string;
  mass_kg: number;
}

/** What the size menu says for a class: its name, and its mass to the gram.
 *  The label rounds; the model cooks the mass to a tenth. */
export function sizeClassLabel(c: SizeClass): CopyRef {
  return { key: c.key, args: { grams: Math.round(c.mass_kg * 1000) } };
}

/** EU Regulation 589/2008 Art. 4, at a representative mass inside each band. */
export const SIZE_CLASSES: SizeClass[] = [
  { key: 'size.eu.small', mass_kg: 0.048 },
  { key: 'size.eu.medium', mass_kg: 0.058 },
  { key: 'size.eu.large', mass_kg: 0.068 },
  { key: 'size.eu.extraLarge', mass_kg: 0.076 },
];

/** The classes printed on an American carton. USDA defines each by a MINIMUM
 *  net weight per dozen - Small 18 oz, Medium 21, Large 24, Extra large 27,
 *  Jumbo 30 - so a class runs from its own minimum up to the next class's, and
 *  the mass here is the midpoint of that run, per egg. The minimum would be the
 *  lightest egg the carton may legally hold, which is not the egg in it.
 *
 *  Jumbo has no upper bound, so its 74 g is a guess: the 70.9 g floor plus half
 *  the width of the class below it. Labels round to the gram; the model cooks
 *  the midpoint to a tenth. */
export const US_SIZE_CLASSES: SizeClass[] = [
  { key: 'size.us.small', mass_kg: 0.0461 },
  { key: 'size.us.medium', mass_kg: 0.0532 },
  { key: 'size.us.large', mass_kg: 0.0602 },
  { key: 'size.us.extraLarge', mass_kg: 0.0673 },
  { key: 'size.us.jumbo', mass_kg: 0.074 },
];

/** The size classes for a region: the American carton in region `US`, the EU
 *  classes everywhere else, including when the region is unknown.
 *
 *  Takes a region CODE - the `US` in `en-US`, or `Locale.Region.identifier` on
 *  iOS - rather than a locale, so that core stays free of I/O and the apps do
 *  the asking. Region only: an American who reads the app in Czech, or in
 *  metric, still buys American eggs. */
export function sizeClassesFor(region: string | null | undefined): SizeClass[] {
  return sizeTableFor(region) === 'us' ? US_SIZE_CLASSES : SIZE_CLASSES;
}

/** Which of the two tables that is, by name. A record of an egg cooked by size
 *  class carries it, because the same class is 68 g in one table and 60.2 g in
 *  the other, and the width of the class - the egg-level noise the fit reads -
 *  differs with it. */
export type SizeTable = 'eu' | 'us';

export function sizeTableFor(region: string | null | undefined): SizeTable {
  return typeof region === 'string' && region.toUpperCase() === 'US' ? 'us' : 'eu';
}
