import Foundation

/// The record: one observation per egg, kept beside the posterior.
/// Transliterated from `src/core/record.ts`, and held to it by
/// `fixtures/record.json`.
///
/// Every answer is kept, not only folded into the particles, so a change to
/// the likelihood is a replay of the log rather than a posterior thrown away.
///
/// The posterior is a function of the log and of nothing else: both apps fold
/// an egg FROM ITS RECORD, through `gridRequestFor` and `foldRecord`, and `replay`
/// is those same calls in a loop. That is what makes a posterior rebuilt from
/// the log bit-identical to the one built egg by egg.
///
/// An egg is scored at the cook's own pull when they tapped one
/// (`pulledBy == .cook`), and at the scheduled time when nobody did.
///
/// Codable lives here so the two apps' storage and the fixtures agree on one
/// shape; the JSON coder itself is the caller's, since this package does no I/O.

public let recordVersion = 1

// A record's `prior` is the id of the population the cook's prior was drawn
// from (Population.swift): "2026-09", the literature's, until a fit publishes
// another. Before E6 it named the policy too; `model` says that now.

/// The code that made the record's forecast and chose its time: the
/// likelihood, the decision and, from E8, the nudge. Changed whenever any of
/// them changes, so the model as it shipped can be scored after the code has
/// moved on (DECISIONS.md 37). See src/core/record.ts.
///
/// Also what tells a stored posterior it is out of date: both apps keep it
/// beside the posterior (the store's `m`) and replay the log when it differs.
/// A change to the physics changes the likelihood, so it changes this too.
public let modelID = "2026-10-e8"

/// Where the egg's mass came from. A size class is a 10 g bucket, worth about
/// +-24 s; a scale is a gram.
public enum MassFrom: String, Sendable, Codable {
    case scale, girth, width
    case sizeClass = "class"
}

/// Where the egg's starting temperature came from.
public enum EggFrom: String, Sendable, Codable {
    case fridge, room, custom
}

/// Where the solve's time to boil came from: this cook's own boil tap (every
/// finished cold start has one), the remembered pan, or the default guess when
/// no pan was ever measured. A hot start never times the pan.
public enum TimeToBoilFrom: String, Sendable, Codable {
    case measured, remembered, `default`
}

/// How the egg came out: `cook` when the cook said so, `timeout` when the
/// grace ran out and `pulledS` is the scheduled time - an assumption, not a
/// measurement.
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
    /// Whole-egg mass, grams, to 0.01 g (`recordMassG`).
    public var massG: Double
    public var massFrom: MassFrom
    /// Whose carton, when `massFrom` is a class, and nil otherwise: the same
    /// class is 68 g in one table and 60.2 g in the other.
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

    /// Written as null rather than omitted, like the record's own nullables.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(massG, forKey: .massG)
        try c.encode(massFrom, forKey: .massFrom)
        try c.encode(sizeTable, forKey: .sizeTable)
    }
}

/// The pot, as the solver was told it, plus where the egg's temperature came
/// from. `ambient_C` is recorded rather than re-derived by `ambientFor`, so a
/// change to that rule cannot quietly change a replay.
public struct RecordSetup: Sendable, Codable, Equatable {
    public var startMode: StartMode
    public var eggStartC: Double
    public var eggFrom: EggFrom
    public var ambientC: Double
    /// One-to-one with the altitude setting; the altitude is not recorded.
    public var boilingC: Double
    /// The time to boil the solve used, and where it came from.
    public var timeToBoilS: Double
    public var timeToBoilFrom: TimeToBoilFrom
    public var cooling: Cooling
    public var afterBoil: HeatAfterBoil
    public var waterLitres: Double
    public var eggCount: Double

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
    }

    enum CodingKeys: String, CodingKey {
        case startMode
        case eggStartC = "eggStart_C"
        case eggFrom
        case ambientC = "ambient_C"
        case boilingC = "boiling_C"
        case timeToBoilS = "timeToBoil_s"
        case timeToBoilFrom, cooling, afterBoil, waterLitres, eggCount
    }
}

