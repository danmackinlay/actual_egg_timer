import Foundation

/// The twin of `src/core/inputs.ts`, held to it by `fixtures/inputs.json`; the
/// TypeScript's comments say what each part is for. Its `Limit` is a
/// `ClosedRange<Double>` here.

// MARK: - Bounds

/// A non-finite value is not a reading at all, so it pins to the floor rather
/// than propagating.
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

public func startTempPresetC(_ preset: StartTempPreset, roomC: Double?) -> Double {
    switch preset {
    case .fridge: StartTempPresets.fridgeC
    case .room: roomC ?? StartTempPresets.roomC
    }
}

public func roomInUse(roomC: Double?) -> Double? {
    guard let roomC, roomC.isFinite else { return nil }
    return clamp(roomC, to: Limits.roomC)
}

public func ambientFor(eggStartC: Double, roomC: Double?) -> Double {
    if let roomC { return roomC }
    return eggStartC >= roomEggFromC ? eggStartC : Constants.tRoomC
}
