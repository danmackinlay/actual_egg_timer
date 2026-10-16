import Foundation
import EggTimerCore

/// Persistence: UserDefaults in, UserDefaults out.
///
/// The BOUNDS and the blending rules are EggTimerCore's Policy, so the two apps
/// share one set, and one order: a Dictionary walked in whatever order it
/// likes would let two equidistant pans give the two apps different answers.
/// This file applies the rules; it does not decide them.

/// What the app keeps, and the sweep at launch.
///
/// Every write the app makes to UserDefaults goes through `set` and
/// `remove`, and each is in the debug log, which the scripted checks hold
/// the store to: `test/iosStores.test.ts` fails on any other write in the
/// source, and the store (`store`, UserDefaults in the app, a fake in the
/// tests) takes a write only with a `Pass`, which only this file can make.
/// Reads go straight to the store. `sweep` runs first thing at launch,
/// before anything is written.
public enum Stores {
    /// Where everything is kept: UserDefaults in the app; a test's own.
    /// Unsafe, but set only at launch, or by a test before it runs anything.
    nonisolated(unsafe) public static var store: any KeyValueStore = UserDefaults.standard

    /// What a write to the store needs, and only `Stores` can make: so no
    /// write reaches the store except through `set` and `remove`.
    public struct Pass: Sendable {
        fileprivate init() {}
    }

    /// The keys deleted at launch (`sweep`) rather than left on the phone
    /// being neither read nor collected: every key an earlier build wrote
    /// that no store of this build is kept under (`StoreRegistry`).
    static var sweptKeys: [String] {
        let kept = Set(StoreRegistry.all.map(\.key))
        return StoreRegistry.retired.filter { !kept.contains($0) }
    }

    /// Whether the sweep found an earlier build's cook in progress, until
    /// `takeRetiredCook` is asked: its Live Activity is still on the Lock
    /// Screen, and nothing will update it again. Unsafe, but written and
    /// read once each, at launch on the main actor (`sweep`, `Cook.restore`).
    nonisolated(unsafe) private static var retiredCook = false

    /// Once: whether the launch's sweep deleted an earlier build's cook.
    static func takeRetiredCook() -> Bool {
        defer { retiredCook = false }
        return retiredCook
    }

    /// Delete every key an earlier build wrote (`sweptKeys`).
    public static func sweep() {
        let defaults = store
        for key in sweptKeys where defaults.object(forKey: key) != nil {
            if StoreRegistry.retiredCooks.contains(key) { retiredCook = true }
            defaults.removeObject(forKey: key, Pass())
            Screenshots.log(.swept(key: key))
        }
    }

    public static func set(_ value: Any?, forKey key: String) {
        wrote(value, forKey: key)
    }

    /// Every write to the store, here, and to the debug log: the scripted
    /// checks hold the store to what the log says was written.
    private static func wrote(_ value: Any?, forKey key: String) {
        store.set(value, forKey: key, Pass())
        Screenshots.log(.wrote(key: key, number: (value as? NSNumber)?.doubleValue, text: value as? String))
    }

    public static func remove(_ key: String) {
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

/// Where a boil memory is kept: as the web keeps it, JSON in its format, the
/// pans under `pans`. How the numbers combine is `rememberBoil` and
/// `estimateTimeToBoil` in the core.
enum BoilMemories {
    private static let key = StoreRegistry.boilMemory.key

    static func load() -> BoilMemory {
        let raw = Stores.store.data(forKey: key).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        return (inFormat(StoreRegistry.boilMemory, raw)?["pans"] as? BoilMemory) ?? [:]
    }

    public static func save(_ memory: BoilMemory) {
        let stored = stamped(StoreRegistry.boilMemory, ["pans": memory])
        guard let data = try? JSONSerialization.data(withJSONObject: stored, options: [.sortedKeys]) else { return }
        Stores.set(data, forKey: key)
    }

    /// Forget every measured pan. Paired with the calibration reset: someone
    /// taking their learning back usually means the whole kitchen.
    public static func reset() {
        Stores.remove(key)
    }
}

/// The inputs, remembered between launches: one value, `AppSettings`, as
/// JSON under one key, read by `readSettings` (Settings.swift). Nobody wants
/// to re-enter their altitude every morning.
enum SettingsStore {
    public static let key = StoreRegistry.settings.key

    /// The settings as last read or written: what a save of some fields is
    /// laid over, so the rest stay as they were.
    @MainActor private static var saved = AppSettings.defaults

    /// What is stored, read against the size table in use.
    @MainActor
    public static func read(classes: [SizeClass]) -> AppSettings {
        let raw = Stores.store.data(forKey: key).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        saved = readSettings(inFormat(StoreRegistry.settings, raw), classes: classes)
        return saved
    }

    /// Only the settings a correction changed, so the next cook starts from
    /// what was done, not from the mistake: the rest stay as they were, and
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
        let stored = stamped(StoreRegistry.settings, s.jsonObject)
        guard let data = try? JSONSerialization.data(withJSONObject: stored, options: [.sortedKeys]) else { return }
        Stores.set(data, forKey: key)
    }
}

