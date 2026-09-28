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
        // The cook's choice of units, or none. Read before the early return,
        // because it is its own key and a choice can predate the rest.
        kitchen.restoreUnits(readChosenUnits(store.string(forKey: "unitsChosen")))
        // The probe thermometer (E4), the same way: its own keys, and off when
        // they are absent.
        kitchen.restoreProbe(on: store.bool(forKey: "probe"), asked: store.bool(forKey: "probeAsked"))
        guard store.object(forKey: "doneness") != nil else { return }
        kitchen.doneness = clamp(store.double(forKey: "doneness"), to: Limits.doneness)
        let massG = clamp(store.double(forKey: "eggMassG"), to: Limits.massG)
        // The last weighed mass, under its own key, so Weighed comes back to it
        // whatever class was chosen since; the default egg when none was kept.
        let weighedG = store.object(forKey: "weighedMassG") == nil
            ? Defaults.eggMassKg * 1000
            : clamp(store.double(forKey: "weighedMassG"), to: Limits.massG)
        kitchen.restoreSize(index: sizeIndex(in: store, massG: massG, classes: kitchen.sizeClasses),
                            weighedMassG: weighedG)
        kitchen.altitudeM = clamp(store.double(forKey: "altitudeM"), to: Limits.altitudeM)
        kitchen.waterLitres = clamp(store.double(forKey: "waterLitres"), to: Limits.waterLitres)
        kitchen.eggCount = Int(clamp(store.double(forKey: "eggCount"), to: Limits.eggCount).rounded())
        // Three positions under a new key, as the start has; an install from
        // before Custom comes back to the fridge or the room it was left on.
        if let stored = store.string(forKey: "startTemp"), let from = EggFrom(rawValue: stored) {
            kitchen.startTemp = from
        } else {
            kitchen.startTemp = store.bool(forKey: "fromFridge") ? .fridge : .room
        }
        if store.object(forKey: "customStartC") != nil {
            kitchen.customStartC = clamp(store.double(forKey: "customStartC"), to: Limits.eggTempC)
        }
        // Three positions under a new key. The old `coldStart` bool is still
        // read, so an install that predates the sous-vide option comes back to
        // the start mode it was left on rather than to the default - and an
        // unrecognised string does the same, which is what an older build
        // reading a newer value would leave behind.
        //
        // Only a pan comes back (see `save`). A stored sous-vide, from before it
        // stopped being saved, opens on cold: the `coldStart` written beside it
        // was false for want of anything better, not a hot start the cook chose.
        if let stored = store.string(forKey: "start"), let start = StartChoice(rawValue: stored) {
            kitchen.start = start == .sousVide ? .cold : start
        } else if store.object(forKey: "coldStart") != nil {
            kitchen.start = store.bool(forKey: "coldStart") ? .cold : .hot
        } else {
            // Saved only ever in sous-vide: no pan was chosen, so the default.
            kitchen.start = .cold
        }
        kitchen.heatOff = store.bool(forKey: "heatOff")
        kitchen.cooling = Cooling(rawValue: store.string(forKey: "cooling") ?? "") ?? .ice
    }

    /// The stored size class, read against the table in use now.
    ///
    /// A record from before there were size classes on this side has only a
    /// mass. The slider opened on an EU Large, 68 g, and a cook who never moved
    /// it never chose a mass at all - they took the default, which is a Large.
    /// Reading that as a Large is what gets an American who never touched the
    /// slider onto the American Large; reading it as 68 g weighed would leave
    /// them half a minute over. Any other mass was moved to, so it was weighed.
    private static func sizeIndex(in store: UserDefaults, massG: Double, classes: [SizeClass]) -> Int {
        guard store.object(forKey: "sizeIndex") != nil else {
            let untouched = massG == sizeClasses[Defaults.sizeIndex].massKg * 1000
            return untouched ? carrySizeIndex(Double(Defaults.sizeIndex), classes: classes) : -1
        }
        return carrySizeIndex(clamp(store.double(forKey: "sizeIndex"), to: Limits.sizeIndex), classes: classes)
    }

    @MainActor
    static func save(_ kitchen: Kitchen) {
        let store = UserDefaults.standard
        store.set(kitchen.doneness, forKey: "doneness")
        // The mass being cooked, class or weighed, so a downgrade - which reads
        // only this key - comes back to the same egg.
        store.set(kitchen.eggMassG, forKey: "eggMassG")
        store.set(kitchen.weighedMassG, forKey: "weighedMassG")
        store.set(Double(kitchen.sizeIndex), forKey: "sizeIndex")
        store.set(kitchen.altitudeM, forKey: "altitudeM")
        store.set(kitchen.waterLitres, forKey: "waterLitres")
        store.set(Double(kitchen.eggCount), forKey: "eggCount")
        store.set(kitchen.startTemp.rawValue, forKey: "startTemp")
        store.set(kitchen.customStartC, forKey: "customStartC")
        // Kept in step for the sake of a downgrade, which reads only this key.
        store.set(kitchen.startTemp == .fridge, forKey: "fromFridge")
        // Sous-vide is never remembered. Its answer is a start time most of a
        // day in the past, and an app that reopened on it would greet the cook
        // by telling them they are 22 hours late. So while it is chosen, the
        // pan saved before it stays saved, and a relaunch comes back to that
        // pan - or to cold, the default, if there never was one. The web app
        // does the same (`saveSettings` in src/ui/store.ts).
        if kitchen.start != .sousVide {
            store.set(kitchen.start.rawValue, forKey: "start")
            // Kept in step for the sake of a downgrade, which reads only this key.
            store.set(kitchen.coldStart, forKey: "coldStart")
        }
        store.set(kitchen.heatOff, forKey: "heatOff")
        store.set(kitchen.cooling.rawValue, forKey: "cooling")
        // The cook's choice, not the system on screen: absent until they make
        // one, so a default can still follow the phone.
        store.set(kitchen.probe, forKey: "probe")
        store.set(kitchen.probeAsked, forKey: "probeAsked")
        if let chosen = kitchen.unitsChosen {
            store.set(chosen.rawValue, forKey: "unitsChosen")
        } else {
            store.removeObject(forKey: "unitsChosen")
        }
    }
}
