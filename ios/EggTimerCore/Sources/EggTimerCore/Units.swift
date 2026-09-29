import Foundation
import EggTimerCopy

/// Metric and Imperial, transliterated from `src/core/units.ts` and held to it
/// by `fixtures/units.json`.
///
/// The model stays in SI. What lives here is making the two apps convert
/// IDENTICALLY: one factor per unit, one step and one number of decimals per
/// quantity per system, and the round trip - a cook who types 2.4 oz sees
/// 2.4 oz again, never 2.39 (LANGUAGE.md §4):
///
///  1. the value is stored in SI and clamped by `Limits` in SI;
///  2. what is shown is that value converted, rounded to the step, and held
///     inside the input's bounds - the SI limits converted and rounded INWARD
///     to the step, so every bound is a value the control accepts;
///  3. a control writes the stored value only when the cook moves it.
///
/// Grid values are `n * num / den` from integers, the double nearest the
/// decimal, and rounding is `floor(x + 0.5)` written out, because
/// `rounded()` and JavaScript's `Math.round` disagree about negative halves.
/// Numbers are written with `String(format:)` and no locale: locale-aware
/// digits are F4's, and until then both apps print the same ones.
///
/// Pure, like the rest of this package. The app asks `Locale` for the region,
/// the measurement system and the temperature preference, and hands them in.

/// The one setting. The same pair as the record's `Units`, and the same type,
/// so that what is recorded is what was on screen with no conversion between.
public typealias UnitSystem = Units

// MARK: - The units

/// Every unit either app can show. The raw values are the web's ids.
public enum UnitId: String, Sendable, CaseIterable {
    case celsius = "C", fahrenheit = "F", grams = "g", ounces = "oz", millimetres = "mm"
    case inches = "in", metres = "m", feet = "ft", litres = "L", quarts = "qt", pints = "pt"
}

/// Exact by definition: the avoirdupois ounce, inch and foot of 1959, the US
/// liquid quart, and the imperial pint.
public enum UnitFactors {
    public static let ounceG = 28.349523125
    public static let inchMM = 25.4
    public static let footM = 0.3048
    public static let usQuartL = 0.946352946
    public static let imperialPintL = 0.56826125
}

/// A value in SI (C, g, mm, m, L) as the given unit.
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

/// A value in the given unit, as SI.
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

/// The catalogue's bare symbol, for a control's label, and its "value and
/// unit" template, for everything else.
private func unitKeys(_ unit: UnitId) -> (unit: String, format: String) {
    switch unit {
    case .celsius: ("unit.celsius", "format.celsius")
    case .fahrenheit: ("unit.fahrenheit", "format.fahrenheit")
    case .grams: ("unit.grams", "format.grams")
    case .ounces: ("unit.ounces", "format.ounces")
    case .millimetres: ("unit.millimetres", "format.millimetres")
    case .inches: ("unit.inches", "format.inches")
    case .metres: ("unit.metres", "format.metres")
    case .feet: ("unit.feet", "format.feet")
    case .litres: ("unit.litres", "format.litres")
    case .quarts: ("unit.quarts", "format.quarts")
    case .pints: ("unit.pints", "format.pints")
    }
}

// MARK: - The quantities

/// Every number with a unit that either app shows or takes. `temperature` is
/// a readout (peak yolk, the bath, the presets); `eggTemp` is the egg's
/// temperature a cook can type (on the web); `probeTemp` is a probe
/// thermometer's reading at the centre (E4), to a tenth and never clamped.
public enum Quantity: String, Sendable, CaseIterable {
    case temperature, eggTemp, probeTemp, boilingPoint, mass, altitude, water
}

/// A step as a ratio of integers, and the digits shown.
private struct Step {
    let unit: UnitId
    let num: Double
    let den: Double
    let decimals: Int
}

/// LANGUAGE.md §4's table for Imperial, and the web's inputs for metric.
private func spec(_ q: Quantity) -> (limit: ClosedRange<Double>?, metric: Step, imperial: Step) {
    switch q {
    case .temperature:
        (nil, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .eggTemp:
        (Limits.eggTempC, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .probeTemp:
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1))
    case .boilingPoint:
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1))
    case .mass:
        (Limits.massG, Step(unit: .grams, num: 1, den: 1, decimals: 0),
         Step(unit: .ounces, num: 1, den: 10, decimals: 1))
    case .altitude:
        (Limits.altitudeM, Step(unit: .metres, num: 50, den: 1, decimals: 0),
         Step(unit: .feet, num: 100, den: 1, decimals: 0))
    case .water:
        (Limits.waterLitres, Step(unit: .litres, num: 1, den: 4, decimals: 2),
         Step(unit: .quarts, num: 1, den: 4, decimals: 2))
    }
}

/// One quantity in one unit: everything a control or a readout needs.
public struct Measure: Sendable, Equatable {
    public let quantity: Quantity
    public let unit: UnitId
    /// The control's step, as a number: 0.1, 0.02, 100.
    public let step: Double
    public let stepNum: Double
    public let stepDen: Double
    public let decimals: Int
    public let unitKey: String
    public let formatKey: String
    /// The SI limit, or nil for a readout.
    public let limit: ClosedRange<Double>?
    /// The limit in this unit, rounded INWARD to the step. Nil for a readout.
    public let bounds: ClosedRange<Double>?

    /// The n-th grid point. Never -0, which prints as "-0".
    fileprivate func onGrid(_ n: Double) -> Double {
        let v = n * stepNum / stepDen
        return v == 0 ? 0 : v
    }
}

/// Water under Imperial: the US quart in the US, the imperial pint elsewhere.
func imperialWaterUnit(region: String?) -> UnitId {
    isUS(region) ? .quarts : .pints
}

