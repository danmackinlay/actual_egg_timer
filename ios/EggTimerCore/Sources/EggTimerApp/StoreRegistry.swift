import Foundation

/// Every store this app keeps, in one table: its name, the key it is kept
/// under in the app's suite of UserDefaults (`Stores.suite`), and the
/// format of what is kept there. The web keeps its own table
/// (`src/ui/stores.ts`).
///
/// The format is written inside what is stored, as `v` (`stamped`), and a
/// reader takes a store only in its own format (`inFormat`): anything else
/// reads as nothing stored, and the app's next write replaces it. So a
/// change of shape is one number bumped here, and the key stays. Before wide
/// deployment a bump is all a change of format needs;
/// nothing is migrated. A store with no format inside it (`format` nil) is
/// a bare value read by its own reader (the alarm's sound), or one whose key
/// still names its format, sharing's, where a change is a new key. The log has its format inside and keeps the
/// key it was first written under.
///
/// The app keeps only what is listed here: at launch it deletes every key in
/// the suite that no store here is kept under (`Stores.sweep`).
public struct StoreSpec: Sendable, Equatable {
    public let name: String
    /// The format of what it holds, written inside as `v`; nil for a store
    /// with none inside it.
    public let format: Int?
    public let key: String
}

public enum StoreRegistry {
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
        settings, cook, boilMemory, calibration, share, shareAttest, languageState, alarmSound,
    ]
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