/// A probe thermometer reading at the centre, taken when the app said: at
/// the end of the counted cooling, when the model has the centre peaking. In C
/// whatever the cook typed it in. See src/core/record.ts.
public struct ProbeReading: Sendable, Codable, Equatable {
    /// The highest number the cook saw with the probe at the middle, C.
    public var centreC: Double
    /// When the app asked for it, s after the moment the record scores as the
    /// pull. Nil when that is not known.
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
        afterS = try c.decodeIfPresent(Double.self, forKey: .afterS)
    }

    /// `after_s` is written as null rather than omitted, as every nullable
    /// field in the record is.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(centreC, forKey: .centreC)
        try c.encode(afterS, forKey: .afterS)
    }
}

/// What the app said at "Eggs in" (DECISIONS.md 37): each answer's
/// probability at the time the cook was started at, unrelated share
/// included. See src/core/record.ts.
public struct Forecast: Sendable, Codable, Equatable {
    /// The cook time the forecast was made for, s from egg in: the time on
    /// screen at "Eggs in", before any boil tap re-solved it.
    public var cookS: Double
    /// P(too soft), P(just right), P(too firm).
    public var yolk: [Double]
    /// P(runny), P(tender), P(firm).
    public var white: [Double]

    public init(cookS: Double, yolk: [Double], white: [Double]) {
        self.cookS = cookS
        self.yolk = yolk
        self.white = white
    }

    enum CodingKeys: String, CodingKey {
        case cookS = "cook_s"
        case yolk, white
    }
}

/// The forecast a ticket keeps: the outcome on screen at "Eggs in", and the
/// time it was for.
public func forecastOf(_ o: Outcome, cookS: Double) -> Forecast {
    Forecast(
        cookS: cookS,
        yolk: [o.pTooSoft, o.pJustRight, o.pTooFirm],
        white: [o.pWhiteRunny, o.pWhiteTender, o.pWhiteFirm]
    )
}

/// How far a forecast's three answers may sum from one.
private let forecastSumTolerance = 1e-6

/// Three probabilities that sum to one, as a forecast's answers are.
private func threeAnswers(_ v: [Double]) -> Bool {
    guard v.count == 3 else { return false }
    var sum = 0.0
    for p in v {
        guard p.isFinite, p >= 0, p <= 1 else { return false }
        sum += p
    }
    return abs(sum - 1.0) <= forecastSumTolerance
}

/// Whether a forecast is one: a positive time and two sets of three
/// probabilities. `parseForecast`'s rules.
public func validForecast(_ f: Forecast) -> Bool {
    f.cookS.isFinite && f.cookS > 0 && threeAnswers(f.yolk) && threeAnswers(f.white)
}

public struct EggRecord: Sendable, Codable, Equatable {
    public var v: Int
    /// The cook's random id, for opt-in collection, which is not built: nothing
    /// mints one yet.
    public var uid: String?
    /// The local date the cook started, YYYY-MM-DD.
    public var day: String
    public var app: AppName
    public var appVersion: String
    public var prior: String
    /// `modelID` when the record was written; nil on one from before E6.
    public var model: String?
    public var egg: RecordEgg
    public var setup: RecordSetup
    public var level: Double
    public var recommendedS: Double
    public var nudgeS: Double
    public var pulledS: Double
    public var pulledBy: PulledBy
    public var cooledS: Double
    /// Nil when the question was on screen and the cook moved on.
    public var yolk: Feedback?
    /// Nil when the question was on screen and the cook moved on; it is
    /// always asked.
    public var white: WhiteReport?
    /// A reading at the centre's peak, or nil: no probe, or not taken.
    public var probe: ProbeReading?
    /// What the app said at "Eggs in", or nil: started before the odds were
    /// known, or written before E6.
    public var forecast: Forecast?
    public var lang: String
    public var register: String
    public var units: Units

