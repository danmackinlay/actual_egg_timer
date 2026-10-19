import Foundation
import EggTimerCopy

/// The record: one observation per egg, kept beside the posterior.
/// Transliterated from `src/core/record.ts`, whose comments say what each
/// part is for, and held to it by `fixtures/record.json`.
///
/// The Codable here is the record's wire shape, the TypeScript's, so the
/// fixtures and the server read what this app writes; the JSON coder itself
/// is the caller's, since this package does no I/O.

public enum MassFrom: String, Sendable, Codable {
    case scale, girth, width
    case sizeClass = "class"
}

public enum EggFrom: String, Sendable, Codable {
    case fridge, room, custom
}

public enum TimeToBoilFrom: String, Sendable, Codable {
    case measured, remembered, `default`
}

public enum PulledBy: String, Sendable, Codable {
    case cook, timeout
}

public enum AppName: String, Sendable, Codable {
    case web, ios
}

public enum Units: String, Sendable, Codable {
    case metric, imperial
}

public struct RecordEgg: Sendable, Codable, Equatable {
    public var massG: Double
    public var massFrom: MassFrom
    public var sizeTable: SizeTable?

    public init(massG: Double, massFrom: MassFrom, sizeTable: SizeTable?) {
        self.massG = massG
        self.massFrom = massFrom
        self.sizeTable = sizeTable
    }

    enum CodingKeys: String, CodingKey {
        case massG = "mass_g"
        case massFrom, sizeTable
    }

    /// `sizeTable` must be there, null or not, as every record writes it.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        massG = try c.decode(Double.self, forKey: .massG)
        massFrom = try c.decode(MassFrom.self, forKey: .massFrom)
        sizeTable = try c.decode(SizeTable?.self, forKey: .sizeTable)
    }

    /// Written as null rather than omitted, like the record's own nullables.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(massG, forKey: .massG)
        try c.encode(massFrom, forKey: .massFrom)
        try c.encode(sizeTable, forKey: .sizeTable)
    }
}

public struct RecordSetup: Sendable, Codable, Equatable {
    public var startMode: StartMode
    public var eggStartC: Double
    public var eggFrom: EggFrom
    public var ambientC: Double
    public var boilingC: Double
    public var timeToBoilS: Double
    public var timeToBoilFrom: TimeToBoilFrom
    public var cooling: Cooling
    public var afterBoil: HeatAfterBoil
    public var waterLitres: Double
    public var eggCount: Double
    /// The two water fields are omitted, not null, when absent, as the
    /// TypeScript writes them.
    public var coolingWaterC: Double?
    public var bowlLitres: Double?

    public init(setup: CookSetup, eggFrom: EggFrom, timeToBoilFrom: TimeToBoilFrom) {
        startMode = setup.startMode
        eggStartC = setup.eggStartC
        self.eggFrom = eggFrom
        ambientC = setup.ambientC
        boilingC = setup.boilingC
        timeToBoilS = setup.timeToBoilS
        self.timeToBoilFrom = timeToBoilFrom
        cooling = setup.cooling
        afterBoil = setup.afterBoil
        waterLitres = setup.waterLitres
        eggCount = setup.eggCount
        // Only what the cooling reads, so a record of an ice bath never says a bowl.
        let watered = setup.cooling == .tap || setup.cooling == .bowl
        coolingWaterC = watered ? setup.coolingWaterC : nil
        bowlLitres = setup.cooling == .bowl ? setup.bowlLitres : nil
    }

    enum CodingKeys: String, CodingKey {
        case startMode
        case eggStartC = "eggStart_C"
        case eggFrom
        case ambientC = "ambient_C"
        case boilingC = "boiling_C"
        case timeToBoilS = "timeToBoil_s"
        case timeToBoilFrom, cooling, afterBoil, waterLitres, eggCount
        case coolingWaterC = "coolingWater_C"
        case bowlLitres
    }

