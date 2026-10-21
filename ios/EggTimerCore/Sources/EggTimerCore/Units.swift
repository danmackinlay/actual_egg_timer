import Foundation
import EggTimerCopy

/// The twin of `src/core/units.ts`, held to it by `fixtures/units.json`; the
/// TypeScript's comments say what each part is for. `displayText` writes plain
/// digits with `String(format:)` and no locale, as the web's `toFixed` does;
/// what the cook reads goes through the formatting locale (Format.swift). The
/// app asks `Locale` for the region, the measurement system and the
/// temperature preference, and hands them in.

/// The record's `Units`: the same type, so that what is recorded is what was
/// on screen with no conversion between.
public typealias UnitSystem = Units

// MARK: - The units

/// Every unit either app can show. The raw values are the web's ids.
public enum UnitId: String, Sendable, CaseIterable, Codable {
    case celsius = "C", fahrenheit = "F", grams = "g", ounces = "oz", millimetres = "mm"
    case inches = "in", metres = "m", feet = "ft", litres = "L", quarts = "qt", pints = "pt"
}

public func fromSI(_ unit: UnitId, _ si: Double) -> Double {
    switch unit {
    case .fahrenheit: return si * 1.8 + 32
    case .ounces: return si / UnitFactors.ounceG
    case .inches: return si / UnitFactors.inchMM
    case .feet: return si / UnitFactors.footM
    case .quarts: return si / UnitFactors.usQuartL
    case .pints: return si / UnitFactors.imperialPintL
    case .celsius, .grams, .millimetres, .metres, .litres: return si
    }
}

public func toSI(_ unit: UnitId, _ value: Double) -> Double {
    switch unit {
    case .fahrenheit: return (value - 32) / 1.8
    case .ounces: return value * UnitFactors.ounceG
    case .inches: return value * UnitFactors.inchMM
    case .feet: return value * UnitFactors.footM
    case .quarts: return value * UnitFactors.usQuartL
    case .pints: return value * UnitFactors.imperialPintL
    case .celsius, .grams, .millimetres, .metres, .litres: return value
    }
}

private func unitKeys(_ unit: UnitId) -> (unit: CopyKey, format: CopyKey) {
    switch unit {
    case .celsius: (.`unit.celsius`, .`format.celsius`)
    case .fahrenheit: (.`unit.fahrenheit`, .`format.fahrenheit`)
    case .grams: (.`unit.grams`, .`format.grams`)
    case .ounces: (.`unit.ounces`, .`format.ounces`)
    case .millimetres: (.`unit.millimetres`, .`format.millimetres`)
    case .inches: (.`unit.inches`, .`format.inches`)
    case .metres: (.`unit.metres`, .`format.metres`)
    case .feet: (.`unit.feet`, .`format.feet`)
    case .litres: (.`unit.litres`, .`format.litres`)
    case .quarts: (.`unit.quarts`, .`format.quarts`)
    case .pints: (.`unit.pints`, .`format.pints`)
    }
}

// MARK: - The quantities

/// The web's `girth` and `width` have no twin: the iOS app only weighs eggs.
public enum Quantity: String, Sendable, CaseIterable, Codable {
    case temperature, eggTemp, probeTemp, roomTemp, coolingWater, boilingPoint, mass, altitude, water, bowl
}

private struct Step {
    let unit: UnitId
    let num: Double
    let den: Double
    let decimals: Int
    var trim = false
    var nudge: (num: Double, den: Double)?
}

