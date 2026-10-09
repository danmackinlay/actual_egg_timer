import Foundation
import EggTimerCore

/// Persistence: UserDefaults in, UserDefaults out.
///
/// The BOUNDS and the blending rules are EggTimerCore's Policy, so the two apps
/// share one set, and one order: a Dictionary walked in whatever order it
/// likes would let two equidistant pans give the two apps different answers.
/// This file applies the rules; it does not decide them.

/// The newest version of the app that has run on this phone, and whether
/// this one may write (DECISIONS.md 100).
///
/// An older build writes what it stores whole, from the fields it knows, and
/// drops what a newer build added there. So the mark holds the newest
/// `MARKETING_VERSION` that has run, with its build number (`CFBundleVersion`)
/// beside it, since every TestFlight build of one version shares the version;
/// and a build that finds a newer one writes nothing at all until it is
/// quit: no setting, pan, cook, result, language or sharing state. It still
/// times the egg, and says so at the top of the screen and in Settings.
/// Whether it may write is core's `writerCheckBuilt`.
///
/// Every write the app makes to UserDefaults goes through `set` and
/// `remove`, so the guard holds for all of them (`test/iosStores.test.ts`
/// fails on any other); reads go straight to UserDefaults. `claim` runs first thing at launch, before anything is
/// written, and writes this build's version as the mark when it may write.
/// The mark is never removed: "Start learning again" keeps it.
enum Stores {
    /// Under its own key, never changed: a newer build must find it.
    static let markKey = "newestVersion"
    /// The build number of the build that wrote the mark. A build from
    /// before it was kept reads only the mark, and leaves this alone.
    static let buildKey = "newestBuild"

    /// Every key an earlier build wrote that this one does not read, deleted
    /// at launch (`claim`) rather than left on the phone being neither read
    /// nor collected: the posteriors before the log (`v1`-`v3`), the log of
    /// 0.3 and 0.4 (`v4`; the log starts fresh in 0.5, DECISIONS.md 107), the
    /// copies 0.4 kept aside of what it could not read, the cooks in progress
    /// before this one's shape, the sharing keys of an earlier 0.4 build, and
    /// settings no build reads any more.
    static let retiredKeys = [
        "calibration.v1", "calibration.v2", "calibration.v3", "calibration.v4", "calibration.v4.unread",
        "cookInProgress", "cookInProgress.v2", "cookInProgress.unread",
        "share.v1", "share.attest.v1", "coldStart", "fromFridge", "eggMassG", "probeAsked",
    ]
    /// The keys where an earlier build kept its cook in progress.
    private static let retiredCookKeys: Set<String> = ["cookInProgress", "cookInProgress.v2"]

    /// Whether the sweep found an earlier build's cook in progress, until
    /// `takeRetiredCook` is asked: its Live Activity is still on the Lock
    /// Screen, and nothing will update it again.
    nonisolated(unsafe) private static var retiredCook = false

    /// Once: whether the launch's sweep deleted an earlier build's cook.
    static func takeRetiredCook() -> Bool {
        defer { retiredCook = false }
        return retiredCook
    }

    /// Set once, at launch, before the first view; read on the main actor.
    nonisolated(unsafe) private(set) static var readOnly = false