    /// Every field today's records write; the two water fields only when
    /// there, and refused as null, as `parseRecord` refuses them.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startMode = try c.decode(StartMode.self, forKey: .startMode)
        eggStartC = try c.decode(Double.self, forKey: .eggStartC)
        eggFrom = try c.decode(EggFrom.self, forKey: .eggFrom)
        ambientC = try c.decode(Double.self, forKey: .ambientC)
        boilingC = try c.decode(Double.self, forKey: .boilingC)
        timeToBoilS = try c.decode(Double.self, forKey: .timeToBoilS)
        timeToBoilFrom = try c.decode(TimeToBoilFrom.self, forKey: .timeToBoilFrom)
        cooling = try c.decode(Cooling.self, forKey: .cooling)
        afterBoil = try c.decode(HeatAfterBoil.self, forKey: .afterBoil)
        waterLitres = try c.decode(Double.self, forKey: .waterLitres)
        eggCount = try c.decode(Double.self, forKey: .eggCount)
        coolingWaterC = c.contains(.coolingWaterC) ? try c.decode(Double.self, forKey: .coolingWaterC) : nil
        bowlLitres = c.contains(.bowlLitres) ? try c.decode(Double.self, forKey: .bowlLitres) : nil
    }
}

public struct ProbeReading: Sendable, Codable, Equatable {
    public var centreC: Double
    public var afterS: Double?

    public init(centreC: Double, afterS: Double?) {
        self.centreC = centreC
        self.afterS = afterS
    }

    enum CodingKeys: String, CodingKey {
        case centreC = "centre_C"
        case afterS = "after_s"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        centreC = try c.decode(Double.self, forKey: .centreC)
        afterS = try c.decode(Double?.self, forKey: .afterS)
    }

    /// `after_s` is written as null rather than omitted, as every nullable
    /// field in the record is.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(centreC, forKey: .centreC)
        try c.encode(afterS, forKey: .afterS)
    }
}

public struct Forecast: Sendable, Codable, Equatable {
    public var cookS: Double
    public var yolk: [Double]
    public var white: [Double]
    public var yolkWord: [Double]?

    public init(cookS: Double, yolk: [Double], white: [Double], yolkWord: [Double]? = nil) {
        self.cookS = cookS
        self.yolk = yolk
        self.white = white
        self.yolkWord = yolkWord
    }

    enum CodingKeys: String, CodingKey {
        case cookS = "cook_s"
        case yolk, white, yolkWord
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cookS = try c.decode(Double.self, forKey: .cookS)
        yolk = try c.decode([Double].self, forKey: .yolk)
        white = try c.decode([Double].self, forKey: .white)
        yolkWord = try c.decode([Double]?.self, forKey: .yolkWord)
    }

    /// `yolkWord` is written as null rather than omitted, as every nullable
    /// field in the record is.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(cookS, forKey: .cookS)
        try c.encode(yolk, forKey: .yolk)
        try c.encode(white, forKey: .white)
        try c.encode(yolkWord, forKey: .yolkWord)
    }
}

public func forecastOf(_ o: Outcome, cookS: Double) -> Forecast {
    Forecast(
        cookS: cookS,
        yolk: [o.pTooSoft, o.pJustRight, o.pTooFirm],
        white: [o.pWhiteRunny, o.pWhiteTender, o.pWhiteFirm],
        yolkWord: o.pYolkWord
    )
}

private func threeAnswers(_ v: [Double]) -> Bool {
    answers(v, count: 3)
}

private func answers(_ v: [Double], count: Int) -> Bool {
    guard v.count == count else { return false }
    var sum = 0.0
    for p in v {
        guard p.isFinite, p >= 0, p <= 1 else { return false }
        sum += p
    }
    return abs(sum - 1.0) <= forecastSumTolerance
}

public func validForecast(_ f: Forecast) -> Bool {
    f.cookS.isFinite && f.cookS > 0 && threeAnswers(f.yolk) && threeAnswers(f.white)
        && (f.yolkWord.map { answers($0, count: 5) } ?? true)
}

public struct EggRecord: Sendable, Codable, Equatable {
    public var v: Int
    public var uid: String?
    public var day: String
    public var id: Int?
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var model: String
    public var egg: RecordEgg
    public var setup: RecordSetup
    public var level: Double
    public var recommendedS: Double
    public var nudgeS: Double
    public var pulledS: Double
    public var pulledBy: PulledBy
    public var cooledS: Double
    public var yolkWord: YolkWord?
    public var white: WhiteReport?
    public var probe: ProbeReading?
    public var forecast: Forecast?
    public var lang: String
    public var register: String
    public var units: Units

