/**
 * Every tunable in the model, with its provenance.
 *
 * Sources could not be fetched directly (network egress restrictions during
 * development), so these values are re-derived and cross-validated rather than
 * transcribed. See README.md for the full derivation and the confidence notes.
 */

/** Number of eigenmodes retained in the sphere series.
 *  One-term truncation (as in Williams' closed form) under-predicts cook time
 *  by 8.4% at realistic Fourier numbers (Fo ~ 0.07). 40 terms is exact to
 *  machine precision here and costs nothing. */
export const MODE_COUNT = 40;

/** Thermal diffusivity of egg albumen at cooking temperature, m^2/s.
 *  THIS IS THE CALIBRATION PARAMETER. Only the group tau = R^2/alpha affects
 *  the answer, so radius and diffusivity are degenerate; we fix the geometry
 *  honestly and let alpha absorb the model error.
 *  Room-temperature literature values (~1.36e-7) are inconsistent with the
 *  reported alpha of 1.7e-7; water's conductivity rises ~13% by 100 C, which
 *  resolves it in favour of the higher value at cooking temperature. */
export const ALPHA_DEFAULT = 1.70e-7;

/** Relative standard deviation on ALPHA for the calibration prior.
 *  Chosen so tau has sd ~400 s at the reference egg radius. */
export const ALPHA_REL_SD = 0.119;

/** Yolk boundary as a fraction of egg radius. Yolk is ~33% of egg volume, so
 *  r/R = (1/3)^(1/3) = 0.693. Three independent routes agree:
 *  (a) 2*sinc(pi*0.693) = 0.754 ~ Williams' famous 0.76 coefficient,
 *  (b) inverting 2*sinc(pi*x) = 0.76 gives x = 0.691 (33.0% volume),
 *  (c) real composition data (31% yolk by mass) gives r_y/R = 0.693.
 *  NOTE: Williams' 0.76 is the first-eigenmode amplitude AT THIS RADIUS. It is
 *  not a "yolk-white ratio" (a common error) and not the yolk centre, whose
 *  coefficient would be exactly 2.0. */
export const YOLK_RADIUS_FRAC = 0.693;

/** Arrhenius sharpness for yolk gelation.
 *  z = ln(10)*R*T^2/Ea with Ea ~ 470 kJ/mol (Vega & Mercade-Prieto 2011)
 *  at T = 338 K gives z = 4.65 K: +4.7 C is 10x faster.
 *  WARNING: the standard food-engineering cook-value uses z = 33.1 K, which is
 *  7x too shallow for egg protein. Do not substitute it. */
export const Z_YOLK = 4.65;
export const TREF_YOLK_C = 63.0;

/** Same for egg white (ovalbumin), Ea ~ 460 kJ/mol at T = 353 K. */
export const Z_WHITE = 5.2;
export const TREF_WHITE_C = 80.0;

/** Effective surface heat transfer coefficient in water, W/m^2K.
 *  Natural convection on a sphere (~1100) in series with shell + membranes
 *  (~3200) gives ~820. Bi = h*R/k ~ 33, so the surface is nearly - but not
 *  exactly - clamped at the water temperature: pure Dirichlet under-predicts
 *  cook time by ~5%. Estimated, not measured. */
export const H_EFF = 850.0;

/** Thermal conductivity of egg contents, W/m K (albumen-dominated near the
 *  surface, at cooking temperature). Used only for the Biot number. */
export const K_EGG = 0.60;

/** Hob overshoot ratio r = P/(U*dT_boil). 1/r is the fraction of full burner
 *  power needed to hold a rolling boil; measured cooktop studies put that near
 *  1/3. r -> infinity is a linear ramp. */
export const RAMP_R = 3.0;

/** Lumped cooling time constant of an egg in still air, s.
 *  m*c/(h*A) with h ~ 15 W/m^2K. Internal equilibration takes ~270 s, so this
 *  is ~7x slower: a rested egg carries over almost adiabatically.
 *  THIS IS THE LEAST-VERIFIED CONSTANT IN THE MODEL - no published egg-centre
 *  measurements after removal were found. It carries a wide calibration prior. */
export const TAU_AIR = 2030.0;

/** Surface temperatures of the cooling media, C. */
export const T_ICE_BATH_C = 2.0;
export const T_COLD_TAP_C = 15.0;
export const T_ROOM_C = 20.0;

/** Water temperature recovery constant after cold eggs are added, s. */
export const TAU_DIP_RECOVERY = 60.0;

/** Specific heat capacities, J/kg K. */
export const C_WATER = 4186.0;
export const C_EGG = 3200.0;

/** Whole-egg density including shell, kg/m^3 (specific gravity 1.07-1.10). */
export const RHO_EGG = 1100.0;

/** Egg shape. Real hen eggs are ovoid: V = k_v * L * B^2 with k_v ~ 0.51
 *  (the ovoid taper removes ~2.5% from a true prolate spheroid's pi/6).
 *  Shape index 100*B/L ~ 74 means L/B ~ 1.35. */
export const EGG_VOLUME_COEFF = 0.51;
export const EGG_LENGTH_RATIO = 1.35;

/** Simulation timestep, s. The modal integrator is exact for piecewise-linear
 *  surface temperature, so this only needs to resolve the drive, not stability. */
export const DT_SIM = 0.5;

/** How long to keep integrating after the egg leaves the water, s.
 *  Carryover peaks 4-5 minutes in; 15 minutes captures it fully. */
export const CARRYOVER_WINDOW = 900.0;