private func spec(_ q: Quantity) -> (limit: ClosedRange<Double>?, metric: Step, imperial: Step) {
    switch q {
    case .temperature:
        (nil, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .eggTemp:
        (Limits.eggTempC, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .probeTemp:
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1, nudge: (1, 1)),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1, nudge: (1, 1)))
    case .roomTemp:
        (Limits.roomC, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .coolingWater:
        (Limits.coolingWaterC, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .boilingPoint:
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1))
    case .mass:
        (Limits.massG, Step(unit: .grams, num: 1, den: 2, decimals: 1, trim: true),
         Step(unit: .ounces, num: 1, den: 10, decimals: 1))
    case .altitude:
        (Limits.altitudeM, Step(unit: .metres, num: 50, den: 1, decimals: 0),
         Step(unit: .feet, num: 100, den: 1, decimals: 0))
    case .water:
        (Limits.waterLitres, Step(unit: .litres, num: 1, den: 4, decimals: 2),
         Step(unit: .quarts, num: 1, den: 4, decimals: 2))
    case .bowl:
        (Limits.bowlLitres, Step(unit: .litres, num: 1, den: 4, decimals: 2, trim: true),
         Step(unit: .quarts, num: 1, den: 4, decimals: 2, trim: true))
    }
}

public struct Measure: Sendable, Equatable {
    public let quantity: Quantity
    public let unit: UnitId
    public let step: Double
    public let stepNum: Double
    public let stepDen: Double
    public let nudgeNum: Double
    public let nudgeDen: Double
    public let decimals: Int
    public let trim: Bool
    public let unitKey: CopyKey
    public let formatKey: CopyKey
    public let limit: ClosedRange<Double>?
    public let bounds: ClosedRange<Double>?

    fileprivate func onGrid(_ n: Double) -> Double {
        let v = n * stepNum / stepDen
        return v == 0 ? 0 : v
    }

    fileprivate func onNudgeGrid(_ n: Double) -> Double {
        let v = n * nudgeNum / nudgeDen
        return v == 0 ? 0 : v
    }
}

/// As the TypeScript writes one: each bound `{lo, hi}`, or null.
extension Measure: Encodable {
    private enum CodingKeys: String, CodingKey {
        case quantity, unit, step, stepNum, stepDen, nudgeNum, nudgeDen, decimals, trim, unitKey, formatKey, limit, bounds
    }

    private struct Limit: Encodable {
        let lo: Double
        let hi: Double
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(quantity, forKey: .quantity)
        try c.encode(unit, forKey: .unit)
        try c.encode(step, forKey: .step)
        try c.encode(stepNum, forKey: .stepNum)
        try c.encode(stepDen, forKey: .stepDen)
        try c.encode(nudgeNum, forKey: .nudgeNum)
        try c.encode(nudgeDen, forKey: .nudgeDen)
        try c.encode(decimals, forKey: .decimals)
        try c.encode(trim, forKey: .trim)
        try c.encode(unitKey, forKey: .unitKey)
        try c.encode(formatKey, forKey: .formatKey)
        try c.encode(limit.map { Limit(lo: $0.lowerBound, hi: $0.upperBound) }, forKey: .limit)
        try c.encode(bounds.map { Limit(lo: $0.lowerBound, hi: $0.upperBound) }, forKey: .bounds)
    }
}

func imperialWaterUnit(region: String?) -> UnitId {
    isUS(region) ? .quarts : .pints
}

public func measureFor(_ quantity: Quantity, system: UnitSystem, region: String?) -> Measure {
    let s = spec(quantity)
    let step = system == .imperial ? s.imperial : s.metric
    let unit = system == .imperial && (quantity == .water || quantity == .bowl)
        ? imperialWaterUnit(region: region) : step.unit
    let keys = unitKeys(unit)
    func made(bounds: ClosedRange<Double>?) -> Measure {
        Measure(
            quantity: quantity, unit: unit, step: step.num / step.den, stepNum: step.num,
            stepDen: step.den, nudgeNum: step.nudge?.num ?? step.num, nudgeDen: step.nudge?.den ?? step.den,
            decimals: step.decimals, trim: step.trim, unitKey: keys.unit, formatKey: keys.format,
            limit: s.limit, bounds: bounds
        )
    }
    let m = made(bounds: nil)
    guard let limit = s.limit else { return m }
    let lo = (fromSI(unit, limit.lowerBound) * step.den / step.num - 1e-9).rounded(.up)
    let hi = (fromSI(unit, limit.upperBound) * step.den / step.num + 1e-9).rounded(.down)
    return made(bounds: m.onGrid(lo)...m.onGrid(hi))
}

// MARK: - Display and parse

