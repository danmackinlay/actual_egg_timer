/**
 * Egg geometry: the user measures the minor (equatorial) diameter with a
 * ruler; the model needs an equivalent-sphere radius and a mass.
 */

import { EGG_VOLUME_COEFF, EGG_LENGTH_RATIO, RHO_EGG } from './constants.js';

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
  const radius = Math.cbrt(3.0 * volume / (4.0 * Math.PI));
  return {
    radius_m: radius,
    minorDiameter_m: minorDiameter_m,
    mass_kg: RHO_EGG * volume,
    volume_m3: volume,
  };
}

/** Build an Egg from mass, kg - kitchen scales beat ruler-measuring an ovoid. */
export function eggFromMass(mass_kg: number): Egg {
  const volume = mass_kg / RHO_EGG;
  const radius = Math.cbrt(3.0 * volume / (4.0 * Math.PI));
  const b = Math.cbrt(volume / (EGG_VOLUME_COEFF * EGG_LENGTH_RATIO));
  return {
    radius_m: radius,
    minorDiameter_m: b,
    mass_kg: mass_kg,
    volume_m3: volume,
  };
}

/** Characteristic diffusion time tau = R^2/alpha, s. Only this group affects
 *  the answer, which is why radius and diffusivity cannot be fitted separately.
 *  Scales as mass^(2/3) - the exponent in Williams' formula. */
export function diffusionTime(egg: Egg, alpha_m2s: number): number {
  return egg.radius_m * egg.radius_m / alpha_m2s;
}

/** Egg size classes. Labelled by grams deliberately: EU/UK "Large" (63-73 g)
 *  is a US "Extra Large", and a US "Large" (57 g) is an EU "Medium". Using the
 *  names would systematically mis-time for one audience or the other. */
export interface SizeClass {
  label: string;
  mass_kg: number;
}

export const SIZE_CLASSES: SizeClass[] = [
  { label: 'Small — 48 g', mass_kg: 0.048 },
  { label: 'Medium — 58 g', mass_kg: 0.058 },
  { label: 'Large — 68 g', mass_kg: 0.068 },
  { label: 'Extra large — 76 g', mass_kg: 0.076 },
];
