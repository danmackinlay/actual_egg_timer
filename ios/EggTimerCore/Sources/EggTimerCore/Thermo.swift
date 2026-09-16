import Foundation

/// Water boiling point from altitude or barometric pressure.
/// Transliterated from `src/core/thermo.ts`.
public enum Thermo {
    /// International Standard Atmosphere, troposphere (-500 m to 11000 m). Pa.
    public static func pressureAtAltitude(_ altitudeM: Double) -> Double {
        let h = altitudeM < -500.0 ? -500.0 : (altitudeM > 11000.0 ? 11000.0 : altitudeM)
        return 101325.0 * pow(1.0 - 2.25577e-5 * h, 5.25588)
    }

    /// Antoine equation for water, Stull (1947), inverted for temperature.
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

    /// The engineering one-liner, kept for cross-checking.
    public static func boilingPointApprox(_ altitudeM: Double) -> Double {
        100.0 - altitudeM / 300.0
    }

    /// Boiling-point elevation from dissolved salt, C.
    public static func saltBoilingElevation(_ gramsSaltPerLitre: Double) -> Double {
        let molality = gramsSaltPerLitre / 58.44
        return 1.9 * 0.512 * molality
    }
}
