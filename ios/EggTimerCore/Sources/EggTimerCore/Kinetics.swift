import Foundation

/// The twin of `src/core/kinetics.ts`, held to it by `fixtures/core.json`; the
/// TypeScript's comments say what each part is for. Its `createDose` and
/// `accumulateDose` are this struct's `init` and a mutating method, and its
/// documentation-only `zFromActivationEnergy` has no twin.
public struct Dose: Sendable, Codable {
    public let zK: Double
    public let trefC: Double
    /// Accumulated equivalent minutes at `trefC`.
    public private(set) var minutes: Double

    public init(zK: Double, trefC: Double) {
        self.zK = zK
        self.trefC = trefC
        self.minutes = 0.0
    }

    public mutating func accumulate(temperatureC: Double, dtS: Double) {
        minutes += pow(10.0, (temperatureC - trefC) / zK) * dtS / 60.0
    }

    public func holdTimeForDose(doseMinutes: Double, heldC: Double) -> Double {
        doseMinutes / pow(10.0, (heldC - trefC) / zK)
    }

    enum CodingKeys: String, CodingKey {
        case zK = "z_K", trefC = "tref_C", minutes
    }
}