    public init(
        uid: String? = nil, day: String, id: Int? = nil, app: AppName, appVersion: String,
        prior: String = literaturePopulation.id, model: String = modelID, egg: RecordEgg, setup: RecordSetup,
        level: Double, recommendedS: Double, nudgeS: Double = 0, pulledS: Double, pulledBy: PulledBy,
        cooledS: Double, yolkWord: YolkWord? = nil, white: WhiteReport? = nil,
        probe: ProbeReading? = nil, forecast: Forecast? = nil,
        lang: String = "en", register: String = "modern", units: Units = .metric
    ) {
        v = recordVersion
        self.uid = uid
        self.day = day
        self.id = id
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.model = model
        self.egg = egg
        self.setup = setup
        self.level = level
        self.recommendedS = recommendedS
        self.nudgeS = nudgeS
        self.pulledS = pulledS
        self.pulledBy = pulledBy
        self.cooledS = cooledS
        self.yolkWord = yolkWord
        self.white = white
        self.probe = probe
        self.forecast = forecast
        self.lang = lang
        self.register = register
        self.units = units
    }

    enum CodingKeys: String, CodingKey {
        case v, uid, day, id, app, appVersion, prior, model, egg, setup, level
        case recommendedS = "recommended_s"
        case nudgeS = "nudge_s"
        case pulledS = "pulled_s"
        case pulledBy
        case cooledS = "cooled_s"
        case yolkWord, white, probe, forecast, lang, register, units
    }

    /// Today's shape only, as the TypeScript loader reads it: every nullable
    /// field must be there, null or not, but `id`, which this app never
    /// writes.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try c.decode(Int.self, forKey: .v)
        uid = try c.decode(String?.self, forKey: .uid)
        day = try c.decode(String.self, forKey: .day)
        id = try c.decodeIfPresent(Int.self, forKey: .id)
        app = try c.decode(AppName.self, forKey: .app)
        appVersion = try c.decode(String.self, forKey: .appVersion)
        prior = try c.decode(String.self, forKey: .prior)
        model = try c.decode(String.self, forKey: .model)
        egg = try c.decode(RecordEgg.self, forKey: .egg)
        setup = try c.decode(RecordSetup.self, forKey: .setup)
        level = try c.decode(Double.self, forKey: .level)
        recommendedS = try c.decode(Double.self, forKey: .recommendedS)
        nudgeS = try c.decode(Double.self, forKey: .nudgeS)
        pulledS = try c.decode(Double.self, forKey: .pulledS)
        pulledBy = try c.decode(PulledBy.self, forKey: .pulledBy)
        cooledS = try c.decode(Double.self, forKey: .cooledS)
        yolkWord = try c.decode(YolkWord?.self, forKey: .yolkWord)
        white = try c.decode(WhiteReport?.self, forKey: .white)
        probe = try c.decode(ProbeReading?.self, forKey: .probe)
        forecast = try c.decode(Forecast?.self, forKey: .forecast)
        lang = try c.decode(String.self, forKey: .lang)
        register = try c.decode(String.self, forKey: .register)
        units = try c.decode(Units.self, forKey: .units)
    }

    /// Nulls are written, not omitted: the schema says `"white": null`, and a
    /// record read by something other than this app should not have to know
    /// that a missing key means the same thing. The one exception is `id`,
    /// written only when there is one: a record this app sends then carries
    /// no `id` at all, as the privacy page says.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(v, forKey: .v)
        try c.encode(uid, forKey: .uid)
        try c.encode(day, forKey: .day)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encode(app, forKey: .app)
        try c.encode(appVersion, forKey: .appVersion)
        try c.encode(prior, forKey: .prior)
        try c.encode(model, forKey: .model)
        try c.encode(egg, forKey: .egg)
        try c.encode(setup, forKey: .setup)
        try c.encode(level, forKey: .level)
        try c.encode(recommendedS, forKey: .recommendedS)
        try c.encode(nudgeS, forKey: .nudgeS)
        try c.encode(pulledS, forKey: .pulledS)
        try c.encode(pulledBy, forKey: .pulledBy)
        try c.encode(cooledS, forKey: .cooledS)
        try c.encode(yolkWord, forKey: .yolkWord)
        try c.encode(white, forKey: .white)
        try c.encode(probe, forKey: .probe)
        try c.encode(forecast, forKey: .forecast)
        try c.encode(lang, forKey: .lang)
        try c.encode(register, forKey: .register)
        try c.encode(units, forKey: .units)
    }
}

