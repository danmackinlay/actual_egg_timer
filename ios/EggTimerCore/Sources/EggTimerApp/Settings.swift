import Foundation
import EggTimerCore

/// The settings as this app keeps them (`StoreRegistry.settings`): one
/// value, and the one reader of a stored copy (`readSettings`), which checks
/// every field and takes the default for anything missing or malformed.
/// `AppSettings`, since SwiftUI has a `Settings`. The web keeps its own
/// (`src/ui/settings.ts`), with a measured egg and a mute this app has not;
/// this app's weighed egg is its own. The language and the alarm's sound are
/// kept under keys of their own (`LanguageChoice`, `AlarmSoundChoice`).
public struct AppSettings: Sendable, Equatable {
    /// Index into the region's size classes, or -1 for an egg weighed. Stored
    /// without the region: see `carrySizeIndex`.
    public var sizeIndex: Int
    /// The weighed egg, g: what the mass slider says, kept while a class is
    /// chosen, so that choosing Weighed again goes back to it.
    public var weighedMassG: Double
    /// Where the egg comes from, and its temperature when it is `custom`.
    public var startTempMode: EggFrom
    public var customStartC: Double
    public var altitudeM: Double
    /// A pan: a sous-vide is never stored.
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    /// Running water's temperature as the cook gave it, C, or nil to assume
    /// mains water.
    public var tapWaterC: Double?
    /// The bowl's water, litres, and its temperature as the cook gave it, C,
    /// or nil to assume the room. Kept while another cooling is chosen.
    public var bowlLitres: Double
    public var bowlWaterC: Double?
    public var waterLitres: Double
    public var eggCount: Int
    /// Doneness slider position, [0, 1].
    public var doneness: Double
    /// Metric or Imperial as the cook chose it, or nil if they never have:
    /// not the system on screen, so a default is never stored as a choice.
    public var unitsChosen: UnitSystem?
    /// "I have a probe thermometer": ask for a reading at the middle of the
    /// egg when the cooling ends.
    public var probe: Bool
    /// The room as the cook gave it, C, or nil to assume one (`roomInUse`).
    public var roomC: Double?

    /// What a fresh install starts from.
    public static let defaults = AppSettings(
        sizeIndex: Defaults.sizeIndex, weighedMassG: Defaults.eggMassKg * 1000, startTempMode: .fridge,
        customStartC: Defaults.customStartC, altitudeM: Defaults.altitudeM, startMode: .cold, afterBoil: .hold,
        cooling: .ice, tapWaterC: nil, bowlLitres: Defaults.bowlLitres, bowlWaterC: nil,
        waterLitres: Defaults.waterLitres, eggCount: Defaults.eggCount, doneness: Defaults.doneness, unitsChosen: nil,
        probe: false, roomC: nil
    )

    /// As it is stored, for JSONSerialization: what `readSettings` reads
    /// back. An absent value is JSON's null.
    var jsonObject: [String: Any] {
        [
            "sizeIndex": sizeIndex, "weighedMass_g": weighedMassG, "startTempMode": startTempMode.rawValue,
            "customStart_C": customStartC, "altitude_m": altitudeM, "startMode": startMode.rawValue,
            "afterBoil": afterBoil.rawValue, "cooling": cooling.rawValue, "tapWater_C": tapWaterC ?? NSNull(),
            "bowlLitres": bowlLitres, "bowlWater_C": bowlWaterC ?? NSNull(), "waterLitres": waterLitres,
            "eggCount": eggCount, "doneness": doneness, "unitsChosen": unitsChosen?.rawValue ?? NSNull(),
            "probe": probe, "room_C": roomC ?? NSNull(),
        ]
    }
}

private func isBool(_ v: Any?) -> Bool {
    guard let n = v as? NSNumber else { return false }
    return CFGetTypeID(n) == CFBooleanGetTypeID()
}

/// A stored number within `range`, or `fallback` for anything that is not a
/// finite number.
private func storedNumber(_ v: Any?, _ range: ClosedRange<Double>, _ fallback: Double) -> Double {
    guard !isBool(v), let n = v as? NSNumber, n.doubleValue.isFinite else { return fallback }
    return clamp(n.doubleValue, to: range)
}

