import Foundation

/// The twin of `src/core/boil.ts`, held to it by `fixtures/boil.json`; the
/// TypeScript's comments say what each part is for.

/// Seconds to a rolling boil, keyed by litres to one decimal place.
public typealias BoilMemory = [String: Double]

func volumeKey(_ litres: Double) -> String {
    String(format: "%.1f", litres)
}

public func rememberBoil(_ memory: BoilMemory, litres: Double, seconds: Double) -> BoilMemory {
    guard isWithin(seconds, Limits.timeToBoilS) else { return memory }
    var updated = memory
    let key = volumeKey(litres)
    updated[key] = updated[key].map { 0.5 * $0 + 0.5 * seconds } ?? seconds
    return updated
}

/// The keys are sorted before the nearest is sought, as in the TypeScript: a
/// Dictionary's order is arbitrary.
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