public func recordMassG(massKg: Double) -> Double {
    (massKg * 100000).rounded() / 100
}

public func recordProbeC(_ centreC: Double) -> Double {
    (centreC * 100).rounded() / 100
}

// MARK: - The making

public struct CookFacts: Sendable, Equatable, Codable {
    public var app: AppName
    public var appVersion: String
    public var prior: String
    public var day: String
    public var id: Int?
    public var massKg: Double
    public var massFrom: MassFrom
    public var sizeTable: SizeTable?
    public var setup: CookSetup
    public var eggFrom: EggFrom
    public var boilRemembered: Bool
    public var boilTapped: Bool?
    public var level: Double
    public var cookS: Double
    public var nudgeS: Double
    public var outS: Double?
    public var coolS: Double
    public var yolkWord: YolkWord?
    public var white: WhiteReport?
    public var probe: ProbeReading?
    public var forecast: Forecast?
    public var lang: String
    public var units: Units

    public init(
        app: AppName, appVersion: String, prior: String, day: String, id: Int?,
        massKg: Double, massFrom: MassFrom, sizeTable: SizeTable?, setup: CookSetup, eggFrom: EggFrom,
        boilRemembered: Bool, level: Double, cookS: Double, nudgeS: Double, outS: Double?, coolS: Double,
        yolkWord: YolkWord?, white: WhiteReport?, probe: ProbeReading?, forecast: Forecast?,
        lang: String, units: Units, boilTapped: Bool? = nil
    ) {
        self.boilTapped = boilTapped
        self.app = app
        self.appVersion = appVersion
        self.prior = prior
        self.day = day
        self.id = id
        self.massKg = massKg
        self.massFrom = massFrom
        self.sizeTable = sizeTable
        self.setup = setup
        self.eggFrom = eggFrom
        self.boilRemembered = boilRemembered
        self.level = level
        self.cookS = cookS
        self.nudgeS = nudgeS
        self.outS = outS
        self.coolS = coolS
        self.yolkWord = yolkWord
        self.white = white
        self.probe = probe
        self.forecast = forecast
        self.lang = lang
        self.units = units
    }

    enum CodingKeys: String, CodingKey {
        case app, appVersion, prior, day, id, massKg = "mass_kg", massFrom, sizeTable, setup, eggFrom
        case boilRemembered, boilTapped, level, cookS = "cook_s", nudgeS = "nudge_s", outS = "out_s"
        case coolS = "cool_s", yolkWord, white, probe, forecast, lang, units
    }
}

public func recordFor(_ f: CookFacts) -> EggRecord {
    let measured = f.outS.flatMap { $0 > 0 ? $0 : nil }
    let s = f.setup
    let boilFrom: TimeToBoilFrom = s.startMode == .cold && f.boilTapped != false
        ? .measured : f.boilRemembered ? .remembered : .default
    return EggRecord(
        day: f.day,
        id: f.id,
        app: f.app,
        appVersion: f.appVersion,
        prior: f.prior,
        model: modelID,
        egg: RecordEgg(
            massG: recordMassG(massKg: f.massKg),
            massFrom: f.massFrom,
            sizeTable: f.massFrom == .sizeClass ? f.sizeTable ?? .eu : nil
        ),
        setup: RecordSetup(setup: s, eggFrom: f.eggFrom, timeToBoilFrom: boilFrom),
        level: f.level,
        recommendedS: f.cookS - f.nudgeS,
        nudgeS: f.nudgeS,
        pulledS: measured ?? f.cookS,
        pulledBy: measured == nil ? .timeout : .cook,
        cooledS: countsDown(s.cooling) ? f.coolS : 0,
        yolkWord: f.yolkWord,
        white: f.white,
        probe: f.probe,
        forecast: f.forecast,
        lang: f.lang,
        register: isPeriod(f.lang) ? "1750" : "modern",
        units: f.units
    )
}

