import Foundation
import EggTimerCore

/// Input bounds, in one table.
///
/// The web app learned this the hard way: limits that live in the markup, in
/// the read path and in the load path drift apart. Here every control's range
/// and every clamp reads the same numbers.
enum Limits {
    static let eggMassG = 25.0...120.0
    static let altitudeM = -400.0...5000.0
    static let waterLitres = 0.25...12.0
    static let eggCount = 1.0...24.0
    static let doneness = 0.0...1.0
    /// A tap under half a minute is a double tap, not a boil; over two hours is
    /// an app left open.
    static let timeToBoilS = 30.0...7200.0
}

func clamped(_ value: Double, to range: ClosedRange<Double>) -> Double {
    min(range.upperBound, max(range.lowerBound, value))
}

/// Remembered time to a rolling boil, seconds, keyed by water volume in litres
/// to one decimal place. Same pan, same hob, same answer next time.
struct BoilMemory {
    private static let key = "boilMemory"
    /// Fallback when nothing has ever been measured.
    static let defaultSeconds = 480.0

    private var byVolume: [String: Double]

    var isEmpty: Bool { byVolume.isEmpty }

    static func load() -> BoilMemory {
        let stored = UserDefaults.standard.dictionary(forKey: key) as? [String: Double]
        return BoilMemory(byVolume: stored ?? [:])
    }

    private static func volumeKey(_ litres: Double) -> String {
        String(format: "%.1f", litres)
    }

    /// Blend a new measurement with what was already known for this volume, so
    /// one odd run does not dominate.
    mutating func remember(litres: Double, seconds: Double) {
        guard Limits.timeToBoilS.contains(seconds) else { return }
        let key = Self.volumeKey(litres)
        byVolume[key] = byVolume[key].map { 0.5 * $0 + 0.5 * seconds } ?? seconds
        UserDefaults.standard.set(byVolume, forKey: Self.key)
    }

    /// The exact remembered value, else the nearest remembered volume scaled by
    /// litres (energy is roughly proportional to mass), else the default.
    func estimate(litres: Double) -> Double {
        if let exact = byVolume[Self.volumeKey(litres)] { return exact }

        var bestLitres = 0.0
        var bestSeconds = 0.0
        var bestDistance = Double.infinity
        for (key, seconds) in byVolume {
            guard let candidate = Double(key) else { continue }
            let distance = abs(candidate - litres)
            if distance < bestDistance {
                bestDistance = distance
                bestLitres = candidate
                bestSeconds = seconds
            }
        }
        guard bestLitres > 0 else { return Self.defaultSeconds }
        return clamped(bestSeconds * (litres / bestLitres), to: Limits.timeToBoilS)
    }
}

/// The inputs, remembered between launches. Nobody wants to re-enter their
/// altitude every morning.
enum Settings {
    @MainActor
    static func load(into kitchen: Kitchen) {
        let store = UserDefaults.standard
        guard store.object(forKey: "doneness") != nil else { return }
        kitchen.doneness = clamped(store.double(forKey: "doneness"), to: Limits.doneness)
        kitchen.eggMassG = clamped(store.double(forKey: "eggMassG"), to: Limits.eggMassG)
        kitchen.altitudeM = clamped(store.double(forKey: "altitudeM"), to: Limits.altitudeM)
        kitchen.waterLitres = clamped(store.double(forKey: "waterLitres"), to: Limits.waterLitres)
        kitchen.eggCount = clamped(store.double(forKey: "eggCount"), to: Limits.eggCount)
        kitchen.fromFridge = store.bool(forKey: "fromFridge")
        kitchen.coldStart = store.bool(forKey: "coldStart")
        kitchen.heatOff = store.bool(forKey: "heatOff")
        kitchen.cooling = Cooling(rawValue: store.string(forKey: "cooling") ?? "") ?? .ice
    }

    @MainActor
    static func save(_ kitchen: Kitchen) {
        let store = UserDefaults.standard
        store.set(kitchen.doneness, forKey: "doneness")
        store.set(kitchen.eggMassG, forKey: "eggMassG")
        store.set(kitchen.altitudeM, forKey: "altitudeM")
        store.set(kitchen.waterLitres, forKey: "waterLitres")
        store.set(kitchen.eggCount, forKey: "eggCount")
        store.set(kitchen.fromFridge, forKey: "fromFridge")
        store.set(kitchen.coldStart, forKey: "coldStart")
        store.set(kitchen.heatOff, forKey: "heatOff")
        store.set(kitchen.cooling.rawValue, forKey: "cooling")
    }
}
