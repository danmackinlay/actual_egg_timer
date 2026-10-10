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
/// `displayText` writes plain digits with `String(format:)` and no locale, as
/// the web's `toFixed` does; what the cook reads goes through the formatting
/// locale (Format.swift).
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
/// thermometer's reading at the centre, typed to a tenth, stepped in whole
/// degrees and never clamped; `roomTemp` is the kitchen's air, measured with
/// the probe (the room setting).
public enum Quantity: String, Sendable, CaseIterable {
    case temperature, eggTemp, probeTemp, roomTemp, boilingPoint, mass, altitude, water
}

/// A step as a ratio of integers, and the digits shown. `trim`: only the
/// digits a value needs (`shownDecimals`). `nudge`: the step of the − and +
/// where it is coarser than the typed step; the step otherwise.
private struct Step {
    let unit: UnitId
    let num: Double
    let den: Double
    let decimals: Int
    var trim = false
    var nudge: (num: Double, den: Double)?
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
        // Typed to a tenth, as a probe shows it; the − and + move in whole
        // degrees from the peak the cook was started at: a tenth at a time is
        // no help to a cook with a probe in hand.
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1, nudge: (1, 1)),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1, nudge: (1, 1)))
    case .roomTemp:
        (Limits.roomC, Step(unit: .celsius, num: 1, den: 1, decimals: 0),
         Step(unit: .fahrenheit, num: 1, den: 1, decimals: 0))
    case .boilingPoint:
        (nil, Step(unit: .celsius, num: 1, den: 10, decimals: 1),
         Step(unit: .fahrenheit, num: 1, den: 10, decimals: 1))
    case .mass:
        // Half grams, the owner's step for the − and +,
        // shown without a ".0": 58 g, 58.5 g.
        (Limits.massG, Step(unit: .grams, num: 1, den: 2, decimals: 1, trim: true),
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
    /// The step of the − and + beside the control (`stepPast`), as a ratio of
    /// integers: the step itself, except for a probe reading, which is typed
    /// to a tenth and stepped in whole degrees.
    public let nudgeNum: Double
    public let nudgeDen: Double
    /// Digits after the point on screen: at most this many when `trim`.
    public let decimals: Int
    /// Shown with only the decimals the value needs, up to `decimals`: "58 g"
    /// and "58.5 g", never "58.0 g". Metric mass only.
    public let trim: Bool
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

    /// The n-th point of the − and +'s grid. Never -0.
    fileprivate func onNudgeGrid(_ n: Double) -> Double {
        let v = n * nudgeNum / nudgeDen
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
    // A billionth of a step of slack, so a limit that converts exactly onto
    // the grid is not pushed a whole step inward by its last bit.
    let lo = (fromSI(unit, limit.lowerBound) * step.den / step.num - 1e-9).rounded(.up)
    let hi = (fromSI(unit, limit.upperBound) * step.den / step.num + 1e-9).rounded(.down)
    return made(bounds: m.onGrid(lo)...m.onGrid(hi))
}

// MARK: - Display and parse

/// The nearest grid point to a value in the measure's unit. Halves go up.
public func snap(_ m: Measure, _ value: Double) -> Double {
    m.onGrid((value * m.stepDen / m.stepNum + 0.5).rounded(.down))
}

// MARK: - The − and +

/// Where the − and + start from when the field is empty, in the measure's
/// unit: a value stored in SI, converted, put on their grid, and kept inside
/// the control's bounds. A probe reading starts from the peak the cook was
/// started at, a room from the room assumed. The field shows it greyed, as a
/// suggestion, and a step from it is the first number in the field: nothing
/// untouched is ever taken as typed.
public func nudgeFrom(_ m: Measure, _ si: Double) -> Double {
    guard si.isFinite else { return m.bounds?.lowerBound ?? 0 }
    let v = m.onNudgeGrid((fromSI(m.unit, si) * m.nudgeDen / m.nudgeNum + 0.5).rounded(.down))
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
}

/// One press of the + (`up`) or the −, from a value in the measure's unit: the
/// next point of their grid strictly past it, so an off-grid 64.3 goes up to
/// 65 and down to 64, and kept inside the control's bounds. A trillionth of a
/// step of slack, so a value already on the grid moves a whole step.
public func stepPast(_ m: Measure, _ value: Double, up: Bool) -> Double {
    let k = value * m.nudgeDen / m.nudgeNum
    let n = up ? (k + 1e-9).rounded(.down) + 1 : (k - 1e-9).rounded(.up) - 1
    let v = m.onNudgeGrid(n)
    guard let bounds = m.bounds else { return v }
    return clamp(v, to: bounds)
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
    let v = display(m, si)
    return String(format: "%.\(shownDecimals(m, v))f", v)
}

/// How many decimals a displayed value is shown with: the measure's own, or,
/// for a measure that trims, the fewest that say the value exactly. The value
/// is already on the step grid, so that is the grid's decimals or none.
public func shownDecimals(_ m: Measure, _ value: Double) -> Int {
    guard m.trim else { return m.decimals }
    for d in 0..<m.decimals where roundTo(value, d) == value {
        return d
    }
    return m.decimals
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
    let v = display(m, si)
    return QuantityText(key: m.formatKey, value: Fixed(v, decimals: shownDecimals(m, v)))
}

/// What the size menu says for a class: its name and its mass in the cook's
/// units. The classes follow the region, not the units, so only the number
/// changes. The label rounds; the model cooks the mass to a tenth of a gram.
public struct SizeLabel: Sendable, Equatable {
    public let key: String
    public let mass: QuantityText
}

public func sizeClassLabel(_ c: SizeClass, system: UnitSystem) -> SizeLabel {
    let m = measureFor(.mass, system: system, region: nil)
    // A carton's class is named to the whole gram: the half gram is the step
    // for an egg on the scale, and an American Extra Large is 67.3 g, not
    // "67.5 g".
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

/// An explicit change of system. `languageAfterFlip` listens for
/// `metricToImperial`; `imperialToMetric` moves no language.
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