private func storedFlag(_ v: Any?) -> Bool {
    isBool(v) && (v as? NSNumber)?.boolValue == true
}

/// A stored number within `range`, or nil for anything that is not a finite
/// number: an optional number left blank.
private func storedOptional(_ v: Any?, _ range: ClosedRange<Double>) -> Double? {
    guard !isBool(v), let n = v as? NSNumber, n.doubleValue.isFinite else { return nil }
    return clamp(n.doubleValue, to: range)
}

/// A stored value that is one of `T`'s, or `fallback`.
private func oneOf<T: RawRepresentable>(_ v: Any?, _ fallback: T) -> T where T.RawValue == String {
    (v as? String).flatMap(T.init(rawValue:)) ?? fallback
}

/// The settings as stored, read against `classes`, the size table in use
/// now (which need not be the one they were saved against): each field
/// checked, a number clamped to its bounds, and the default for anything
/// missing or not what it should be. A stored `"sous"`, from before a
/// sous-vide stopped being saved, is the default pan.
func readSettings(_ raw: Any?, classes: [SizeClass]) -> AppSettings {
    let d = AppSettings.defaults
    guard let r = raw as? [String: Any] else { return d }
    return AppSettings(
        sizeIndex: carrySizeIndex(storedNumber(r["sizeIndex"], Limits.sizeIndex, Double(d.sizeIndex)), classes: classes),
        weighedMassG: storedNumber(r["weighedMass_g"], Limits.massG, d.weighedMassG),
        startTempMode: oneOf(r["startTempMode"], d.startTempMode),
        customStartC: storedNumber(r["customStart_C"], Limits.eggTempC, d.customStartC),
        altitudeM: storedNumber(r["altitude_m"], Limits.altitudeM, d.altitudeM),
        startMode: oneOf(r["startMode"], d.startMode),
        afterBoil: oneOf(r["afterBoil"], d.afterBoil),
        cooling: oneOf(r["cooling"], d.cooling),
        tapWaterC: storedOptional(r["tapWater_C"], Limits.coolingWaterC),
        bowlLitres: storedNumber(r["bowlLitres"], Limits.bowlLitres, d.bowlLitres),
        bowlWaterC: storedOptional(r["bowlWater_C"], Limits.coolingWaterC),
        waterLitres: storedNumber(r["waterLitres"], Limits.waterLitres, d.waterLitres),
        eggCount: Int(storedNumber(r["eggCount"], Limits.eggCount, Double(d.eggCount)).rounded()),
        doneness: storedNumber(r["doneness"], Limits.doneness, d.doneness),
        unitsChosen: readChosenUnits(r["unitsChosen"]),
        probe: storedFlag(r["probe"]),
        roomC: storedOptional(r["room_C"], Limits.roomC)
    )
}

/// A stored choice of units, or nil for none: anything else is not one.
func readChosenUnits(_ raw: Any?) -> UnitSystem? {
    guard let string = raw as? String else { return nil }
    return UnitSystem(rawValue: string)
}

/// A stored size index, read against the table in use now.
///
/// An index means something only inside one table, and the table can change
/// underneath a stored record: the phone's region changes, or - the case that
/// matters - a record saved before there were two tables is read by an
/// American. The index keeps its NAME. A cook who picked Large picked the word
/// on their carton, and the region says whose carton it is, so a Large stays a
/// Large and cooks at the new table's mass. Keeping the mass instead would leave
/// every American who never touched the control on the EU Large.
///
/// Both tables hold the same names at the same indices as far as the shorter
/// goes, so keeping the name is keeping the index. A Jumbo read outside the US
/// becomes Extra large. A weighed egg (-1) is weighed in any region.
func carrySizeIndex(_ stored: Double, classes: [SizeClass]) -> Int {
    guard stored.isFinite else { return Defaults.sizeIndex }
    // Negatives first: any is a weighed egg, and -0.5 never reaches
    // `rounded()`, which takes that tie away from zero.
    if stored < 0 { return -1 }
    return min(Int(stored.rounded()), classes.count - 1)
}
