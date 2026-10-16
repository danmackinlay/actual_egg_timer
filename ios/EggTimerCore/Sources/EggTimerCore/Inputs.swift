import Foundation

/// What a cook types, drags or picks before a cook, and what a fresh install
/// starts from: the bounds on every number, the defaults, what the
/// egg-temperature buttons mean, the room the model is told about, and a
/// stored size read against the table in use. Transliterated from
/// `src/core/inputs.ts`, and held to it by `fixtures/inputs.json`.
///
/// Pure, like the rest of this package: no UserDefaults, no SwiftUI, no clock.

// MARK: - Bounds

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
/// own, as they gave it beside "at room temperature" or in Settings, with or
/// without a probe thermometer. inputs.ts says why. Clamped, like everything
/// typed or stored.
public func roomInUse(roomC: Double?) -> Double? {
    guard let roomC, roomC.isFinite else { return nil }
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