    public init(
        uid: String? = nil, day: String, app: AppName, appVersion: String,
        prior: String = literaturePopulation.id, model: String? = modelID, egg: RecordEgg, setup: RecordSetup,
        level: Double, recommendedS: Double, nudgeS: Double = 0, pulledS: Double, pulledBy: PulledBy,
        cooledS: Double, yolk: Feedback?, white: WhiteReport? = nil,
        probe: ProbeReading? = nil, forecast: Forecast? = nil,
        lang: String = "en", register: String = "modern", units: Units = .metric
    ) {
        v = recordVersion
        self.uid = uid
        self.day = day
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
        self.yolk = yolk
        self.white = white
        self.probe = probe
        self.forecast = forecast
        self.lang = lang
        self.register = register
        self.units = units
    }

    enum CodingKeys: String, CodingKey {
        case v, uid, day, app, appVersion, prior, model, egg, setup, level
        case recommendedS = "recommended_s"
        case nudgeS = "nudge_s"
        case pulledS = "pulled_s"
        case pulledBy
        case cooledS = "cooled_s"
        case yolk, white, probe, forecast, lang, register, units
    }

    /// Nullable fields may be absent and read as nil, which is what the
    /// TypeScript loader does too.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try c.decode(Int.self, forKey: .v)
        uid = try c.decodeIfPresent(String.self, forKey: .uid)
        day = try c.decode(String.self, forKey: .day)
        app = try c.decode(AppName.self, forKey: .app)
        appVersion = try c.decode(String.self, forKey: .appVersion)
        prior = try c.decode(String.self, forKey: .prior)
        model = try c.decodeIfPresent(String.self, forKey: .model)
        egg = try c.decode(RecordEgg.self, forKey: .egg)
        setup = try c.decode(RecordSetup.self, forKey: .setup)
        level = try c.decode(Double.self, forKey: .level)
        recommendedS = try c.decode(Double.self, forKey: .recommendedS)
        nudgeS = try c.decode(Double.self, forKey: .nudgeS)
        pulledS = try c.decode(Double.self, forKey: .pulledS)
        pulledBy = try c.decode(PulledBy.self, forKey: .pulledBy)
        cooledS = try c.decode(Double.self, forKey: .cooledS)
        yolk = try c.decodeIfPresent(Feedback.self, forKey: .yolk)
        white = try c.decodeIfPresent(WhiteReport.self, forKey: .white)
        probe = try c.decodeIfPresent(ProbeReading.self, forKey: .probe)
        forecast = try c.decodeIfPresent(Forecast.self, forKey: .forecast)
        lang = try c.decode(String.self, forKey: .lang)
        register = try c.decode(String.self, forKey: .register)
        units = try c.decode(Units.self, forKey: .units)
    }

    /// Nulls are written, not omitted: the schema says `"white": null`, and a
    /// record read by something other than this app should not have to know
    /// that a missing key means the same thing.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(v, forKey: .v)
        try c.encode(uid, forKey: .uid)
        try c.encode(day, forKey: .day)
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
        try c.encode(yolk, forKey: .yolk)
        try c.encode(white, forKey: .white)
        try c.encode(probe, forKey: .probe)
        try c.encode(forecast, forKey: .forecast)
        try c.encode(lang, forKey: .lang)
        try c.encode(register, forKey: .register)
        try c.encode(units, forKey: .units)
    }
}

/// The mass as a record carries it: to 0.01 g.
public func recordMassG(massKg: Double) -> Double {
    (massKg * 100000).rounded() / 100
}

/// A probe reading as a record carries it: to a hundredth of a degree. See
/// src/core/record.ts.
public func recordProbeC(_ centreC: Double) -> Double {
    (centreC * 100).rounded() / 100
}

// MARK: - Validation

/// The coolest thing this cook's egg ever touched, C.
private func coldestOf(_ s: RecordSetup) -> Double {
    let bath = coolingMediumC(s.cooling, ambientC: s.ambientC)
    return min(s.eggStartC, s.ambientC, bath)
}

/// Whether a centre reading is physically possible at all for this cook: no
/// colder than the coldest thing the egg touched, no hotter than the boil. The
/// loader's test, deliberately loose; the apps refuse more at entry
/// (`plausibleProbeRangeC`).
func probePossible(_ s: RecordSetup, centreC: Double) -> Bool {
    centreC.isFinite && centreC >= coldestOf(s) && centreC <= s.boilingC
}

