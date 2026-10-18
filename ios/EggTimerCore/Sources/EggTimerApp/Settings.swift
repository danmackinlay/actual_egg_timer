import Foundation
import EggTimerCore

/// The settings as this app keeps them (`StoreRegistry.settings`): one
/// value, Codable, and the one reader of a stored copy (`readSettings`),
/// which takes the default for a field not stored.
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
}

extension AppSettings: Codable {
    /// What is stored, read: the default for a field not there, and a number
    /// clamped to its bounds. A field there but not of its kind fails the
    /// read, which is then the defaults (`readSettings`).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = AppSettings.defaults
        func number(_ key: CodingKeys, _ range: ClosedRange<Double>, _ fallback: Double) throws -> Double {
            clamp(try c.decodeIfPresent(Double.self, forKey: key) ?? fallback, to: range)
        }
        func blankable(_ key: CodingKeys, _ range: ClosedRange<Double>) throws -> Double? {
            try c.decodeIfPresent(Double.self, forKey: key).map { clamp($0, to: range) }
        }
        sizeIndex = try c.decodeIfPresent(Int.self, forKey: .sizeIndex) ?? d.sizeIndex
        weighedMassG = try number(.weighedMassG, Limits.massG, d.weighedMassG)
        startTempMode = try c.decodeIfPresent(EggFrom.self, forKey: .startTempMode) ?? d.startTempMode
        customStartC = try number(.customStartC, Limits.eggTempC, d.customStartC)
        altitudeM = try number(.altitudeM, Limits.altitudeM, d.altitudeM)
        startMode = try c.decodeIfPresent(StartMode.self, forKey: .startMode) ?? d.startMode
        afterBoil = try c.decodeIfPresent(HeatAfterBoil.self, forKey: .afterBoil) ?? d.afterBoil
        cooling = try c.decodeIfPresent(Cooling.self, forKey: .cooling) ?? d.cooling
        tapWaterC = try blankable(.tapWaterC, Limits.coolingWaterC)
        bowlLitres = try number(.bowlLitres, Limits.bowlLitres, d.bowlLitres)
        bowlWaterC = try blankable(.bowlWaterC, Limits.coolingWaterC)
        waterLitres = try number(.waterLitres, Limits.waterLitres, d.waterLitres)
        let eggs = try c.decodeIfPresent(Int.self, forKey: .eggCount) ?? d.eggCount
        eggCount = Int(clamp(Double(eggs), to: Limits.eggCount))
        doneness = try number(.doneness, Limits.doneness, d.doneness)
        unitsChosen = try c.decodeIfPresent(UnitSystem.self, forKey: .unitsChosen)
        probe = try c.decodeIfPresent(Bool.self, forKey: .probe) ?? d.probe
        roomC = try blankable(.roomC, Limits.roomC)
    }
}

/// The settings as stored, read against `classes`, the size table in use
/// now (which need not be the one they were saved against): the defaults
/// for nothing stored, a store in another format, or one that does not
/// decode.
func readSettings(_ data: Data?, classes: [SizeClass]) -> AppSettings {
    var s = data.flatMap { decodeStamped(StoreRegistry.settings, AppSettings.self, from: $0) } ?? .defaults
    s.sizeIndex = carrySizeIndex(s.sizeIndex, classes: classes)
    return s
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
func carrySizeIndex(_ stored: Int, classes: [SizeClass]) -> Int {
    stored < 0 ? -1 : min(stored, classes.count - 1)
}
