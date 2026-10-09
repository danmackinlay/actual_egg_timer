import Foundation

/// The settings, as both apps keep them: one value, and the one reader of a
/// stored copy (`readSettings`). Transliterated from `src/core/settings.ts`,
/// whose comments say what each field is, and held to it by
/// `fixtures/settings.json`. `AppSettings` here, since SwiftUI has a
/// `Settings`.
///
/// A few fields are one app's alone, and the other carries them untouched:
/// the web's measured egg (`customMinorMm`, `measuredBy`) and its mute, and
/// this app's weighed egg (`weighedMassG`). This app keeps the language and
/// the alarm's sound under keys of their own (`LanguageChoice`,
/// `AlarmSoundChoice`) and reads them from there.

/// Which of the web's three measurement boxes a measured egg came from.
public enum MeasuredBy: String, Sendable {
    case scale, girth, width
}

public struct AppSettings: Sendable, Equatable {
    public var sizeIndex: Int
    public var customMinorMm: Double
    public var measuredBy: MeasuredBy
    public var weighedMassG: Double
    public var startTempMode: EggFrom
    public var customStartC: Double
    public var altitudeM: Double
    /// A pan: a sous-vide is never stored.
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    public var waterLitres: Double
    public var eggCount: Int
    public var doneness: Double
    public var muted: Bool
    public var alarm: AlarmSound
    public var unitsChosen: UnitSystem?
    public var language: LanguageState
    public var probe: Bool
    public var roomC: Double?

    /// What a fresh install starts from.
    public static let defaults = AppSettings(
        sizeIndex: Defaults.sizeIndex, customMinorMm: Defaults.customMinorMm, measuredBy: .scale,
        weighedMassG: Defaults.eggMassKg * 1000, startTempMode: .fridge, customStartC: Defaults.customStartC,
        altitudeM: Defaults.altitudeM, startMode: .cold, afterBoil: .hold, cooling: .ice,
        waterLitres: Defaults.waterLitres, eggCount: Defaults.eggCount, doneness: Defaults.doneness, muted: false,
        alarm: defaultAlarmSound, unitsChosen: nil, language: .fresh, probe: false, roomC: nil
    )

    public init(
        sizeIndex: Int, customMinorMm: Double, measuredBy: MeasuredBy, weighedMassG: Double, startTempMode: EggFrom,
        customStartC: Double, altitudeM: Double, startMode: StartMode, afterBoil: HeatAfterBoil, cooling: Cooling,
        waterLitres: Double, eggCount: Int, doneness: Double, muted: Bool, alarm: AlarmSound,
        unitsChosen: UnitSystem?, language: LanguageState, probe: Bool, roomC: Double?
    ) {
        self.sizeIndex = sizeIndex
        self.customMinorMm = customMinorMm
        self.measuredBy = measuredBy
        self.weighedMassG = weighedMassG
        self.startTempMode = startTempMode
        self.customStartC = customStartC
        self.altitudeM = altitudeM
        self.startMode = startMode
        self.afterBoil = afterBoil
        self.cooling = cooling
        self.waterLitres = waterLitres
        self.eggCount = eggCount
        self.doneness = doneness
        self.muted = muted
        self.alarm = alarm
        self.unitsChosen = unitsChosen
        self.language = language
        self.probe = probe
        self.roomC = roomC
    }

    /// As the web stores it, for JSONSerialization: what `readSettings`
    /// reads back.
    public var jsonObject: [String: Any] {
        [
            "sizeIndex": sizeIndex, "customMinor_mm": customMinorMm, "measuredBy": measuredBy.rawValue,
            "weighedMass_g": weighedMassG, "startTempMode": startTempMode.rawValue, "customStart_C": customStartC,
            "altitude_m": altitudeM, "startMode": startMode.rawValue, "afterBoil": afterBoil.rawValue,
            "cooling": cooling.rawValue, "waterLitres": waterLitres, "eggCount": eggCount, "doneness": doneness,
            "muted": muted, "alarm": alarm.rawValue, "unitsChosen": unitsChosen?.rawValue ?? NSNull(),
            "language": language.jsonObject, "probe": probe, "room_C": roomC ?? NSNull(),
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

/// A stored value that is one of `T`'s, or `fallback`.
private func oneOf<T: RawRepresentable>(_ v: Any?, _ fallback: T) -> T where T.RawValue == String {
    (v as? String).flatMap(T.init(rawValue:)) ?? fallback
}

/// The settings as stored, read against `classes`, the size table in use
/// now. See `readSettings` in `src/core/settings.ts`.
public func readSettings(_ raw: Any?, classes: [SizeClass]) -> AppSettings {
    let d = AppSettings.defaults
    guard let r = raw as? [String: Any] else { return d }
    let room = r["room_C"]
    return AppSettings(
        sizeIndex: carrySizeIndex(storedNumber(r["sizeIndex"], Limits.sizeIndex, Double(d.sizeIndex)), classes: classes),
        customMinorMm: storedNumber(r["customMinor_mm"], Limits.minorMm, d.customMinorMm),
        measuredBy: oneOf(r["measuredBy"], d.measuredBy),
        weighedMassG: storedNumber(r["weighedMass_g"], Limits.massG, d.weighedMassG),
        startTempMode: oneOf(r["startTempMode"], d.startTempMode),
        customStartC: storedNumber(r["customStart_C"], Limits.eggTempC, d.customStartC),
        altitudeM: storedNumber(r["altitude_m"], Limits.altitudeM, d.altitudeM),
        startMode: oneOf(r["startMode"], d.startMode),
        afterBoil: oneOf(r["afterBoil"], d.afterBoil),
        cooling: oneOf(r["cooling"], d.cooling),
        waterLitres: storedNumber(r["waterLitres"], Limits.waterLitres, d.waterLitres),
        eggCount: Int(storedNumber(r["eggCount"], Limits.eggCount, Double(d.eggCount)).rounded()),
        doneness: storedNumber(r["doneness"], Limits.doneness, d.doneness),
        muted: storedFlag(r["muted"]),
        alarm: readAlarmSound(r["alarm"]),
        unitsChosen: readChosenUnits(r["unitsChosen"]),
        language: readLanguageState(r["language"], known: languages),
        probe: storedFlag(r["probe"]),
        roomC: isBool(room) ? nil : (room as? NSNumber).map(\.doubleValue).flatMap { $0.isFinite ? clamp($0, to: Limits.roomC) : nil }
    )
}