/// YYYY-MM-DD, digits in the right places.
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

/// Whether a decoded record can be trusted. Codable has already checked the
/// types and the enumerations; these are the rules `parseRecord` applies on
/// top, the same ones: finite, and positive where the physics needs it, with
/// physical ranges rather than the UI's `Limits`, so a bound that narrows in a
/// later version cannot make an older version's eggs unreadable. Any
/// `appVersion` is accepted under v1 - see the TypeScript for why.
public func validRecord(_ r: EggRecord) -> Bool {
    guard r.v == recordVersion else { return false }
    if let uid = r.uid, uid.isEmpty { return false }
    guard isDay(r.day), !r.appVersion.isEmpty, !r.prior.isEmpty else { return false }
    if let model = r.model, model.isEmpty { return false }
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

// MARK: - Fold

/// A posterior and the number of eggs that taught it. The count is state, not a
/// statistic: while it is zero the app solves with the literature values, and
/// the first egg's grid is centred on them - so a replay carries it exactly.
public struct Calibration: Sendable {
    public var posterior: Posterior
    public var eggsLogged: Int
    /// Where to solve while no egg has taught anything: the centre of the
    /// population the prior was drawn from. The literature's values when nil.
    public var start: PriorStart?

    public init(posterior: Posterior, eggsLogged: Int, start: PriorStart? = nil) {
        self.posterior = posterior
        self.eggsLogged = eggsLogged
        self.start = start
    }
}

/// A prior of `count` particles from `seed`, drawn from a population - the
/// literature's unless another is given - and starting at its centre.
public func freshCalibration(count: Int, seed: Int32, population: Population = literaturePopulation) -> Calibration {
    Calibration(
        posterior: createPrior(count: count, seed: seed, population: population), eggsLogged: 0,
        start: priorStart(population)
    )
}

/// Parameters to solve with: the prior's centre until an egg has taught
/// anything - the literature values, for the literature - and the posterior
/// mean after.
public func calibrationParams(_ c: Calibration) -> ModelParams {
    if c.eggsLogged == 0 {
        guard let start = c.start else { return .default }
        return ModelParams(alphaM2s: start.alphaM2s, tauAirScale: start.tauAirScale)
    }
    return posteriorParams(c.posterior)
}

/// The doneness to solve for: the slider's yolk target, and the white's target
/// moved by what the eggs have said about the white. The literature target
/// exactly before any egg. See src/core/record.ts.
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

/// Whether a record has anything to fold: an answer, or a probe reading. An
/// unanswered egg is still a record, but it moves no particle and is not an egg
/// the model learned from.
public func recordTeaches(_ r: EggRecord) -> Bool {
    r.yolk != nil || r.white != nil || r.probe != nil
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
        eggCount: r.setup.eggCount
    )
}

/// The cook time the likelihood is scored at: when the cook said the egg came
/// out, if they said, and the schedule if they did not.
public func recordCookTimeS(_ r: EggRecord) -> Double {
    r.pulledBy == .cook ? r.pulledS : r.recommendedS + r.nudgeS
}

public let productionGrid: GridPolicy = { calibrationGrid(alphaCentre: $0, cookTimeS: $1) }

/// The surface this record is scored on, centred where the posterior stands
/// before the egg is folded.
public func gridRequestFor(
    _ c: Calibration, _ r: EggRecord, grid: GridPolicy = productionGrid
) -> GridRequest {
    let params = calibrationParams(c)
    return GridRequest(
        egg: recordEggOf(r), setup: recordSetupOf(r), tauAirScale: params.tauAirScale,
        spec: grid(params.alphaM2s, recordCookTimeS(r))
    )
}

/// Fold one record - its answers and its probe reading, whichever it has - and count the egg
/// if it teaches anything. One fold per egg: an app that hears the second
/// answer after folding the first folds the egg again from the calibration as
/// it stood before it, against the same surface.
public func foldRecord(_ c: inout Calibration, _ r: EggRecord, grid: DoseGrid) {
    guard recordTeaches(r) else { return }
    updatePosterior(
        &c.posterior, grid: grid, cookTimeS: recordCookTimeS(r),
        logNominalTarget: logYolkTarget(r.level), yolk: r.yolk, white: r.white,
        probeC: r.probe?.centreC
    )
    c.eggsLogged += 1
}

