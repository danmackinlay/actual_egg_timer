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
/// `remove`, so the guard holds for all of them: `test/iosStores.test.ts`
/// fails on any other in the source, and the store (`store`, UserDefaults in
/// the app, a fake in the tests) takes a write only with a `Pass`, which
/// only this file can make. Reads go straight to the store. `claim` runs
/// first thing at launch, before anything is written, and writes this
/// build's version as the mark when it may write. The mark is never removed:
/// "Start learning again" keeps it.
public enum Stores {
    /// Where everything is kept: UserDefaults in the app; a test's own.
    nonisolated(unsafe) public static var store: any KeyValueStore = UserDefaults.standard

    /// What a write to the store needs, and only `Stores` can make: so no
    /// write reaches the store except through `set` and `remove`.
    public struct Pass: Sendable {
        fileprivate init() {}
    }

    /// Under its own key, never changed: a newer build must find it.
    public static let markKey = "newestVersion"
    /// The build number of the build that wrote the mark. A build from
    /// before it was kept reads only the mark, and leaves this alone.
    public static let buildKey = "newestBuild"

    /// Every key an earlier build wrote that this one does not read, deleted
    /// at launch (`claim`) rather than left on the phone being neither read
    /// nor collected: the posteriors before the log (`v1`-`v3`), the log of
    /// 0.3 and 0.4 (`v4`; the log starts fresh in 0.5, DECISIONS.md 107), the
    /// copies 0.4 kept aside of what it could not read, the cooks in progress
    /// before this one's shape, the sharing keys of an earlier 0.4 build, and
    /// settings no build reads any more, the settings a key each among them,
    /// and sharing's key kept with its dates as seconds since 2001.
    public static let retiredKeys = [
        "calibration.v1", "calibration.v2", "calibration.v3", "calibration.v4", "calibration.v4.unread",
        "cookInProgress", "cookInProgress.v2", "cookInProgress.v3", "cookInProgress.unread",
        "share.v1", "share.attest.v1", "sharing.attest.v1", "coldStart", "fromFridge", "eggMassG", "probeAsked",
        // The settings before they were one value (`SettingsStore`).
        "doneness", "weighedMassG", "sizeIndex", "altitudeM", "waterLitres", "eggCount", "startTemp",
        "customStartC", "start", "heatOff", "cooling", "probe", "roomC", "unitsChosen",
    ]
    /// The keys where an earlier build kept its cook in progress.
    private static let retiredCookKeys: Set<String> = ["cookInProgress", "cookInProgress.v2", "cookInProgress.v3"]

    /// Whether the sweep found an earlier build's cook in progress, until
    /// `takeRetiredCook` is asked: its Live Activity is still on the Lock
    /// Screen, and nothing will update it again.
    nonisolated(unsafe) private static var retiredCook = false

    /// Once: whether the launch's sweep deleted an earlier build's cook.
    public static func takeRetiredCook() -> Bool {
        defer { retiredCook = false }
        return retiredCook
    }

    /// Set once, at launch, before the first view; read on the main actor.
    public nonisolated(unsafe) private(set) static var readOnly = false

    /// The version this build marks with: the App Store version alone, which
    /// is package.json's without the pre-release (core's `Newer.swift`).
    public static var mine: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    /// This build's number, which tells two builds of one version apart.
    public static var myBuild: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
    }

    /// Compare the mark and its build with this build, and bring them up to
    /// this build if this build may write. Says whether it may.
    @discardableResult
    public static func claim(
        _ version: String = mine, build: String = myBuild
    ) -> WriterVerdict {
        let defaults = store
        let mark = defaults.string(forKey: markKey)
        let markBuild = defaults.string(forKey: buildKey)
        let verdict = writerCheckBuilt(mark, markBuild, version, build)
        readOnly = verdict == .readOnly
        if verdict == .write, parseVersion(version) != nil {
            if mark != version { wrote(version, forKey: markKey) }
            if markBuild != build, parseBuild(build) != nil { wrote(build, forKey: buildKey) }
        }
        // A build that finds a newer mark deletes nothing.
        if verdict == .write {
            for key in retiredKeys where defaults.object(forKey: key) != nil {
                if retiredCookKeys.contains(key) { retiredCook = true }
                defaults.removeObject(forKey: key, Pass())
                #if DEBUG
                Screenshots.log(.swept(key: key))
                #endif
            }
        }
        #if DEBUG
        Screenshots.log(.stores(verdict: verdict.rawValue, mark: mark, markBuild: markBuild, version: version, build: build))
        #endif
        return verdict
    }

    public static func set(_ value: Any?, forKey key: String) {
        guard !readOnly else { return }
        wrote(value, forKey: key)
    }

    /// Every write to the store, here, and to the debug log: the scripted
    /// checks hold the store to what the log says was written.
    private static func wrote(_ value: Any?, forKey key: String) {
        store.set(value, forKey: key, Pass())
        Screenshots.log(.wrote(key: key, number: (value as? NSNumber)?.doubleValue, text: value as? String))
    }

    public static func remove(_ key: String) {
        guard !readOnly else { return }
        store.removeObject(forKey: key, Pass())
    }
}

