import Foundation

/// Egg geometry, transliterated from `src/core/geometry.ts`.
public struct Egg: Sendable, Equatable, Codable {
    /// Equal-volume sphere radius, m. This is what the conduction model uses.
    public let radiusM: Double
    /// Minor (equatorial) diameter as measured, m.
    public let minorDiameterM: Double
    /// Whole-egg mass including shell, kg.
    public let massKg: Double
    /// Egg volume, m^3.
    public let volumeM3: Double
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

/// Egg size classes, labelled by grams: an EU "Large" is a US "Extra large",
/// and a US "Large" is an EU "Medium", so the names alone would mis-time one
/// audience or the other.
///
/// Two tables, chosen by region in `sizeClassesFor(region:)`. Both put the same
/// class at the same index as far as the shorter goes, which is what lets a
/// stored index keep its name when the table changes (`carrySizeIndex`).
///
/// The name is a catalogue key, one per class per table: an American Large and
/// an EU Large are different eggs, and a language may want to say so. The mass
/// on the label comes from the mass, in grams or ounces - see `sizeClassLabel`
/// in Units.swift.
public struct SizeClass: Sendable, Equatable {
    public let key: String
    public let massKg: Double
}

/// EU Regulation 589/2008 Art. 4, at a representative mass inside each band.
public let sizeClasses: [SizeClass] = [
    SizeClass(key: "size.eu.small", massKg: 0.048),
    SizeClass(key: "size.eu.medium", massKg: 0.058),
    SizeClass(key: "size.eu.large", massKg: 0.068),
    SizeClass(key: "size.eu.extraLarge", massKg: 0.076),
]

/// The classes printed on an American carton. USDA defines each by a MINIMUM
/// net weight per dozen - Small 18 oz, Medium 21, Large 24, Extra large 27,
/// Jumbo 30 - so a class runs from its own minimum up to the next class's, and
/// the mass here is the midpoint of that run, per egg.
///
/// Jumbo has no upper bound, so its 74 g is a guess: the 70.9 g floor plus half
/// the width of the class below it. Labels round to the gram; the model cooks
/// the midpoint to a tenth.
public let usSizeClasses: [SizeClass] = [
    SizeClass(key: "size.us.small", massKg: 0.0461),
    SizeClass(key: "size.us.medium", massKg: 0.0532),
    SizeClass(key: "size.us.large", massKg: 0.0602),
    SizeClass(key: "size.us.extraLarge", massKg: 0.0673),
    SizeClass(key: "size.us.jumbo", massKg: 0.074),
]

/// The size classes for a region: the American carton in region `US`, the EU
/// classes everywhere else, including when the region is unknown.
///
/// Takes a region CODE - `Locale.current.region?.identifier` - rather than a
/// `Locale`, so that the package stays free of I/O and the app does the asking.
/// Region only: an American reading the app in Czech still buys American eggs.
public func sizeClassesFor(region: String?) -> [SizeClass] {
    sizeTableFor(region: region) == .us ? usSizeClasses : sizeClasses
}

/// Which of the two tables that is, by name. A record of an egg cooked by size
/// class carries it, because the same class is 68 g in one table and 60.2 g in
/// the other.
public enum SizeTable: String, Sendable, Codable {
    case eu, us
}

/// Whether a platform's region is the United States, the one region whose
/// eggs, water and default units differ.
func isUS(_ region: String?) -> Bool {
    region?.uppercased() == "US"
}

public func sizeTableFor(region: String?) -> SizeTable {
    isUS(region) ? .us : .eu
}
