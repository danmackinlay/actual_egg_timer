import Foundation

/// Doneness as accumulated thermal dose, not peak temperature.
/// Transliterated from `src/core/kinetics.ts`.
///
/// WARNING: the standard food-engineering cook value C100 uses z = 33.1 K.
/// That is 7x too shallow for egg protein. Do not substitute it.
public struct Dose: Sendable {
    public let zK: Double
    public let trefC: Double
    /// Accumulated equivalent minutes at `trefC`.
    public private(set) var minutes: Double

    public init(zK: Double, trefC: Double) {
        self.zK = zK
        self.trefC = trefC
        self.minutes = 0.0
    }

    /// Accumulate `dtS` seconds at `temperatureC`.
    public mutating func accumulate(temperatureC: Double, dtS: Double) {
        minutes += pow(10.0, (temperatureC - trefC) / zK) * dtS / 60.0
    }

    /// Time held at `heldC` that reaches `doseMinutes` of this dose.
    public func holdTime(doseMinutes: Double, heldC: Double) -> Double {
        doseMinutes / pow(10.0, (heldC - trefC) / zK)
    }
}

public enum Kinetics {
    /// z = ln(10) * R * T^2 / Ea. Documents where zYolk and zWhite come from.
    public static func zFromActivationEnergy(eaJmol: Double, temperatureK: Double) -> Double {
        let gasConstant = 8.314
        return log(10.0) * gasConstant * temperatureK * temperatureK / eaJmol
    }
}
