import Foundation

/// Egg geometry, transliterated from `src/core/geometry.ts`.
public struct Egg: Sendable, Equatable {
    /// Equal-volume sphere radius, m. This is what the conduction model uses.
    public let radiusM: Double
    /// Minor (equatorial) diameter as measured, m.
    public let minorDiameterM: Double
    /// Whole-egg mass including shell, kg.
    public let massKg: Double
    /// Egg volume, m^3.
    public let volumeM3: Double
}

public enum Geometry {
    /// V = k_v * ratio * B^3.
    public static func eggVolumeFromMinorDiameter(_ minorDiameterM: Double) -> Double {
        let b = minorDiameterM
        return Constants.eggVolumeCoeff * Constants.eggLengthRatio * b * b * b
    }

    public static func eggFromMinorDiameter(_ minorDiameterM: Double) -> Egg {
        let volume = eggVolumeFromMinorDiameter(minorDiameterM)
        return egg(volumeM3: volume, minorDiameterM: minorDiameterM, massKg: Constants.rhoEgg * volume)
    }

    public static func eggFromMass(_ massKg: Double) -> Egg {
        let volume = massKg / Constants.rhoEgg
        let b = cbrt(volume / (Constants.eggVolumeCoeff * Constants.eggLengthRatio))
        return egg(volumeM3: volume, minorDiameterM: b, massKg: massKg)
    }

    private static func egg(volumeM3: Double, minorDiameterM: Double, massKg: Double) -> Egg {
        Egg(
            radiusM: cbrt(3.0 * volumeM3 / (4.0 * Double.pi)),
            minorDiameterM: minorDiameterM,
            massKg: massKg,
            volumeM3: volumeM3
        )
    }

    /// tau = R^2/alpha, s. Only this group affects the answer.
    public static func diffusionTime(_ egg: Egg, alphaM2s: Double) -> Double {
        egg.radiusM * egg.radiusM / alphaM2s
    }
}

public struct SizeClass: Sendable {
    public let label: String
    public let massKg: Double
}

public let sizeClasses: [SizeClass] = [
    SizeClass(label: "Small — 48 g", massKg: 0.048),
    SizeClass(label: "Medium — 58 g", massKg: 0.058),
    SizeClass(label: "Large — 68 g", massKg: 0.068),
    SizeClass(label: "Extra large — 76 g", massKg: 0.076),
]
