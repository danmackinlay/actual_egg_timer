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
/// moved on. The record's provenance; it never decides a
/// replay. See src/core/record.ts.
public let modelID = "2026-10-e10"

/// What this code makes of a log: the prior's draw, the physics and the
/// likelihood. Both apps keep it beside the posterior (the store's `m`) and
/// replay the log when it differs. See src/core/record.ts.
public let likelihoodID = "2026-10-e10"

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

/// What the app said at "Eggs in": each answer's
/// probability at the time the cook was started at, unrelated share
/// included. See src/core/record.ts.
public struct Forecast: Sendable, Codable, Equatable {
    /// The cook time the forecast was made for, s from egg in: the time on
    /// screen at "Eggs in", before any boil tap re-solved it.
    public var cookS: Double
    /// P(too soft), P(just right), P(too firm): the miss around the level
    /// asked for, which the time was chosen on.
    public var yolk: [Double]
    /// P(runny), P(tender), P(firm).
    public var white: [Double]
    /// P(runny) ... P(hard), the yolk the cook will say they got, which is
    /// the question asked. Nil when the outcome on screen had none.
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

/// The forecast a ticket keeps: the outcome on screen at "Eggs in", and the
/// time it was for.
public func forecastOf(_ o: Outcome, cookS: Double) -> Forecast {
    Forecast(
        cookS: cookS,
        yolk: [o.pTooSoft, o.pJustRight, o.pTooFirm],
        white: [o.pWhiteRunny, o.pWhiteTender, o.pWhiteFirm],
        yolkWord: o.pYolkWord
    )
}

/// How far a forecast's three answers may sum from one.
private let forecastSumTolerance = 1e-6

/// Three probabilities that sum to one, as a forecast's answers are.
private func threeAnswers(_ v: [Double]) -> Bool {
    answers(v, count: 3)
}

/// `count` probabilities that sum to one.
private func answers(_ v: [Double], count: Int) -> Bool {
    guard v.count == count else { return false }
    var sum = 0.0
    for p in v {
        guard p.isFinite, p >= 0, p <= 1 else { return false }
        sum += p
    }
    return abs(sum - 1.0) <= forecastSumTolerance
}

/// Whether a forecast is one: a positive time, two sets of three
/// probabilities and, when there are any, five for the yolk's words.
/// `parseForecast`'s rules.
public func validForecast(_ f: Forecast) -> Bool {
    f.cookS.isFinite && f.cookS > 0 && threeAnswers(f.yolk) && threeAnswers(f.white)
        && (f.yolkWord.map { answers($0, count: 5) } ?? true)
}

public struct EggRecord: Sendable, Codable, Equatable {
    public var v: Int
    /// The cook's random id, for opt-in collection, which is not built: nothing
    /// mints one yet.
    public var uid: String?
    /// The local date the cook started, YYYY-MM-DD.
    public var day: String
    /// Which cook this egg was: the moment it started, in whole milliseconds
    /// since 1970 UTC. The web app writes it, so that two tabs never count one
    /// egg twice; this app runs one cook at a time and writes none, and one is
    /// never sent. See src/core/record.ts.
    public var id: Int?
    public var app: AppName
    public var appVersion: String
    public var prior: String
    /// `modelID` when the record was written.
    public var model: String
    public var egg: RecordEgg
    public var setup: RecordSetup
    public var level: Double
    public var recommendedS: Double
    public var nudgeS: Double
    public var pulledS: Double
    public var pulledBy: PulledBy
    public var cooledS: Double
    /// The yolk the cook got, in the slider's words, or nil
    /// when the question was on screen and the cook moved on.
    public var yolkWord: YolkWord?
    /// Nil when the question was on screen and the cook moved on; it is
    /// always asked.
    public var white: WhiteReport?
    /// A reading at the centre's peak, or nil: no probe, or not taken.
    public var probe: ProbeReading?
    /// What the app said at "Eggs in", or nil: started before the odds were
    /// known, or no time chosen.
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

/// The mass as a record carries it: to 0.01 g.
public func recordMassG(massKg: Double) -> Double {
    (massKg * 100000).rounded() / 100
}

/// A probe reading as a record carries it: to a hundredth of a degree. See
/// src/core/record.ts.
public func recordProbeC(_ centreC: Double) -> Double {
    (centreC * 100).rounded() / 100
}

// MARK: - The making

/// What an app knows about one cook when it writes its egg down: what was
/// frozen at "Eggs in", how the cook went, and whichever answers have been
/// given so far. SI, every time in s from egg-in. Both apps make a record from
/// these and nothing else (`recordFor`). See src/core/record.ts.
public struct CookFacts: Sendable, Equatable {
    public var app: AppName
    public var appVersion: String
    /// The population the cook's prior was drawn from: the record's `prior`.
    public var prior: String
    /// The local date the cook started, YYYY-MM-DD, by the app's clock.
    public var day: String
    /// The moment the cook started, whole ms since 1970 UTC: the web keeps
    /// one; this app, which runs one cook at a time, passes nil.
    public var id: Int?
    public var massKg: Double
    public var massFrom: MassFrom
    /// The cook's carton, read only for a class: none named is the European.
    public var sizeTable: SizeTable?
    /// The pot as the cook ran it, with the time to boil it measured, if it did.
    public var setup: CookSetup
    public var eggFrom: EggFrom
    /// Whether a measured pan was on file at "Eggs in"; read on a hot start.
    public var boilRemembered: Bool
    /// On a cold start, whether its own boil tap set its time to boil; nil is
    /// true. False after a late correction to cold, which runs on the
    /// remembered pan.
    public var boilTapped: Bool?
    /// The doneness the cook was RUN at.
    public var level: Double
    /// The cook time that ran, egg-in to the scheduled pull, nudge and all.
    public var cookS: Double
    public var nudgeS: Double
    /// When the cook tapped out of PULL, or nil when the grace ran out.
    public var outS: Double?
    /// How long the counted cooling ran; read only off the counter.
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
}

/// The record of one egg, from its facts: the pull MEASURED when the cook
/// tapped out of PULL after egg-in, ASSUMED at the scheduled time when the
/// grace ran out; the time that ran split into what was recommended and the
/// nudge; `id` only when there is one. See src/core/record.ts.
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
        cooledS: s.cooling == .counter ? 0 : f.coolS,
        yolkWord: f.yolkWord,
        white: f.white,
        probe: f.probe,
        forecast: f.forecast,
        lang: f.lang,
        register: registerOf(f.lang),
        units: f.units
    )
}

