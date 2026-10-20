import Foundation
import EggTimerCopy

/// The twin of `src/core/geometry.ts`, held to it by `fixtures/core.json`; the
/// TypeScript's comments say what each part is for.

public struct Egg: Sendable, Equatable, Codable {
    /// Equal-volume sphere radius.
    public let radiusM: Double
    public let minorDiameterM: Double
    public let massKg: Double
    public let volumeM3: Double

    enum CodingKeys: String, CodingKey {
        case radiusM = "radius_m", minorDiameterM = "minorDiameter_m", massKg = "mass_kg"
        case volumeM3 = "volume_m3"
    }
}

/// The iOS app only weighs eggs, so only `eggFromMass` is here: the web's
/// measure-by-width (`eggFromMinorDiameter`) and `diffusionTime` stay in
/// TypeScript alone.
public enum Geometry {
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
}

/// One egg size class: its name's catalogue key and its mass.
public struct SizeClass: Sendable, Equatable {
    public let key: CopyKey
    public let massKg: Double
}

/// Takes a region code, `Locale.current.region?.identifier`, rather than a
/// `Locale`: the app does the asking.
public func sizeClassesFor(region: String?) -> [SizeClass] {
    sizeTableFor(region: region) == .us ? usSizeClasses : sizeClasses
}

public enum SizeTable: String, Sendable, Codable, CaseIterable {
    case eu, us
}

func isUS(_ region: String?) -> Bool {
    region?.uppercased() == "US"
}

public func sizeTableFor(region: String?) -> SizeTable {
    isUS(region) ? .us : .eu
}
