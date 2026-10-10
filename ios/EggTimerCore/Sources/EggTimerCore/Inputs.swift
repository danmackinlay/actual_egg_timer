import Foundation

/// What a cook types, drags or picks before a cook, and what a fresh install
/// starts from: the bounds on every number, the defaults, what the
/// egg-temperature buttons mean, the room the model is told about, and a
/// stored size read against the table in use. Transliterated from
/// `src/core/inputs.ts`, and held to it by `fixtures/inputs.json`.
///
/// Pure, like the rest of this package: no UserDefaults, no SwiftUI, no clock.

// MARK: - Bounds

/// Bounds on every number a user can type or drag, in one place. They go onto
/// the controls, onto what is typed, and onto what comes back out of storage,
/// so the three cannot drift apart - and now they cannot drift between the two
/// apps either.
public enum Limits {
    /// Hens' eggs: an EU XL is 73 g and up, most under 80; above 90 is a
    /// double-yolker or another bird, which this model does not describe.
    public static let massG = 25.0...90.0
    /// A measured egg's minor diameter, mm: the web's measured egg.
    public static let minorMm = 30.0...60.0
    public static let eggTempC = -2.0...40.0
    /// A kitchen's air, measured with the probe (the room setting): colder
    /// than 5 C is a cellar, hotter than 40 C a kitchen nobody cooks in.
    public static let roomC = 5.0...40.0
    public static let altitudeM = -400.0...5000.0
    public static let waterLitres = 0.25...12.0
    public static let eggCount = 1.0...24.0
    public static let doneness = 0.0...1.0
    /// Across every table. The table in use is shorter than this outside the
    /// US, so a stored index also goes through `carrySizeIndex`.
    public static let sizeIndex = -1.0...Double(max(sizeClasses.count, usSizeClasses.count) - 1)
    /// A tap under half a minute is a double tap, not a boil; over two hours is
    /// an app left open.
    public static let timeToBoilS = 30.0...7200.0
}

/// Clamp a number that is already a number. A non-finite value is not a reading
/// at all, so it pins to the floor rather than propagating.
public func clamp(_ value: Double, to range: ClosedRange<Double>) -> Double {
    guard value.isFinite else { return range.lowerBound }
    return min(range.upperBound, max(range.lowerBound, value))
}

func isWithin(_ value: Double, _ range: ClosedRange<Double>) -> Bool {
    value.isFinite && range.contains(value)
}

// MARK: - Defaults

/// What the two named egg-temperature buttons mean, C, when the room has not
/// been measured. Both platforms label the buttons from `startTempPresetC`,
/// so a button cannot say one thing and the model another.
public enum StartTempPresets {
    public static let fridgeC = 4.0
    public static let roomC = Constants.tRoomC
}

/// The two named egg-temperature buttons.
public enum StartTempPreset: String, Sendable {
    case fridge, room
}

/// What an egg-temperature button means, C, given the room as measured, or
/// nil when it has not been (`roomInUse`). An egg that has been sitting out is
/// at the room's temperature, so a measured room moves the Room button with
/// it; a fridge is a fridge.
public func startTempPresetC(_ preset: StartTempPreset, roomC: Double?) -> Double {
    switch preset {
    case .fridge: StartTempPresets.fridgeC
    case .room: roomC ?? StartTempPresets.roomC
    }
}

/// The room the model is told about, C, or nil to assume one: the cook's
/// measured room, from Settings, which is offered - and so counts - only while
/// they have said they have a probe thermometer; without one the room is
/// assumed. A setting out of sight changes nothing.
/// Clamped, like everything typed or stored.
public func roomInUse(probe: Bool, roomC: Double?) -> Double? {
    guard probe, let roomC, roomC.isFinite else { return nil }
    return clamp(roomC, to: Limits.roomC)
}

/// The room, as far as the model is concerned, given the egg's start and the
/// room as measured (`roomInUse`), or nil.
///
/// A measured room is the room. Without one: on the default path - eggs into
/// boiling water, straight into an ice bath - the room is worth nothing at
/// all, and on a cold start about two seconds per degree. It earns its keep
/// resting on the counter and standing with the heat off, and in both the user
/// has usually already said: an egg that has been sitting out IS at room
/// temperature. A fridge egg says nothing about the room, so that case keeps
/// the default.
public func ambientFor(eggStartC: Double, roomC: Double?) -> Double {
    if let roomC { return roomC }
    return eggStartC >= roomEggFromC ? eggStartC : Constants.tRoomC
}

/// An egg at or above this, C, has been sitting out, and is the room's
/// temperature; below it, it is a fridge egg and says nothing about the room.
public let roomEggFromC = 15.0

/// The inputs a fresh install starts from. Both apps read these, because two
/// apps that answer differently out of the box are two different answers to the
/// same question - which is exactly what 4 eggs of 62.3 g here against 2 eggs of
/// 68 g on the web amounted to.
public enum Defaults {
    /// Index into the region's size classes - 'Large' in both tables, 68 g in
    /// the EU one and 60.2 g on an American carton.
    public static let sizeIndex = 2
    /// The web's measured egg, mm.
    public static let customMinorMm = 44.0
    public static let customStartC = 12.0
    public static let altitudeM = 0.0
    public static let waterLitres = 2.0
    public static let eggCount = 2
    public static let doneness = 0.41
    /// The reference egg, an EU Large. The app takes its default from the
    /// region's table, `sizeClassesFor(region:)[sizeIndex]`. Derived rather
    /// than restated, so the size class and the mass can never disagree.
    public static let eggMassKg = sizeClasses[sizeIndex].massKg
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
public func carrySizeIndex(_ stored: Double, classes: [SizeClass]) -> Int {
    guard stored.isFinite else { return Defaults.sizeIndex }
    // Negatives first, so rounding never has to settle -0.5: Swift rounds that
    // tie away from zero and JavaScript towards +infinity.
    if stored < 0 { return -1 }
    return min(Int(stored.rounded()), classes.count - 1)
}