public func probeReadingFor(_ r: EggRecord, centreC: Double, coolEndS: Double?) -> ProbeReading {
    let asked = coolEndS.map { $0 - recordCookTimeS(r) }
    return ProbeReading(centreC: recordProbeC(centreC), afterS: asked.flatMap { $0 >= 0 ? $0 : nil })
}

// MARK: - Validation

private func coldestOf(_ s: RecordSetup) -> Double {
    coldestTouchedC(
        startMode: s.startMode, eggStartC: s.eggStartC, ambientC: s.ambientC, cooling: s.cooling,
        waterC: s.coolingWaterC, panStartC: nil
    )
}

func probePossible(_ s: RecordSetup, centreC: Double) -> Bool {
    centreC.isFinite && centreC >= coldestOf(s) && centreC <= s.boilingC
}

private func isDay(_ s: String) -> Bool {
    let bytes = Array(s.utf8)
    guard bytes.count == 10 else { return false }
    for i in 0..<10 {
        if i == 4 || i == 7 {
            if bytes[i] != 45 { return false }
        } else if bytes[i] < 48 || bytes[i] > 57 {
            return false
        }
    }
    return true
}

/// Whether a decoded record can be trusted: Codable has already checked the
/// types, the enumerations and that today's fields are all there; these are
/// the rest of `parseRecord`'s rules.
public func validRecord(_ r: EggRecord) -> Bool {
    guard r.v == recordVersion else { return false }
    if let uid = r.uid, uid.isEmpty { return false }
    guard isDay(r.day), !r.appVersion.isEmpty, !r.prior.isEmpty else { return false }
    // A moment, in whole milliseconds, within what a double holds exactly.
    if let id = r.id, id <= 0 || id > 9_007_199_254_740_991 { return false }
    guard !r.model.isEmpty else { return false }
    if let forecast = r.forecast, !validForecast(forecast) { return false }
    guard r.egg.massG.isFinite, r.egg.massG > 0 else { return false }
    // A class names its carton; nothing else has one.
    guard (r.egg.massFrom == .sizeClass) == (r.egg.sizeTable != nil) else { return false }
    let s = r.setup
    guard s.eggStartC.isFinite, s.ambientC.isFinite else { return false }
    guard s.boilingC.isFinite, s.boilingC > 0 else { return false }
    guard s.timeToBoilS.isFinite, s.timeToBoilS >= 0 else { return false }
    guard s.waterLitres.isFinite, s.waterLitres > 0 else { return false }
    guard s.eggCount.isFinite, s.eggCount >= 1 else { return false }
    // The water the eggs cooled in: a temperature only for running water or
    // a bowl, and a bowl always says how much water it held.
    if let water = s.coolingWaterC, !((s.cooling == .tap || s.cooling == .bowl) && water.isFinite) { return false }
    if s.cooling == .bowl {
        guard let litres = s.bowlLitres, litres.isFinite, litres > 0 else { return false }
    } else if s.bowlLitres != nil {
        return false
    }
    guard r.level.isFinite, r.level >= 0, r.level <= 1 else { return false }
    guard r.recommendedS.isFinite, r.recommendedS > 0 else { return false }
    guard r.nudgeS.isFinite, r.recommendedS + r.nudgeS > 0 else { return false }
    guard r.pulledS.isFinite, r.pulledS > 0 else { return false }
    guard r.cooledS.isFinite, r.cooledS >= 0 else { return false }
    if let probe = r.probe {
        guard probePossible(s, centreC: probe.centreC) else { return false }
        if let after = probe.afterS, !(after.isFinite && after >= 0) { return false }
    }
    guard !r.lang.isEmpty, !r.register.isEmpty else { return false }
    return true
}

// MARK: - The calibration

