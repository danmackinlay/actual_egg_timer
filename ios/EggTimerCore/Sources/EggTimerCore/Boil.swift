import Foundation

/// Boil memory: the time to a rolling boil each volume of water took, kept so
/// that the same pan on the same hob gets the same answer next time, and the
/// best guess for a volume never measured. Storage is the app's; how the
/// numbers combine is decided here. Transliterated from `src/core/boil.ts`,
/// and held to it by `fixtures/boil.json`.

/// Fallback when no pan has ever been measured, s.
public let defaultTimeToBoilS = 480.0

/// Remembered time to a rolling boil, seconds, keyed by water volume in litres
/// to one decimal place.
public typealias BoilMemory = [String: Double]

func volumeKey(_ litres: Double) -> String {
    String(format: "%.1f", litres)
}

/// Blend a new measurement with what was already known for this volume, so one
/// odd run does not dominate. Returns the memory unchanged when the measurement
/// is not credible.
public func rememberBoil(_ memory: BoilMemory, litres: Double, seconds: Double) -> BoilMemory {
    guard isWithin(seconds, Limits.timeToBoilS) else { return memory }
    var updated = memory
    let key = volumeKey(litres)
    updated[key] = updated[key].map { 0.5 * $0 + 0.5 * seconds } ?? seconds
    return updated
}

/// Best guess at the time to a rolling boil for this volume: the exact
/// remembered value, else the nearest remembered volume scaled by litres
/// (energy is roughly proportional to mass), else the default.
///
/// The nearest volume is found over SORTED keys, and ties go to the smaller
/// volume. That is not fussiness: this walked a Dictionary here and insertion
/// order on the web, so two equidistant pans could give the two apps different
/// answers.
public func estimateTimeToBoil(_ memory: BoilMemory, litres: Double) -> Double {
    if let exact = memory[volumeKey(litres)] { return exact }

    let keys = memory.keys.sorted { (Double($0) ?? 0) < (Double($1) ?? 0) }
    var bestLitres = 0.0
    var bestSeconds = 0.0
    var bestDistance = Double.infinity
    for key in keys {
        guard let candidate = Double(key), candidate.isFinite, candidate > 0 else { continue }
        guard let seconds = memory[key] else { continue }
        let distance = abs(candidate - litres)
        if distance < bestDistance {
            bestDistance = distance
            bestLitres = candidate
            bestSeconds = seconds
        }
    }
    guard bestLitres > 0 else { return defaultTimeToBoilS }
    return clamp(bestSeconds * (litres / bestLitres), to: Limits.timeToBoilS)
}

public func hasBoilMemory(_ memory: BoilMemory) -> Bool {
    !memory.isEmpty
}
