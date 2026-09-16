/// Every tunable in the model, transliterated from `src/core/constants.ts`.
///
/// The provenance of each number lives in the TypeScript and in README §6;
/// it is deliberately not duplicated here, because two copies of a
/// justification drift and one of them becomes a lie. What this file owes the
/// original is the VALUES, and `ConformanceTests` checks that debt.

public enum Constants {
    /// Eigenmodes retained in the sphere series.
    public static let modeCount = 40

    /// Thermal diffusivity of egg albumen at cooking temperature, m^2/s.
    /// The calibration parameter.
    public static let alphaDefault = 1.70e-7
    public static let alphaRelSD = 0.119

    /// Yolk boundary as a fraction of egg radius: (1/3)^(1/3).
    public static let yolkRadiusFrac = 0.693

    /// Arrhenius sharpness, K, and the reference temperature of each dose.
    public static let zYolk = 4.65
    public static let tRefYolkC = 63.0
    public static let zWhite = 4.97
    public static let tRefWhiteC = 80.0

    /// Effective surface heat transfer coefficient in water, W/m^2K, and the
    /// conductivity used with it for the Biot number.
    public static let hEff = 850.0
    public static let kEgg = 0.60

    /// Hob overshoot ratio, and the multiplier on the pan's loss time constant
    /// once the heat is off.
    public static let rampR = 3.0
    public static let tauStandingScale = 1.0

    /// Lumped cooling time constant in still air, s.
    public static let tauAir = 2030.0

    public static let tIceBathC = 2.0
    public static let tColdTapC = 15.0
    public static let tRoomC = 20.0

    public static let tauPlunge = 4.0
    public static let tauDipRecovery = 60.0

    public static let cWater = 4186.0
    public static let cEgg = 3200.0
    public static let rhoEgg = 1100.0

    public static let eggVolumeCoeff = 0.51
    public static let eggLengthRatio = 1.35

    public static let dtSim = 0.5
    public static let carryoverWindow = 900.0
}