/// A probe reading as the record carries it: the centre to a hundredth of a
/// degree, and when it was asked for - the end of the counted cooling,
/// `coolEndS` from egg-in - as seconds after the moment `r` scores as the
/// pull; nil for when if there was no counted cooling or it ended before then.
public func probeReadingFor(_ r: EggRecord, centreC: Double, coolEndS: Double?) -> ProbeReading {
    let asked = coolEndS.map { $0 - recordCookTimeS(r) }
    return ProbeReading(centreC: recordProbeC(centreC), afterS: asked.flatMap { $0 >= 0 ? $0 : nil })
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
/// types, the enumerations and that today's fields are all there; these are
/// the rules `parseRecord` applies on top, the same ones: finite, and
/// positive where the physics needs it, with physical ranges rather than the
/// UI's `Limits`. Any `appVersion` is accepted under v1.
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

/// Particles in the filter, and the seed they start from. Both apps must agree
/// or two identical kitchens learn two different things from the same egg.
public let particleCount = 1000
public let calibrationSeed: Int32 = 0x5eed_1e

/// The calibration grid's alpha bounds, as factors of the posterior's centre.
public let calibrationAlphaLow = 0.55
public let calibrationAlphaHigh = 1.8

/// Where to build the dose surface for one logged outcome.
///
/// The most consequential choice in the calibration. The grid is handed to
/// `buildDoseGrid` by the CALLER, so its bounds decide what the particle
/// filter can see and therefore what the posterior becomes: two apps with
/// different grids learn different things from the same egg.
///
/// The bounds bracket the plausible answer rather than the whole domain: alpha
/// within a factor of ~2 of where the posterior currently sits, and cook times
/// from a third of what was cooked to a bit over double it.
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
        return ModelParams(alphaM2s: start.alphaM2s)
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
        egg: recordEggOf(r), setup: recordSetupOf(r), spec: grid(params.alphaM2s, recordCookTimeS(r))
    )
}