/// UserDefaults' reads, and its writes with a `Stores.Pass`: what the app
/// keeps, as the logic reaches it (`Stores.store`), so a test can give it a
/// store of its own.
public protocol KeyValueStore: AnyObject {
    func object(forKey key: String) -> Any?
    func string(forKey key: String) -> String?
    func double(forKey key: String) -> Double
    func bool(forKey key: String) -> Bool
    func data(forKey key: String) -> Data?
    func dictionary(forKey key: String) -> [String: Any]?
    /// Writes, which only `Stores` can make.
    func set(_ value: Any?, forKey key: String, _ pass: Stores.Pass)
    func removeObject(forKey key: String, _ pass: Stores.Pass)
}

extension UserDefaults: KeyValueStore {
    public func set(_ value: Any?, forKey key: String, _ pass: Stores.Pass) { set(value, forKey: key) }
    public func removeObject(forKey key: String, _ pass: Stores.Pass) { removeObject(forKey: key) }
}

/// Where a boil memory is kept. How the numbers combine is `rememberBoil` and
/// `estimateTimeToBoil` in the core.
public enum BoilMemories {
    private static let key = "boilMemory"

    public static func load() -> BoilMemory {
        (Stores.store.dictionary(forKey: key) as? BoilMemory) ?? [:]
    }

    public static func save(_ memory: BoilMemory) {
        Stores.set(memory, forKey: key)
    }

    /// Forget every measured pan. Paired with the calibration reset: someone
    /// taking their learning back usually means the whole kitchen.
    public static func reset() {
        Stores.remove(key)
    }
}

/// The inputs, remembered between launches: one value, core's `AppSettings`,
/// as JSON under one key, read by core's `readSettings`, which the web reads
/// its own with. Nobody wants to re-enter their altitude every morning.
public enum SettingsStore {
    public static let key = "settings.v1"

    /// The settings as last read or written: what a save of some fields is
    /// laid over, so the rest stay as they were.
    @MainActor private static var saved = AppSettings.defaults

    /// What is stored, read against the size table in use.
    @MainActor
    public static func read(classes: [SizeClass]) -> AppSettings {
        let raw = Stores.store.data(forKey: key).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        saved = readSettings(raw, classes: classes)
        return saved
    }

    /// Only the settings a correction changed, for the next cook
    /// (design/one-screen.md section 7, 22): the rest stay as they were, and
    /// a level the slider only previewed after the pull is never written.
    @MainActor
    public static func save(_ planner: Planner, fields: Set<ControlField>, level: Double) {
        var now = planner.settings
        now.doneness = level
        var next = saved
        for field in fields { next.take(field, from: now) }
        write(next)
    }

    /// The settings as they stand. A sous-vide is never remembered - its
    /// answer is a start time most of a day in the past - and is not in
    /// them: the pan saved before it stays saved.
    @MainActor
    public static func save(_ planner: Planner) {
        write(planner.settings)
    }

    @MainActor
    private static func write(_ s: AppSettings) {
        saved = s
        guard let data = try? JSONSerialization.data(withJSONObject: s.jsonObject, options: [.sortedKeys]) else { return }
        Stores.set(data, forKey: key)
    }
}