/// Rebuild a posterior from a starting point - the prior, or the posterior of a
/// damaged log that had to be dropped - and a log. Each egg is what the app did when it was answered; an egg with no
/// answer is skipped and builds no surface. `start` is a value, so it is never
/// moved.
public func replay(
    _ start: Calibration, _ records: [EggRecord], grid: GridPolicy = productionGrid
) -> Calibration {
    var c = start
    for r in records where recordTeaches(r) {
        foldRecord(&c, r, grid: buildRequestedGrid(gridRequestFor(c, r, grid: grid)))
    }
    return c
}

// MARK: - The results file

// "Export my results" (DECISIONS.md 81): the store exactly as stored, spliced
// in character for character, every stored copy the app could not read, and
// enough beside them to say whose and which. `resultsFile` in
// src/core/record.ts, held to it by `fixtures/record.json`.

/// The results file's own version.
public let resultsFileVersion = 1

/// What a results file says beside the store.
public struct ResultsMeta: Sendable, Equatable {
    public var app: AppName
    public var appVersion: String
    /// When it was exported: an ISO 8601 instant, UTC.
    public var exported: String
    /// The population the app draws a prior from: the store's `p`.
    public var population: String
    /// The random ID sharing made, or nil if sharing has none.
    public var uid: String?

    public init(app: AppName, appVersion: String, exported: String, population: String, uid: String?) {
        self.app = app
        self.appVersion = appVersion
        self.exported = exported
        self.population = population
        self.uid = uid
    }
}

/// The file's name, on the LOCAL day it was exported.
public func resultsFileName(day: String) -> String {
    "actual-egg-timer-results-\(day).json"
}

/// A JSON string literal, escaped as JSON.stringify escapes one and no
/// further: JSONEncoder would also escape `/`.
public func jsonString(_ s: String) -> String {
    var out = "\""
    for u in s.unicodeScalars {
        switch u.value {
        case 0x22: out += "\\\""
        case 0x5C: out += "\\\\"
        case 0x08: out += "\\b"
        case 0x0C: out += "\\f"
        case 0x0A: out += "\\n"
        case 0x0D: out += "\\r"
        case 0x09: out += "\\t"
        case 0..<0x20: out += String(format: "\\u%04x", u.value)
        default: out.unicodeScalars.append(u)
        }
    }
    return out + "\""
}

/// A stored text as it goes into the file: itself when it is a JSON object
/// or array, a JSON string holding it when not, so a damaged copy is kept too.
private func spliced(_ s: String) -> String {
    guard let data = s.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) != nil else {
        return jsonString(s)
    }
    return s
}

private let resultsAbout = "Actual Egg Timer: every result this device kept, as it keeps them. "
    + "\"stored\" is the app's store, whose \"log\" has one record per egg (INFERENCE.md section 4); "
    + "\"unread\" holds any stored copy the app could not read, kept rather than overwritten."

/// The results file: the meta, the store (nil when there is none) and every
/// unread copy, in the order they were kept. One line of JSON.
public func resultsFile(_ meta: ResultsMeta, stored: String?, unread: [String]) -> String {
    let fields: [(String, String)] = [
        ("about", jsonString(resultsAbout)),
        ("file", String(resultsFileVersion)),
        ("app", jsonString(meta.app.rawValue)),
        ("appVersion", jsonString(meta.appVersion)),
        ("exported", jsonString(meta.exported)),
        ("population", jsonString(meta.population)),
        ("model", jsonString(modelID)),
        ("uid", meta.uid.map(jsonString) ?? "null"),
        ("stored", stored.map(spliced) ?? "null"),
        ("unread", "[" + unread.map(spliced).joined(separator: ",") + "]"),
    ]
    return "{" + fields.map { "\"\($0.0)\":\($0.1)" }.joined(separator: ",") + "}"
}
