import Foundation
import EggTimerCore

/// Persistence: UserDefaults in, UserDefaults out.
///
/// The BOUNDS and the blending rules used to live here too. They now live in
/// EggTimerCore's Policy, because the web app had its own hand-copied set and
/// the two drifted - and because `estimate` walked this Dictionary in whatever
/// order it felt like, so two equidistant pans could give the two apps
/// different answers. This file applies the rules; it no longer decides them.

/// Where a boil memory is kept. How the numbers combine is `rememberBoil` and
/// `estimateTimeToBoil` in the core.
enum BoilMemories {
    private static let key = "boilMemory"

    static func load() -> BoilMemory {
        (UserDefaults.standard.dictionary(forKey: key) as? BoilMemory) ?? [:]
    }

    static func save(_ memory: BoilMemory) {
        UserDefaults.standard.set(memory, forKey: key)
    }

    /// Forget every measured pan. Paired with the calibration reset: someone
    /// taking their learning back usually means the whole kitchen.
    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// The inputs, remembered between launches. Nobody wants to re-enter their
/// altitude every morning.
enum Settings {
    @MainActor
    static func load(into kitchen: Kitchen) {
        let store = UserDefaults.standard
        guard store.object(forKey: "doneness") != nil else { return }
        kitchen.doneness = clamp(store.double(forKey: "doneness"), to: Limits.doneness)
        kitchen.eggMassG = clamp(store.double(forKey: "eggMassG"), to: Limits.massG)
        kitchen.altitudeM = clamp(store.double(forKey: "altitudeM"), to: Limits.altitudeM)
        kitchen.waterLitres = clamp(store.double(forKey: "waterLitres"), to: Limits.waterLitres)
        kitchen.eggCount = Int(clamp(store.double(forKey: "eggCount"), to: Limits.eggCount).rounded())
        kitchen.fromFridge = store.bool(forKey: "fromFridge")
        // Three positions under a new key. The old `coldStart` bool is still
        // read, so an install that predates the sous-vide option comes back to
        // the start mode it was left on rather than to the default - and an
        // unrecognised string does the same, which is what an older build
        // reading a newer value would leave behind.
        if let stored = store.string(forKey: "start"), let start = StartChoice(rawValue: stored) {
            kitchen.start = start
        } else {
            kitchen.start = store.bool(forKey: "coldStart") ? .cold : .hot
        }
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
        store.set(Double(kitchen.eggCount), forKey: "eggCount")
        store.set(kitchen.fromFridge, forKey: "fromFridge")
        store.set(kitchen.start.rawValue, forKey: "start")
        // Kept in step for the sake of a downgrade, which reads only this key.
        // Sous-vide has no honest bool here; false is the hot start the pan
        // solver is handed for it in the web app, and the closer of the two.
        store.set(kitchen.coldStart, forKey: "coldStart")
        store.set(kitchen.heatOff, forKey: "heatOff")
        store.set(kitchen.cooling.rawValue, forKey: "cooling")
    }
}
