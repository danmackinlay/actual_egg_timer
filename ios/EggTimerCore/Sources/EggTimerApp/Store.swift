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
/// Every write the app makes to its stores goes through `set` and `remove`,
/// and each is in the debug log, which the scripted checks hold the store
/// to: the store (`store`, the app's suite of UserDefaults, a fake in the
/// tests) takes a write only with a `Pass`, which only this file can make.
/// Reads go straight to the store. `sweep` runs first thing at launch,
/// before anything is written.
public enum Stores {
    /// The app's own suite of UserDefaults, apart from the standard domain,
    /// where the system keeps what is its own of the app (the language the
    /// cook chose for it, `AppleLanguages`): only `Stores` writes to the
    /// suite, so every key in it is the app's.
    public static let suite = "name.danmackinlay.actualeggtimer.stores"

    /// Where everything is kept: the suite in the app; a test's own.
    /// Unsafe, but set only at launch, or by a test before it runs anything.
    nonisolated(unsafe) public static var store: any KeyValueStore = Suite(suite)

    /// What a write to the store needs, and only `Stores` can make: so no
    /// write reaches the store except through `set` and `remove`.
    public struct Pass: Sendable {
        fileprivate init() {}
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

    /// Delete every key in the store that no store of this build is kept
    /// under (`StoreRegistry`): what an earlier build wrote, which nothing
    /// would read or collect. The store's own keys, never the standard
    /// domain's.
    public static func sweep() {
        let defaults = store
        let kept = Set(StoreRegistry.all.map(\.key))
        for key in defaults.keys.sorted() where !kept.contains(key) {
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

/// A store's reads, and its writes with a `Stores.Pass`: what the app keeps,
/// as the logic reaches it (`Stores.store`), so a test can give it a store
/// of its own.
public protocol KeyValueStore: AnyObject {
    /// The keys written to the store, and no others: what the sweep reads.
    var keys: [String] { get }
    func object(forKey key: String) -> Any?
    func string(forKey key: String) -> String?
    func double(forKey key: String) -> Double
    func bool(forKey key: String) -> Bool
    func data(forKey key: String) -> Data?
    /// Writes, which only `Stores` can make.
    func set(_ value: Any?, forKey key: String, _ pass: Stores.Pass)
    func removeObject(forKey key: String, _ pass: Stores.Pass)
}

/// A suite of UserDefaults as a store, its own setters out of reach. A read
/// sees a launch argument of the same key over what is stored (the argument
/// domain), as a debug build's `-settings` relies on; never the standard
/// domain.
public final class Suite: KeyValueStore, @unchecked Sendable {
    public let name: String
    private let defaults: UserDefaults

    public init(_ name: String) {
        self.name = name
        // nil only for the app's bundle id or the global domain's name.
        defaults = UserDefaults(suiteName: name)!
    }

    /// The suite's persistent domain alone. Never
    /// `dictionaryRepresentation()`, which reads through to the argument,
    /// global and registration domains, and so to the launch's keys and
    /// Apple's.
    public var keys: [String] { defaults.persistentDomain(forName: name).map { Array($0.keys) } ?? [] }
    public func object(forKey key: String) -> Any? { defaults.object(forKey: key) }
    public func string(forKey key: String) -> String? { defaults.string(forKey: key) }
    public func double(forKey key: String) -> Double { defaults.double(forKey: key) }
    public func bool(forKey key: String) -> Bool { defaults.bool(forKey: key) }
    public func data(forKey key: String) -> Data? { defaults.data(forKey: key) }
    public func set(_ value: Any?, forKey key: String, _ pass: Stores.Pass) { defaults.set(value, forKey: key) }
    public func removeObject(forKey key: String, _ pass: Stores.Pass) { defaults.removeObject(forKey: key) }
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

    /// Only the settings a correction changed, `groups`, so the next cook
    /// starts from what was done, not from the mistake, and the settings no
    /// group makes (the thermometer) as they stand: the rest stay as they
    /// were, and a level the slider only previewed after the pull is never
    /// written.
    @MainActor
    public static func save(_ planner: Planner, groups: Set<HandGroup>) {
        let now = planner.settings
        var next = saved
        for group in groups { next.take(group, from: now) }
        next.takeNoGroup(from: now)
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