public func measureFor(_ quantity: Quantity, system: UnitSystem, region: String?) -> Measure {
    let s = spec(quantity)
    let step = system == .imperial ? s.imperial : s.metric
    let unit = system == .imperial && quantity == .water ? imperialWaterUnit(region: region) : step.unit
    let keys = unitKeys(unit)
    var m = Measure(
        quantity: quantity, unit: unit, step: step.num / step.den, stepNum: step.num,
        stepDen: step.den, decimals: step.decimals, unitKey: keys.unit, formatKey: keys.format,
        limit: s.limit, bounds: nil
    )
    if let limit = s.limit {
        // A billionth of a step of slack, so a limit that converts exactly onto
        // the grid is not pushed a whole step inward by its last bit.
        let lo = (fromSI(unit, limit.lowerBound) * step.den / step.num - 1e-9).rounded(.up)
        let hi = (fromSI(unit, limit.upperBound) * step.den / step.num + 1e-9).rounded(.down)
        m = Measure(
            quantity: m.quantity, unit: m.unit, step: m.step, stepNum: m.stepNum,
            stepDen: m.stepDen, decimals: m.decimals, unitKey: m.unitKey, formatKey: m.formatKey,
            limit: m.limit, bounds: m.onGrid(lo)...m.onGrid(hi)
        )
    }
    return m
}

// MARK: - Display and parse

/// The nearest grid point to a value in the measure's unit. Halves go up.
public func snap(_ m: Measure, _ value: Double) -> Double {
    m.onGrid((value * m.stepDen / m.stepNum + 0.5).rounded(.down))
}

/// What the screen shows for a value stored in SI: converted, rounded to the
/// step, and kept inside the control's bounds. Not a number shows as the floor,
/// or zero for a readout.
public func display(_ m: Measure, _ si: Double) -> Double {
    guard si.isFinite else { return m.bounds?.lowerBound ?? 0 }
    let v = snap(m, fromSI(m.unit, si))
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
}

/// `display`, as plain decimal digits with a point and no grouping: machine
/// text, as a web input holds it. What the cook reads goes through
/// `quantityText` and the formatting locale instead.
public func displayText(_ m: Measure, _ si: Double) -> String {
    String(format: "%.\(m.decimals)f", display(m, si))
}

/// What a number set on a control means, in SI: converted, then clamped by
/// `Limits` in SI. Nil for no number at all.
public func parse(_ m: Measure, _ typed: Double) -> Double? {
    guard typed.isFinite else { return nil }
    let si = toSI(m.unit, typed)
    guard let limit = m.limit else { return si }
    return clamp(si, to: limit)
}

/// A number and its unit, as a catalogue key and the value to put in it. The
/// renderer writes the value in the formatting locale, to the measure's
/// decimals - "2.4 oz", "2,4 oz", "1,500 m".
public struct QuantityText: Sendable, Equatable {
    public let key: String
    public let value: Fixed
}

public func quantityText(_ m: Measure, _ si: Double) -> QuantityText {
    QuantityText(key: m.formatKey, value: Fixed(display(m, si), decimals: m.decimals))
}

/// What the size menu says for a class: its name and its mass in the cook's
/// units. The classes follow the region, not the units, so only the number
/// changes. The label rounds; the model cooks the mass to a tenth of a gram.
public struct SizeLabel: Sendable, Equatable {
    public let key: String
    public let mass: QuantityText
}

public func sizeClassLabel(_ c: SizeClass, system: UnitSystem) -> SizeLabel {
    SizeLabel(key: c.key, mass: quantityText(measureFor(.mass, system: system, region: nil), c.massKg * 1000))
}

// MARK: - The setting

/// Foundation's `Locale.MeasurementSystem`, by name, so the package need not
/// ask `Locale` anything.
public enum MeasurementSystemName: String, Sendable {
    case metric, us, uk
}

/// The temperature unit the cook picked in Settings (iOS 16 and later).
public enum TemperaturePreference: String, Sendable {
    case celsius, fahrenheit
}

/// The system a cook starts in, before they choose. The temperature preference
/// wins where there is one; then the measurement system, where only `us` is
/// Imperial; then the region, where only `US` is. See `regionalUnits` in
/// units.ts for why.
public func regionalUnits(
    region: String?, measurementSystem: MeasurementSystemName? = nil,
    temperature: TemperaturePreference? = nil
) -> UnitSystem {
    if let temperature { return temperature == .fahrenheit ? .imperial : .metric }
    if let measurementSystem { return measurementSystem == .us ? .imperial : .metric }
    return isUS(region) ? .imperial : .metric
}

/// The cook's choice if they made one, the region's otherwise.
public func effectiveUnits(chosen: UnitSystem?, regional: UnitSystem) -> UnitSystem {
    chosen ?? regional
}

/// An explicit change of system. F6 listens for `metricToImperial`.
public enum UnitsFlip: String, Sendable {
    case metricToImperial, imperialToMetric
}

public struct UnitsChoice: Sendable, Equatable {
    /// What to store: the cook chose this, even if it equals the default.
    public let chosen: UnitSystem
    /// The flip it makes, or nil when the system on screen does not change.
    public let flip: UnitsFlip?
}

public func chooseUnits(chosen: UnitSystem?, regional: UnitSystem, next: UnitSystem) -> UnitsChoice {
    let before = effectiveUnits(chosen: chosen, regional: regional)
    let flip: UnitsFlip? = before == next ? nil : next == .imperial ? .metricToImperial : .imperialToMetric
    return UnitsChoice(chosen: next, flip: flip)
}

/// A stored choice, or nil for none.
public func readChosenUnits(_ raw: Any?) -> UnitSystem? {
    guard let string = raw as? String else { return nil }
    return UnitSystem(rawValue: string)
}