public func snap(_ m: Measure, _ value: Double) -> Double {
    m.onGrid((value * m.stepDen / m.stepNum + 0.5).rounded(.down))
}

// MARK: - The − and +

public func nudgeFrom(_ m: Measure, _ si: Double) -> Double {
    guard si.isFinite else { return m.bounds?.lowerBound ?? 0 }
    let v = m.onNudgeGrid((fromSI(m.unit, si) * m.nudgeDen / m.nudgeNum + 0.5).rounded(.down))
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
}

public func stepPast(_ m: Measure, _ value: Double, up: Bool) -> Double {
    let k = value * m.nudgeDen / m.nudgeNum
    let n = up ? (k + 1e-9).rounded(.down) + 1 : (k - 1e-9).rounded(.up) - 1
    let v = m.onNudgeGrid(n)
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
}

public func display(_ m: Measure, _ si: Double) -> Double {
    guard si.isFinite else { return m.bounds?.lowerBound ?? 0 }
    let v = snap(m, fromSI(m.unit, si))
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
}

public func displayText(_ m: Measure, _ si: Double) -> String {
    let v = display(m, si)
    return String(format: "%.\(shownDecimals(m, v))f", v)
}

public func shownDecimals(_ m: Measure, _ value: Double) -> Int {
    guard m.trim else { return m.decimals }
    for d in 0..<m.decimals where roundTo(value, d) == value {
        return d
    }
    return m.decimals
}

public func parse(_ m: Measure, _ typed: Double) -> Double? {
    guard typed.isFinite else { return nil }
    let si = toSI(m.unit, typed)
    guard let limit = m.limit else { return si }
    return clamp(si, to: limit)
}

public struct QuantityText: Sendable, Equatable {
    public let key: CopyKey
    public let value: Fixed
}

public func quantityText(_ m: Measure, _ si: Double) -> QuantityText {
    let v = display(m, si)
    return QuantityText(key: m.formatKey, value: Fixed(v, decimals: shownDecimals(m, v)))
}

public struct SizeLabel: Sendable, Equatable {
    public let key: CopyKey
    public let mass: QuantityText
}

public func sizeClassLabel(_ c: SizeClass, system: UnitSystem) -> SizeLabel {
    let m = measureFor(.mass, system: system, region: nil)
    if m.trim {
        return SizeLabel(key: c.key, mass: QuantityText(
            key: m.formatKey, value: Fixed(roundTo(c.massKg * 1000, 0), decimals: 0)
        ))
    }
    return SizeLabel(key: c.key, mass: quantityText(m, c.massKg * 1000))
}

// MARK: - The setting

/// Foundation's `Locale.MeasurementSystem`, by name, so the package need not
/// ask `Locale` anything.
public enum MeasurementSystemName: String, Sendable {
    case metric, us, uk
}

/// The temperature unit the cook picked in Settings.
public enum TemperaturePreference: String, Sendable {
    case celsius, fahrenheit
}

/// The TypeScript's `PlatformUnits`, as arguments.
public func regionalUnits(
    region: String?, measurementSystem: MeasurementSystemName? = nil,
    temperature: TemperaturePreference? = nil
) -> UnitSystem {
    if let temperature { return temperature == .fahrenheit ? .imperial : .metric }
    if let measurementSystem { return measurementSystem == .us ? .imperial : .metric }
    return isUS(region) ? .imperial : .metric
}

public func effectiveUnits(chosen: UnitSystem?, regional: UnitSystem) -> UnitSystem {
    chosen ?? regional
}

public enum UnitsFlip: String, Sendable {
    case metricToImperial, imperialToMetric
}

public struct UnitsChoice: Sendable, Equatable {
    public let chosen: UnitSystem
    public let flip: UnitsFlip?
}

public func chooseUnits(chosen: UnitSystem?, regional: UnitSystem, next: UnitSystem) -> UnitsChoice {
    let before = effectiveUnits(chosen: chosen, regional: regional)
    let flip: UnitsFlip? = before == next ? nil : next == .imperial ? .metricToImperial : .imperialToMetric
    return UnitsChoice(chosen: next, flip: flip)
}
