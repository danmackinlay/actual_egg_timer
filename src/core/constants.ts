/**
 * Every tunable in the model, with its provenance.
 *
 * Values were first re-derived rather than transcribed, because the primary
 * literature was not retrieved during the initial build. It has since been
 * read at first hand: see references.bib, and README.md section 10 for what
 * each source actually says. Constants that changed as a result are marked
 * CHECKED AT SOURCE; ones still resting on an inference are marked INFERRED.
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
 *
 *  CHECKED AT SOURCE. Abbasnezhad et al. (2016) give albumen k = 0.0013*T +
 *  0.5125 with rho(T) and c_p = 3800, i.e. alpha rising 1.36e-7 (20 C) ->
 *  1.69e-7 (100 C). The temperature argument for preferring the higher value
 *  is therefore a measurement, not an inference. Independently, Buay et al.
 *  (2006) fitted a WHOLE EGG in boiling water and obtained alpha = 1.6e-7,
 *  bounded 1.5e-7 to 1.8e-7. 1.70e-7 sits inside that band, at the fast end -
 *  which is expected, since it also absorbs the Dirichlet and shape errors.
 *  Beware the spread on the yolk: Romanoff & Romanoff (1949), via Denys et al.
 *  (2004), imply alpha_yolk = 9.1e-8, against 1.22e-7 to 1.52e-7 elsewhere. */
export const ALPHA_DEFAULT = 1.70e-7;

/** Relative standard deviation on ALPHA for the calibration prior.
 *  Chosen so tau has sd ~400 s at the reference egg radius. */
export const ALPHA_REL_SD = 0.119;

/** Yolk boundary as a fraction of egg radius. Yolk is ~33% of egg volume, so
 *  r/R = (1/3)^(1/3) = 0.693. Four independent routes agree:
 *  (a) 2*sinc(pi*0.693) = 0.754 ~ Williams' famous 0.76 coefficient,
 *  (b) inverting 2*sinc(pi*x) = 0.76 gives x = 0.691 (33.0% volume),
 *  (c) real composition data (31% yolk by mass) gives r_y/R = 0.693,
 *  (d) CHECKED AT SOURCE: Abbasnezhad et al. (2016) mesh the yolk as a sphere
 *      of radius 1.6 cm inside a 6 x 4.5 cm egg - 17 cm^3, i.e. r_y/R ~ 0.68.
 *  NOTE: Williams' 0.76 is the first-eigenmode amplitude AT THIS RADIUS. It is
 *  not a "yolk-white ratio" (a common error, e.g. Omnicalculator) and not the
 *  yolk centre, whose coefficient would be exactly 2.0. Buay et al. (2006)
 *  confirm the reading explicitly: their eq. 11 carries the centre coefficient
 *  2, Williams' eq. 12 carries 0.76, and they state the difference is yolk
 *  CENTRE versus yolk BOUNDARY. */
export const YOLK_RADIUS_FRAC = 0.693;

/** Arrhenius sharpness for yolk gelation.
 *  z = ln(10)*R*T^2/Ea at T = 338 K: +4.65 C is 10x faster.
 *  CHECKED AT SOURCE. Vega & Mercade-Prieto (2011) fit Ea = 469 +/- 13 kJ/mol
 *  (95% CI) to isothermal yolk gelation times measured over 54-70 C, and
 *  483 +/- 37 kJ/mol to the viscosity-rise slope. 338 K is mid-range, not an
 *  extrapolation. The CI maps to z = 4.54-4.80 K, so 4.65 sits inside it.
 *  WARNING: the standard food-engineering cook-value uses z = 33.1 K, which is
 *  7x too shallow for egg protein. Do not substitute it. */
export const Z_YOLK = 4.65;
export const TREF_YOLK_C = 63.0;

/** Same for egg white (ovalbumin) at T = 353 K.
 *  CHECKED AT SOURCE, AND CORRECTED. Weijers et al. (2003) report Ea ~ 480
 *  kJ/mol (430-490 across techniques), not the 460 assumed while building
 *  this, so z falls from 5.2 to 4.97 K. No validation target moves: the white
 *  dose only binds at the reachability edge. */
export const Z_WHITE = 4.97;
export const TREF_WHITE_C = 80.0;

/** Effective surface heat transfer coefficient in water, W/m^2K.
 *  Natural convection on a sphere (~1100) in series with shell + membranes
 *  (~3200) gives ~820. Bi = h*R/k ~ 33, so the surface is nearly - but not
 *  exactly - clamped at the water temperature: pure Dirichlet under-predicts
 *  cook time by ~5%.
 *
 *  KNOWN HIGH, AND NOT YET CHANGED. Denys et al. (2003) measured h = 490
 *  W/m^2K on the outer shell of intact eggs (combined CFD + experiment); with
 *  their measured shell (0.35-0.5 mm at 2.25 W/mK) in series that is an
 *  effective ~450, i.e. Bi ~ 18, about half of what this constant implies.
 *  Their bath was 40-60 C with 0.01 m/s forced circulation, so a rolling boil
 *  should be higher - but 850 is roughly twice the only published measurement
 *  and the Dirichlet error is correspondingly larger than ~5%. Changing it
 *  would simply be re-absorbed by ALPHA_DEFAULT, which is why it still stands;
 *  see README section 11. */
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

/** Time constant for the egg surface to equilibrate with a new medium when it
 *  leaves the water, s.
 *
 *  Physically this is finite because the Biot number is finite and because it
 *  takes a few seconds to actually move an egg into a bath. It also matters
 *  numerically: a truncated modal basis cannot represent a fresh temperature
 *  discontinuity at the centre, where modes are weighted by n, so an
 *  instantaneous surface drop produces large spurious ringing. A continuous
 *  transition is both more honest and better conditioned. */
export const TAU_PLUNGE = 4.0;

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