    /// The version this build marks with: the App Store version alone, which
    /// is package.json's without the pre-release (core's `Newer.swift`).
    static var mine: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    /// This build's number, which tells two builds of one version apart.
    static var myBuild: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
    }

    /// Compare the mark and its build with this build, and bring them up to
    /// this build if this build may write. Says whether it may.
    @discardableResult
    static func claim(
        _ version: String = mine, build: String = myBuild, in defaults: UserDefaults = .standard
    ) -> WriterVerdict {
        let mark = defaults.string(forKey: markKey)
        let markBuild = defaults.string(forKey: buildKey)
        let verdict = writerCheckBuilt(mark, markBuild, version, build)
        readOnly = verdict == .readOnly
        if verdict == .write, parseVersion(version) != nil {
            if mark != version { defaults.set(version, forKey: markKey) }
            if markBuild != build, parseBuild(build) != nil { defaults.set(build, forKey: buildKey) }
        }
        // A build that finds a newer mark deletes nothing.
        if verdict == .write {
            for key in retiredKeys where defaults.object(forKey: key) != nil {
                if retiredCookKeys.contains(key) { retiredCook = true }
                defaults.removeObject(forKey: key)
                #if DEBUG
                Screenshots.log("swept \(key)")
                #endif
            }
        }
        #if DEBUG
        Screenshots.log(
            "stores \(verdict.rawValue) mark \(mark ?? "none") build \(markBuild ?? "none") mine \(version) build \(build)"
        )
        #endif
        return verdict
    }

    static func set(_ value: Any?, forKey key: String, in defaults: UserDefaults = .standard) {
        guard !readOnly else { return }
        defaults.set(value, forKey: key)
    }

    static func remove(_ key: String, in defaults: UserDefaults = .standard) {
        guard !readOnly else { return }
        defaults.removeObject(forKey: key)
    }
}

/// Where a boil memory is kept. How the numbers combine is `rememberBoil` and
/// `estimateTimeToBoil` in the core.
enum BoilMemories {
    private static let key = "boilMemory"

    static func load() -> BoilMemory {
        (UserDefaults.standard.dictionary(forKey: key) as? BoilMemory) ?? [:]
    }

    static func save(_ memory: BoilMemory) {
        Stores.set(memory, forKey: key)
    }

    /// Forget every measured pan. Paired with the calibration reset: someone
    /// taking their learning back usually means the whole kitchen.
    static func reset() {
        Stores.remove(key)
    }
}

/// The inputs, remembered between launches. Nobody wants to re-enter their
/// altitude every morning.
enum SettingsStore {
    @MainActor
    static func load(into planner: Planner) {
        let store = UserDefaults.standard
        // The cook's choice of units, or none. Read before the early return,
        // because it is its own key and a choice can predate the rest.
        planner.restoreUnits(readChosenUnits(store.string(forKey: "unitsChosen")))
        // The probe thermometer, the same way: its own keys, and off when
        // they are absent.
        planner.restoreProbe(on: store.bool(forKey: "probe"))
        // The measured room, absent until set: not measured.
        planner.restoreRoom(store.object(forKey: "roomC") == nil ? nil : store.double(forKey: "roomC"))
        guard store.object(forKey: "doneness") != nil else { return }
        planner.doneness = clamp(store.double(forKey: "doneness"), to: Limits.doneness)
        // The last weighed mass, under its own key, so Weighed comes back to it
        // whatever class was chosen since; the default egg when none was kept.
        let weighedG = store.object(forKey: "weighedMassG") == nil
            ? Defaults.eggMassKg * 1000
            : clamp(store.double(forKey: "weighedMassG"), to: Limits.massG)
        let index = store.object(forKey: "sizeIndex") == nil
            ? Defaults.sizeIndex
            : carrySizeIndex(clamp(store.double(forKey: "sizeIndex"), to: Limits.sizeIndex),
                             classes: planner.sizeClasses)
        planner.restoreSize(index: index, weighedMassG: weighedG)
        planner.altitudeM = clamp(store.double(forKey: "altitudeM"), to: Limits.altitudeM)
        planner.waterLitres = clamp(store.double(forKey: "waterLitres"), to: Limits.waterLitres)
        planner.eggCount = Int(clamp(store.double(forKey: "eggCount"), to: Limits.eggCount).rounded())
        planner.startTemp = EggFrom(rawValue: store.string(forKey: "startTemp") ?? "") ?? .fridge
        if store.object(forKey: "customStartC") != nil {
            planner.customStartC = clamp(store.double(forKey: "customStartC"), to: Limits.eggTempC)
        }
        // Only a pan is ever saved (see `save`), so anything else - none saved
        // yet, or a sous-vide - opens on the default.
        let start = StartChoice(rawValue: store.string(forKey: "start") ?? "") ?? .cold
        planner.start = start == .sousVide ? .cold : start
        planner.heatOff = store.bool(forKey: "heatOff")
        planner.cooling = Cooling(rawValue: store.string(forKey: "cooling") ?? "") ?? .ice
    }