public func calibrationGrid(alphaCentre: Double, cookTimeS: Double) -> GridSpec {
    GridSpec(
        alphaMin: alphaCentre * calibrationAlphaLow,
        alphaMax: alphaCentre * calibrationAlphaHigh,
        alphaCount: 21,
        timeMinS: max(60, cookTimeS * 0.35),
        timeMaxS: cookTimeS * 2.4,
        timeCount: 32
    )
}

// MARK: - Fold

public struct Calibration: Sendable, Codable {
    public var posterior: Posterior
    public var eggsLogged: Int
    public var start: PriorStart?

    public init(posterior: Posterior, eggsLogged: Int, start: PriorStart? = nil) {
        self.posterior = posterior
        self.eggsLogged = eggsLogged
        self.start = start
    }
}

public func freshCalibration(count: Int, seed: Int32, population: Population = literaturePopulation) -> Calibration {
    Calibration(
        posterior: createPrior(count: count, seed: seed, population: population), eggsLogged: 0,
        start: priorStart(population)
    )
}

public func calibrationParams(_ c: Calibration) -> ModelParams {
    if c.eggsLogged == 0 {
        guard let start = c.start else { return .default }
        return ModelParams(alphaM2s: start.alphaM2s)
    }
    return posteriorParams(c.posterior)
}

public func calibrationDoneness(_ c: Calibration, level: Double) -> Doneness {
    let d = donenessFromSlider(level)
    // Before any egg, the population's mean white offset: none for the
    // literature, which is the literature target exactly.
    let offset = c.eggsLogged > 0 ? posteriorMeanWhiteOffset(c.posterior) : (c.start?.whiteOffset ?? 0.0)
    if c.eggsLogged == 0 && offset == 0.0 { return d }
    return Doneness(
        level: d.level,
        yolkDoseMin: d.yolkDoseMin,
        whiteDoseMin: whiteDoseTarget * pow(10.0, offset)
    )
}

public func recordTeaches(_ r: EggRecord) -> Bool {
    r.yolkWord != nil || r.white != nil || r.probe != nil
}

func recordEggOf(_ r: EggRecord) -> Egg {
    Geometry.eggFromMass(r.egg.massG / 1000)
}

func recordSetupOf(_ r: EggRecord) -> CookSetup {
    CookSetup(
        startMode: r.setup.startMode, eggStartC: r.setup.eggStartC,
        ambientC: r.setup.ambientC, boilingC: r.setup.boilingC,
        timeToBoilS: r.setup.timeToBoilS, cooling: r.setup.cooling,
        waterLitres: r.setup.waterLitres, afterBoil: r.setup.afterBoil,
        eggCount: r.setup.eggCount, coolingWaterC: r.setup.coolingWaterC, bowlLitres: r.setup.bowlLitres
    )
}

public func recordCookTimeS(_ r: EggRecord) -> Double {
    r.pulledBy == .cook ? r.pulledS : r.recommendedS + r.nudgeS
}

public let productionGrid: GridPolicy = { calibrationGrid(alphaCentre: $0, cookTimeS: $1) }

public func gridRequestFor(
    _ c: Calibration, _ r: EggRecord, grid: GridPolicy = productionGrid
) -> GridRequest {
    let params = calibrationParams(c)
    return GridRequest(
        egg: recordEggOf(r), setup: recordSetupOf(r), spec: grid(params.alphaM2s, recordCookTimeS(r))
    )
}

public func foldRecord(_ c: inout Calibration, _ r: EggRecord, grid: DoseGrid) {
    guard recordTeaches(r) else { return }
    updatePosterior(
        &c.posterior, grid: grid, cookTimeS: recordCookTimeS(r), yolkWord: r.yolkWord, white: r.white,
        probeC: r.probe?.centreC
    )
    c.eggsLogged += 1
}

public func replay(
    _ start: Calibration, _ records: [EggRecord], grid: GridPolicy = productionGrid
) -> Calibration {
    var c = start
    for r in records where recordTeaches(r) {
        foldRecord(&c, r, grid: buildRequestedGrid(gridRequestFor(c, r, grid: grid)))
    }
    return c
}

// MARK: - The store, read

