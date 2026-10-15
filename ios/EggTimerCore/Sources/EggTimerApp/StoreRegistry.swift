import Foundation

/// Every store this app keeps, in one table: its name, the key it is kept
/// under in UserDefaults, and the format of what is kept there; and every
/// key an earlier build wrote. The web keeps its own table
/// (`src/ui/stores.ts`).
///
/// The format is written inside what is stored, as `v` (`stamped`), and a
/// reader takes a store only in its own format (`inFormat`): anything else
/// reads as nothing stored, and the app's next write replaces it. So a
/// change of shape is one number bumped here, and the key stays. Before wide
/// deployment (DECISIONS.md 48) a bump is all a change of format needs;
/// nothing is migrated. A store with no format inside it (`format` nil) is
/// a bare value read by its own reader (the newest-build mark and its build,
/// the alarm's sound), or one whose key still names its format, sharing's,
/// where a change is a new key. The log has its format inside and keeps the
/// key it was first written under.
///
/// The app keeps only what is listed here: once the newer-build guard says
/// this build may write, it deletes every key an earlier build wrote that no
/// store here is kept under (`Stores.claim`).
public struct StoreSpec: Sendable, Equatable {
    public let name: String
    /// The format of what it holds, written inside as `v`; nil for a store
    /// with none inside it.
    public let format: Int?
    public let key: String
}

public enum StoreRegistry {
    /// The newest version that has run, and its build: under these keys for
    /// good, since an older build must find them.
    public static let newest = StoreSpec(name: "newest", format: nil, key: "newestVersion")
    public static let newestBuild = StoreSpec(name: "newestBuild", format: nil, key: "newestBuild")
    /// The settings, one value (Settings.swift).
    public static let settings = StoreSpec(name: "settings", format: 1, key: "settings")
    /// The running cook (StoredCook.swift).
    public static let cook = StoreSpec(name: "cook", format: 7, key: "cook")
    /// The pans' measured times to boil, as `pans`.
    public static let boilMemory = StoreSpec(name: "boilMemory", format: 1, key: "boilMemory")
    /// The results log, the posterior and the base under it.
    public static let calibration = StoreSpec(name: "calibration", format: 5, key: "calibration.v5")
    /// Sharing's state (ShareQueue.swift), and the App Attest key: their
    /// formats in their keys.
    public static let share = StoreSpec(name: "share", format: nil, key: "sharing.v1")
    public static let shareAttest = StoreSpec(name: "shareAttest", format: nil, key: "sharing.attest.v2")
    /// The language and the alarm's sound, apart from the settings.
    public static let languageState = StoreSpec(name: "languageState", format: 1, key: "languageState")
    public static let alarmSound = StoreSpec(name: "alarmSound", format: nil, key: "alarmSound")

    /// The table in one order, for the sweep.
    static let all = [
        newest, newestBuild, settings, cook, boilMemory, calibration, share, shareAttest, languageState, alarmSound,
    ]

    /// Every key an earlier build wrote: the posteriors before the log
    /// (`v1`-`v3`), the log of 0.3 and 0.4 (`v4`; the log starts fresh in
    /// 0.5, DECISIONS.md 107), the copies 0.4 kept aside of what it could not
    /// read, the cooks in progress before this one's shape, the sharing keys
    /// of an earlier 0.4 build, settings no build reads any more, the
    /// settings a key each among them, sharing's key kept with its dates as
    /// seconds since 2001, and 0.5's keys with a format in them, from before
    /// the table of stores.
    static let retired = [
        "calibration.v1", "calibration.v2", "calibration.v3", "calibration.v4", "calibration.v4.unread",
        "cookInProgress", "cookInProgress.v2", "cookInProgress.v3", "cookInProgress.v4", "cookInProgress.unread",
        "settings.v1",
        "share.v1", "share.attest.v1", "sharing.attest.v1", "coldStart", "fromFridge", "eggMassG", "probeAsked",
        // The settings before they were one value (`SettingsStore`).
        "doneness", "weighedMassG", "sizeIndex", "altitudeM", "waterLitres", "eggCount", "startTemp",
        "customStartC", "start", "heatOff", "cooling", "probe", "roomC", "unitsChosen",
    ]

    /// The keys where an earlier build kept its cook in progress.
    static let retiredCooks: Set<String> = ["cookInProgress", "cookInProgress.v2", "cookInProgress.v3", "cookInProgress.v4"]
}

/// What a store holds, stamped with its format.
func stamped(_ store: StoreSpec, _ body: [String: Any]) -> [String: Any] {
    var o = body
    o["v"] = store.format
    return o
}

/// A stored value, parsed: the object itself if it is one in the store's
/// format, or nil for anything else, which reads as nothing stored.
func inFormat(_ store: StoreSpec, _ raw: Any?) -> [String: Any]? {
    guard let format = store.format, let o = raw as? [String: Any], let v = o["v"] as? NSNumber,
          CFGetTypeID(v) != CFBooleanGetTypeID(), v.doubleValue == Double(format) else { return nil }
    return o
}
