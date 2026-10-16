import Foundation

/// The twin of `src/core/thermo.ts`, held to it by `fixtures/core.json`; the
/// TypeScript's comments say what each part is for. Its top-level functions
/// are this enum's statics, and its documentation-only `boilingPointApprox`
/// and `saltBoilingElevation` have no twin.
public enum Thermo {
    /// Barometric pressure at an altitude, Pa.
    public static func pressureAtAltitude(_ altitudeM: Double) -> Double {
        let h = altitudeM < -500.0 ? -500.0 : (altitudeM > 11000.0 ? 11000.0 : altitudeM)
        return 101325.0 * pow(1.0 - 2.25577e-5 * h, 5.25588)
    }

    public static func boilingPointAtPressure(_ pressurePa: Double) -> Double {
        let a = 8.07131
        let b = 1730.63
        let c = 233.426
        let mmHg = pressurePa / 133.322
        return b / (a - log10(mmHg)) - c
    }

    public static func boilingPointAtAltitude(_ altitudeM: Double) -> Double {
        boilingPointAtPressure(pressureAtAltitude(altitudeM))
    }
}