public enum LoadPath: String, Sendable, Codable {
    case fresh, rebuild, rebased, loaded
}

public enum StoredBase: String, Sendable, Codable {
    case sound, damaged
}

public struct StoreRead: Sendable, Equatable, Codable {
    public var readable: Bool
    public var base: StoredBase?
    public var posterior: Bool
    public var folded: Int?
    public var records: Int?
    public var population: String?
    public var likelihood: String?

    public init(
        readable: Bool, base: StoredBase?, posterior: Bool, folded: Int?, records: Int?,
        population: String?, likelihood: String?
    ) {
        self.readable = readable
        self.base = base
        self.posterior = posterior
        self.folded = folded
        self.records = records
        self.population = population
        self.likelihood = likelihood
    }
}

public enum KeptBase: String, Sendable, Codable {
    case stored, posterior
}

public enum KeptCalibration: String, Sendable, Codable {
    case posterior, start
}

public struct LoadDecision: Sendable, Equatable, Codable {
    public var path: LoadPath
    public var base: KeptBase?
    public var calibration: KeptCalibration
    public var folded: Int
    public var log: Bool

    public init(path: LoadPath, base: KeptBase?, calibration: KeptCalibration, folded: Int, log: Bool) {
        self.path = path
        self.base = base
        self.calibration = calibration
        self.folded = folded
        self.log = log
    }
}

public func loadDecision(_ read: StoreRead, population: String, likelihood: String) -> LoadDecision {
    guard read.readable else {
        return LoadDecision(path: .fresh, base: nil, calibration: .start, folded: 0, log: false)
    }
    guard let records = read.records else {
        let base: KeptBase? = read.posterior ? .posterior : read.base == .sound ? .stored : nil
        return LoadDecision(path: .rebased, base: base, calibration: .start, folded: 0, log: false)
    }
    let base: KeptBase? = read.base == .sound ? .stored : nil
    guard read.base != .damaged, read.posterior, let folded = read.folded,
          read.population == population, read.likelihood == likelihood else {
        return LoadDecision(path: .rebuild, base: base, calibration: .start, folded: 0, log: true)
    }
    if folded > records {
        return LoadDecision(path: .rebased, base: .posterior, calibration: .start, folded: 0, log: false)
    }
    return LoadDecision(path: .loaded, base: base, calibration: .posterior, folded: folded, log: true)
}

// MARK: - The results file

// "Export my results": `resultsFile` in src/core/record.ts, written with
// JSONSerialization, and held to the TypeScript's by `fixtures/record.json`
// as data, not characters.

public struct ResultsMeta: Sendable, Equatable, Codable {
    public var app: AppName
    public var appVersion: String
    public var exported: String
    public var population: String
    public var uid: String?

    public init(app: AppName, appVersion: String, exported: String, population: String, uid: String?) {
        self.app = app
        self.appVersion = appVersion
        self.exported = exported
        self.population = population
        self.uid = uid
    }
}

public func resultsFileName(day: String) -> String {
    "actual-egg-timer-results-\(day).json"
}

private func storedValue(_ s: String) -> Any {
    guard let data = s.data(using: .utf8), let v = try? JSONSerialization.jsonObject(with: data),
          v is [String: Any] || v is [Any] else { return s }
    return v
}

/// Its fields sorted, since a dictionary has no order.
public func resultsFile(_ meta: ResultsMeta, stored: String?) -> String {
    let file: [String: Any] = [
        "about": resultsAbout, "file": resultsFileVersion, "app": meta.app.rawValue, "appVersion": meta.appVersion,
        "exported": meta.exported, "population": meta.population, "model": modelID, "uid": meta.uid ?? NSNull(),
        "stored": stored.map(storedValue) ?? NSNull(),
    ]
    // Strings, a number, nulls and what JSONSerialization itself read: it
    // writes them all, so a throw here is a broken encoder, never a store it
    // could not write, and an empty file would hide it.
    do {
        let data = try JSONSerialization.data(withJSONObject: file, options: [.sortedKeys, .withoutEscapingSlashes])
        return String(decoding: data, as: UTF8.self)
    } catch {
        preconditionFailure("the results file did not encode: \(error)")
    }
}
