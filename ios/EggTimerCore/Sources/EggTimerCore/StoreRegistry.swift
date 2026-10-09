import Foundation

/// Every store either app keeps, in one table: its name, the key each app
/// keeps it under, and the format of what is kept there.
///
/// Transliterated from `src/core/stores.ts`, whose comments say why, and held
/// to it by `fixtures/stores.json`. The format is written inside what is
/// stored, as `v` (`stamped`), and a reader takes a store only in its own
/// format (`inFormat`); a store with none inside it has `format` nil.

public struct StoreSpec: Sendable, Equatable {
    public let name: String
    /// The format of what it holds, written inside as `v`; nil for a store
    /// with none inside it.
    public let format: Int?
    /// The key on the web and on iOS; nil where that app does not keep it.
    public let web: String?
    public let ios: String?
}

public enum StoreRegistry {
    /// The newest version that has run, and its build: under these keys for
    /// good, since an older build must find them.
    public static let newest = StoreSpec(name: "newest", format: nil, web: "aet.newest", ios: "newestVersion")
    public static let newestBuild = StoreSpec(name: "newestBuild", format: nil, web: nil, ios: "newestBuild")
    public static let settings = StoreSpec(name: "settings", format: 1, web: "aet.settings", ios: "settings")
    public static let cook = StoreSpec(name: "cook", format: 6, web: "aet.cook", ios: "cook")
    public static let boilMemory = StoreSpec(name: "boilMemory", format: 1, web: "aet.boilMemory", ios: "boilMemory")
    public static let calibration = StoreSpec(
        name: "calibration", format: 5, web: "aet.calibration.v5", ios: "calibration.v5"
    )
    public static let share = StoreSpec(name: "share", format: nil, web: "aet.share.v1", ios: "sharing.v1")
    public static let shareAttest = StoreSpec(name: "shareAttest", format: nil, web: nil, ios: "sharing.attest.v2")
    public static let languageState = StoreSpec(name: "languageState", format: 1, web: nil, ios: "languageState")
    public static let alarmSound = StoreSpec(name: "alarmSound", format: nil, web: nil, ios: "alarmSound")
    public static let devClockUsed = StoreSpec(name: "devClockUsed", format: nil, web: "aet.devClock.used", ios: nil)

    /// The table in one order, as `STORE_LIST`.
    public static let all = [
        newest, newestBuild, settings, cook, boilMemory, calibration, share, shareAttest, languageState, alarmSound,
        devClockUsed,
    ]
}

/// What a store holds, stamped with its format.
public func stamped(_ store: StoreSpec, _ body: [String: Any]) -> [String: Any] {
    var o = body
    o["v"] = store.format
    return o
}

/// A stored value, parsed: the object itself if it is one in the store's
/// format, or nil for anything else, which reads as nothing stored.
public func inFormat(_ store: StoreSpec, _ raw: Any?) -> [String: Any]? {
    guard let format = store.format, let o = raw as? [String: Any], let v = o["v"] as? NSNumber,
          CFGetTypeID(v) != CFBooleanGetTypeID(), v.doubleValue == Double(format) else { return nil }
    return o
}