    /// Only the settings a correction changed, for the next cook
    /// (design/one-screen.md section 7, 22): the rest stay as they were, and
    /// a level the slider only previewed after the pull is never written.
    ///
    /// Settings never saved (a fresh install) are read only once the level
    /// is (`load`), so then the whole controls are saved, with the level in
    /// force, `level`.
    @MainActor
    static func save(_ planner: Planner, fields: Set<ControlField>, level: Double) {
        let store = Guarded()
        if UserDefaults.standard.object(forKey: "doneness") == nil {
            save(planner)
            store.set(level, forKey: "doneness")
            return
        }
        for field in fields {
            switch field {
            case .level: store.set(planner.doneness, forKey: "doneness")
            case .mass:
                store.set(planner.weighedMassG, forKey: "weighedMassG")
                store.set(Double(planner.sizeIndex), forKey: "sizeIndex")
            case .eggFrom: store.set(planner.startTemp.rawValue, forKey: "startTemp")
            case .customStart: store.set(planner.customStartC, forKey: "customStartC")
            case .room:
                store.set(planner.probe, forKey: "probe")
                if let room = planner.roomC {
                    store.set(room, forKey: "roomC")
                } else {
                    store.remove("roomC")
                }
            case .start: if planner.start != .sousVide { store.set(planner.start.rawValue, forKey: "start") }
            case .afterBoil: store.set(planner.heatOff, forKey: "heatOff")
            case .cooling: store.set(planner.cooling.rawValue, forKey: "cooling")
            case .water: store.set(planner.waterLitres, forKey: "waterLitres")
            case .eggCount: store.set(Double(planner.eggCount), forKey: "eggCount")
            case .altitude: store.set(planner.altitudeM, forKey: "altitudeM")
            case .startTime: break
            }
        }
    }

    @MainActor
    static func save(_ planner: Planner) {
        let store = Guarded()
        store.set(planner.doneness, forKey: "doneness")
        store.set(planner.weighedMassG, forKey: "weighedMassG")
        store.set(Double(planner.sizeIndex), forKey: "sizeIndex")
        store.set(planner.altitudeM, forKey: "altitudeM")
        store.set(planner.waterLitres, forKey: "waterLitres")
        store.set(Double(planner.eggCount), forKey: "eggCount")
        store.set(planner.startTemp.rawValue, forKey: "startTemp")
        store.set(planner.customStartC, forKey: "customStartC")
        // Sous-vide is never remembered. Its answer is a start time most of a
        // day in the past, and an app that reopened on it would greet the cook
        // by telling them they are 22 hours late. So while it is chosen, the
        // pan saved before it stays saved, and a relaunch comes back to that
        // pan - or to cold, the default, if there never was one. The web app
        // does the same (`saveSettings` in src/ui/store.ts).
        if planner.start != .sousVide {
            store.set(planner.start.rawValue, forKey: "start")
        }
        store.set(planner.heatOff, forKey: "heatOff")
        store.set(planner.cooling.rawValue, forKey: "cooling")
        // The cook's choice, not the system on screen: absent until they make
        // one, so a default can still follow the phone.
        store.set(planner.probe, forKey: "probe")
        if let room = planner.roomC {
            store.set(room, forKey: "roomC")
        } else {
            store.remove("roomC")
        }
        if let chosen = planner.unitsChosen {
            store.set(chosen.rawValue, forKey: "unitsChosen")
        } else {
            store.remove("unitsChosen")
        }
    }
}

/// UserDefaults' setter, through the guard (`Stores`), for a run of writes.
private struct Guarded {
    func set(_ value: Any?, forKey key: String) { Stores.set(value, forKey: key) }
    func remove(_ key: String) { Stores.remove(key) }
}