/// Fold one record - its answers and its probe reading, whichever it has - and count the egg
/// if it teaches anything. One fold per egg: an app that hears the second
/// answer after folding the first folds the egg again from the calibration as
/// it stood before it, against the same surface.
public func foldRecord(_ c: inout Calibration, _ r: EggRecord, grid: DoseGrid) {
    guard recordTeaches(r) else { return }
    updatePosterior(
        &c.posterior, grid: grid, cookTimeS: recordCookTimeS(r), yolkWord: r.yolkWord, white: r.white,
        probeC: r.probe?.centreC
    )
    c.eggsLogged += 1
}

/// Rebuild a posterior from a starting point - the prior, or the posterior of a
/// damaged log that had to be dropped - and a log. Each egg is what the app
/// did when it was answered; an egg with no answer is skipped and builds no
/// surface. `start` is a value, so it is never moved.
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

// What a launch makes of the store: each app reads its store apart its own
// way, which is I/O; what it then keeps is this one decision. A store that
// cannot be read is dropped. See src/core/record.ts.

/// What a launch found: nothing to use (`fresh`), a log to fold again
/// (`rebuild`), a log that cannot be used and what it taught kept as the base
/// (`rebased`), or everything as stored (`loaded`).
public enum LoadPath: String, Sendable {
    case fresh, rebuild, rebased, loaded
}

/// A stored base, read: whole, or not.
public enum StoredBase: String, Sendable {
    case sound, damaged
}

/// What an app read from its store, part by part.
public struct StoreRead: Sendable, Equatable {
    /// Whether it is a store of this format that can be taken apart.
    public var readable: Bool
    /// The base under the posterior: nil where the store has none.
    public var base: StoredBase?
    /// Whether the posterior read whole.
    public var posterior: Bool
    /// How many records the posterior has absorbed, or nil if that is not a
    /// whole number from zero.
    public var folded: Int?
    /// How many records the log holds, or nil when it is not a list of
    /// records this build reads, every one.
    public var records: Int?
    /// The population the posterior was drawn from, or nil when the store
    /// does not say.
    public var population: String?
    /// The `likelihoodID` it was folded under, or nil when the store does
    /// not say.
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

/// Where the kept base comes from.
public enum KeptBase: String, Sendable {
    case stored, posterior
}

/// Where the kept calibration comes from: the stored posterior as it is, or
/// a copy of the base - the prior where there is none - to fold the log onto.
public enum KeptCalibration: String, Sendable {
    case posterior, start
}

/// What to keep, in the parts that were read.
public struct LoadDecision: Sendable, Equatable {
    public var path: LoadPath
    /// The base: the stored one, the stored posterior, or none.
    public var base: KeptBase?
    public var calibration: KeptCalibration
    /// How many records of the kept log the calibration has absorbed.
    public var folded: Int
    /// Whether the log as read is kept; when not, it starts again empty.
    public var log: Bool

    public init(path: LoadPath, base: KeptBase?, calibration: KeptCalibration, folded: Int, log: Bool) {
        self.path = path
        self.base = base
        self.calibration = calibration
        self.folded = folded
        self.log = log
    }
}

/// What a launch does with the store it read, for a build that draws its
/// prior from `population` and folds under `likelihood`. See src/core/record.ts.
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

// "Export my results": the store exactly as stored, spliced
// in character for character, and enough beside it to say whose and which.
// `resultsFile` in src/core/record.ts, held to it by `fixtures/record.json`.

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
/// or array, a JSON string holding it when not, so a damaged store is kept too.
private func spliced(_ s: String) -> String {
    guard let data = s.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) != nil else {
        return jsonString(s)
    }
    return s
}

private let resultsAbout = "Actual Egg Timer: every result this device kept, as it keeps them. "
    + "\"stored\" is the app's store, whose \"log\" has one record per egg (INFERENCE.md section 4)."

/// The results file: the meta and the store (nil when there is none). One
/// line of JSON.
public func resultsFile(_ meta: ResultsMeta, stored: String?) -> String {
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
    ]
    return "{" + fields.map { "\"\($0.0)\":\($0.1)" }.joined(separator: ",") + "}"
}
