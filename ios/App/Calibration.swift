import CoreTransferable
import Foundation
import UniformTypeIdentifiers
import EggTimerCore

/// Bridges the particle filter in `EggTimerCore` to the app, and keeps the
/// record.
///
/// The model's constants come from the literature, and the carryover term has
/// no published measurement behind it at all. Rather than pretend otherwise,
/// the app asks how each egg turned out and folds the answer into a posterior.
/// After about three eggs the suggested time stops moving.
///
/// The answer is not thrown away once folded. Each egg is kept as a
/// record (INFERENCE.md section 4) in a log beside the posterior, and the
/// posterior is what `replay` makes of that log - so a later change to the
/// likelihood replays the eggs instead of discarding what they taught. The
/// stored posterior is a cache of that replay; `folded` says how much of the
/// log it has absorbed, and the rest is folded again on launch. The web app
/// keeps its log the same way.
///
/// `Calibration` itself - a posterior and the count of eggs that taught it -
/// lives in EggTimerCore, because a replay has to carry the count exactly.

/// Everything that is kept, and the invariant that holds it together:
/// `calibration` is `replay(base ?? prior, log.prefix(folded))`.
struct Kept: Sendable {
    /// Where the replay starts when it is not the prior: only ever the posterior
    /// of a log that was damaged and had to be dropped. Nil on every healthy
    /// phone.
    var base: Calibration?
    var calibration: Calibration
    var folded: Int
    var log: [EggRecord]
    /// Records this build cannot read - a newer build's, most likely - kept as
    /// they were stored and written back, where they sat in the log, and
    /// folded by nothing here.
    var unread: [Unread] = []
    /// Each record of `log` as it was stored, by index, for the ones read from
    /// storage; a record made here has none. A record is written back as
    /// stored with what this build knows laid over it (`overlay`), so a field
    /// a later build added is not lost when this one saves. The web's
    /// `Kept.stored`.
    var stored: [JSONValue] = []
}

/// "Export my results" as the share sheet takes it: a file, written when the
/// cook picks where it goes, from what is stored then (DECISIONS.md 81).
struct ResultsExport: Transferable {
    let uid: String?
    let name: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { item in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(item.name)
            try Data(Calibrations.exportText(uid: item.uid).utf8).write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

/// A record this build cannot read, and its place among every record,
/// readable or not, so a build that can read it puts it back where it was.
struct Unread: Codable, Equatable, Sendable {
    var at: Int
    var record: JSONValue

    enum CodingKeys: String, CodingKey { case at, record }
}

/// Any JSON value, kept as it was read: what a record this build cannot read
/// is held as, so it is written back rather than lost.
enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let i = try? c.decode(Int.self) {
            self = .int(i)
        } else if let d = try? c.decode(Double.self) {
            self = .double(d)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

/// A value as stored with what this build knows laid over it: every field
/// this build reads comes from `known`, at every depth, and every field it
/// does not is kept from `stored`, where it was. `known` itself where either
/// is not an object. The web's `overlay`.
func overlay(_ stored: JSONValue, _ known: JSONValue) -> JSONValue {
    guard case .object(let s) = stored, case .object(let k) = known else { return known }
    var out = s
    for (key, value) in k { out[key] = overlay(s[key] ?? .null, value) }
    return .object(out)
}

enum Calibrations {
    /// The posterior, the base under it, and the log. v4: a particle of six
    /// numbers. Nothing before it is read: no build older than this one left
    /// the owner's devices, so the v1-v3 stores are never looked at. The key
    /// and the record's format change only with a migration (DECISIONS.md 81,
    /// which amends 48 for this one store).
    private static let key = "calibration.v4"

    /// Every stored copy this build could not read whole, as it was stored,
    /// newest last: kept before anything is written over it, so no build ever
    /// loses a log another wrote (DECISIONS.md 81). Exported with the
    /// results; "Start learning again" deletes it with them. The web's
    /// `aet.calibration.v4.unread`.
    private static let unreadKey = "calibration.v4.unread"
    /// How many unread copies are kept, each the size of the store.
    private static let unreadKept = 3

    /// Carried on every record: the web app deploys on push and this one ships
    /// when a build does, and the fit has to know which version said what -
    /// down to the build, since TestFlight ships several of one version:
    /// "0.4.0+3", the build after a plus as semantic versioning writes it.
    static let appVersion: String = {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        guard let build = info?["CFBundleVersion"] as? String, !build.isEmpty else { return version }
        return "\(version)+\(build)"
    }()

    /// The population a new cook's prior is drawn from (E7; Population.swift):
    /// `fixtures/population.json` from the repo, bundled, which is the
    /// literature's until a fit of shared eggs publishes another. A bundle
    /// without it, or with one that does not read, draws from the literature.
    static let population: Population = {
        guard let url = Bundle.main.url(forResource: "population", withExtension: "json"),
              let data = try? Data(contentsOf: url), let p = parsePopulation(data) else {
            return literaturePopulation
        }
        return p
    }()

    static func fresh() -> Calibration {
        freshCalibration(count: particleCount, seed: calibrationSeed, population: population)
    }

    static func freshKept() -> Kept {
        Kept(base: nil, calibration: fresh(), folded: 0, log: [])
    }

    /// Where a replay starts: the base if there is one, the prior if not.
    static func start(_ base: Calibration?) -> Calibration {
        base ?? fresh()
    }

    // MARK: - Persistence

    /// Column-wise, one column per particle field. The current posterior is
    /// written at full precision: it is a cache of a replay, and a cache that
    /// rounds is one a replay can never match. JSONEncoder writes a double so
    /// that it reads back as the same double, which the core's tests check.
    private struct StoredPosterior: Codable {
        var n: Int
        var rng: Int32
        var a: [Double]
        var o: [Double]
        var t: [Double]
        /// The noise scale, the white offset and the tender | firm gap.
        var sd: [Double]
        var wo: [Double]
        var wg: [Double]
        var w: [Double]
    }

    private struct StoredV4<Record: Encodable>: Encodable {
        var v = 4
        /// The population the posterior was drawn from (E7).
        var p: String
        /// The `modelID` the posterior was folded under.
        var m: String = modelID
        var base: StoredPosterior?
        var cal: StoredPosterior
        var folded: Int
        var log: [Record]
        /// Omitted when there are none.
        var unread: [Unread]?
    }

    /// The parts of a stored v4 read one at a time, so a damaged part is refused
    /// on its own instead of taking the rest down with it. The log is read by
    /// `StoredLog`, separately, for the same reason.
    private struct StoredParts: Decodable {
        var v: Int?
        /// Absent in a store from before E7, every one drawn from the
        /// literature.
        var p: String?
        /// Absent in a store from before it was kept, which is replayed once.
        var m: String?
        var base: StoredPosterior?
        var baseDamaged = false
        var cal: StoredPosterior?
        var folded: Int?

        enum CodingKeys: String, CodingKey { case v, p, m, base, cal, folded }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            v = try? c.decode(Int.self, forKey: .v)
            p = try? c.decode(String.self, forKey: .p)
            m = try? c.decode(String.self, forKey: .m)
            if c.contains(.base), (try? c.decodeNil(forKey: .base)) == false {
                base = try? c.decode(StoredPosterior.self, forKey: .base)
                baseDamaged = base == nil
            }
            cal = try? c.decode(StoredPosterior.self, forKey: .cal)
            folded = try? c.decode(Int.self, forKey: .folded)
        }
    }

    /// The log as stored, each record as it was, and the unread records with
    /// their places; an unread entry that is itself damaged is passed over.
    private struct StoredLog: Decodable {
        var log: [JSONValue]
        var unread: [Unread]

        private struct MaybeUnread: Decodable {
            var entry: Unread?
            init(from decoder: Decoder) throws {
                let c = try decoder.container(keyedBy: Unread.CodingKeys.self)
                guard let at = try? c.decode(Int.self, forKey: .at), at >= 0 else { return }
                let record: JSONValue = (try? c.decodeIfPresent(JSONValue.self, forKey: .record)) ?? .null
                entry = Unread(at: at, record: record)
            }
        }

        enum CodingKeys: String, CodingKey { case log, unread }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            log = try c.decode([JSONValue].self, forKey: .log)
            let held = (try? c.decode([MaybeUnread].self, forKey: .unread)) ?? []
            // In place order, and stable: the web sorts the same way.
            unread = held.compactMap(\.entry).enumerated()
                .sorted { ($0.element.at, $0.offset) < ($1.element.at, $1.offset) }
                .map(\.element)
        }
    }

    /// A record as this build reads one: the Codable shape, then the rules.
    private static func record(_ raw: JSONValue) -> EggRecord? {
        guard let data = try? JSONEncoder().encode(raw),
              let r = try? JSONDecoder().decode(EggRecord.self, from: data), validRecord(r) else { return nil }
        return r
    }

    /// The web's `readLog`: the stored log and the unread records put back
    /// together in their places, then every record this build reads in `log`
    /// and every one it cannot in `unread`, with its place. `moved` says the
    /// split differs from the stored one, so the posterior is replayed.
    private static func readLog(
        _ listed: [JSONValue], _ held: [Unread]
    ) -> (log: [EggRecord], stored: [JSONValue], unread: [Unread], moved: Bool) {
        var log: [EggRecord] = []
        var stored: [JSONValue] = []
        var unread: [Unread] = []
        var moved = false
        var li = 0
        var hi = 0
        var at = 0
        while li < listed.count || hi < held.count {
            let fromHeld = hi < held.count && (held[hi].at <= at || li >= listed.count)
            let raw: JSONValue
            if fromHeld {
                raw = held[hi].record
                hi += 1
            } else {
                raw = listed[li]
                li += 1
            }
            if let r = record(raw) {
                log.append(r)
                stored.append(raw)
                if fromHeld { moved = true }
            } else {
                unread.append(Unread(at: at, record: raw))
                if !fromHeld { moved = true }
            }
            at += 1
        }
        return (log, stored, unread, moved)
    }

    private static func columns(_ c: Calibration) -> StoredPosterior {
        let p = c.posterior.particles
        return StoredPosterior(
            n: c.eggsLogged, rng: c.posterior.rng,
            a: p.map(\.alphaM2s), o: p.map(\.logDoseOffset), t: p.map(\.tauAirScale),
            sd: p.map(\.noise), wo: p.map(\.whiteOffset), wg: p.map(\.whiteFirmGap),
            w: c.posterior.weights
        )
    }

    /// A posterior, or nil if any part of it is damaged. A half-valid posterior
    /// is worse than none: a single NaN weight would poison every solve from
    /// then on. Same rules as the web app's: alpha, tauAirScale, the noise and
    /// the firm gap strictly positive (a zero noise divides by zero in the
    /// probit), weights non-negative, the two offsets anything finite.
    private static func calibration(_ s: StoredPosterior?) -> Calibration? {
        guard let s else { return nil }
        let a = s.a
        guard
            s.n >= 0, !a.isEmpty,
            [s.o.count, s.t.count, s.sd.count, s.wo.count, s.wg.count, s.w.count].allSatisfy({ $0 == a.count }),
            a.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.o.allSatisfy(\.isFinite),
            s.t.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.sd.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.wo.allSatisfy(\.isFinite),
            s.wg.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.w.allSatisfy({ $0.isFinite && $0 >= 0 })
        else { return nil }
        var particles = [Particle]()
        particles.reserveCapacity(a.count)
        for i in 0..<a.count {
            particles.append(Particle(
                alphaM2s: a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i],
                noise: s.sd[i], whiteOffset: s.wo[i], whiteFirmGap: s.wg[i]
            ))
        }
        return Calibration(posterior: Posterior(particles: particles, weights: s.w, rng: s.rng), eggsLogged: s.n)
    }

    static func save(_ k: Kept) {
        let base = k.base.map(columns)
        let cal = columns(k.calibration)
        let unread = k.unread.isEmpty ? nil : k.unread
        let data: Data?
        if let log = overlaid(k) {
            data = try? JSONEncoder().encode(StoredV4(
                p: population.id, base: base, cal: cal, folded: k.folded, log: log, unread: unread))
        } else {
            data = try? JSONEncoder().encode(StoredV4(
                p: population.id, base: base, cal: cal, folded: k.folded, log: k.log, unread: unread))
        }
        if let data {
            Stores.set(data, forKey: key)
        }
    }

    /// The log as it is written: each record read from storage as it was
    /// stored, with what this build knows laid over it. Nil if a record will
    /// not go through `JSONValue`, which every record does.
    private static func overlaid(_ k: Kept) -> [JSONValue]? {
        guard !k.stored.isEmpty else { return nil }
        var out: [JSONValue] = []
        out.reserveCapacity(k.log.count)
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for (i, r) in k.log.enumerated() {
            guard let data = try? encoder.encode(r),
                  let known = try? decoder.decode(JSONValue.self, from: data) else { return nil }
            out.append(i < k.stored.count ? overlay(k.stored[i], known) : known)
        }
        return out
    }

    /// What is in storage, made safe to fold on top of. Every damaged part is
    /// refused, never read around - the same paths as the web app's
    /// `decodeKept`:
    ///
    ///  - no v4 that can be read: the prior.
    ///  - the posterior damaged, the log good: the posterior goes back to its
    ///    start and the whole log is folded again.
    ///  - a record that does not read (a newer build's, most likely): skipped
    ///    and kept in its place (`readLog`), and the rest replayed if that
    ///    changed what the posterior should hold.
    ///  - the log not a list: what it taught is in the posterior, which is
    ///    sound, so that becomes the new base and the log starts again empty.
    ///  - a posterior ahead of its log: the same.
    ///  - a damaged base: dropped, and the log replayed from the prior.
    ///  - a posterior drawn from another population (E7: a release shipped a
    ///    new one), or folded under another model (`modelID`, the store's
    ///    `m`): the log replayed from a prior drawn from this population - "a
    ///    model change is a replay". A base cannot be replayed, and stays.
    ///
    /// A store that held something this build is about to write over - one it
    /// cannot read at all, or a log it has to drop - is kept aside first, as
    /// stored (`unreadKey`), so no build loses what another wrote.
    ///
    /// Whatever comes back starts at this population's centre: the start is
    /// the population's, not stored.
    static func load() -> Kept {
        let raw = UserDefaults.standard.data(forKey: key)
        var (kept, loaded, loses) = decode(raw)
        if loses, let raw { keepUnread(String(decoding: raw, as: UTF8.self)) }
        let start = priorStart(population)
        kept.calibration.start = start
        kept.base?.start = start
        if !loaded { save(kept) }
        return kept
    }

    private static func decode(_ v4: Data?) -> (Kept, loaded: Bool, loses: Bool) {
        let decoder = JSONDecoder()
        guard let v4, let parts = try? decoder.decode(StoredParts.self, from: v4), parts.v == 4 else {
            return (freshKept(), false, v4.map { !$0.isEmpty } ?? false)
        }
        let base = calibration(parts.base)
        let cal = calibration(parts.cal)
        guard let stored = try? decoder.decode(StoredLog.self, from: v4) else {
            let sound = cal ?? base
            return (Kept(base: sound, calibration: start(sound), folded: 0, log: []), false, true)
        }
        let (log, raws, unread, moved) = readLog(stored.log, stored.unread)
        guard !parts.baseDamaged, parts.base == nil || base != nil,
              let cal, let folded = parts.folded, folded >= 0,
              (parts.p ?? literaturePopulation.id) == population.id,
              parts.m == modelID, !moved else {
            return (Kept(base: base, calibration: start(base), folded: 0, log: log, unread: unread, stored: raws), false, false)
        }
        if folded > log.count {
            return (Kept(base: cal, calibration: cal, folded: 0, log: []), false, true)
        }
        return (Kept(base: base, calibration: cal, folded: folded, log: log, unread: unread, stored: raws), true, false)
    }

    /// The stored copies kept aside, oldest first.
    private static func unreadCopies() -> [String] {
        UserDefaults.standard.stringArray(forKey: unreadKey) ?? []
    }

    /// Keep a stored text this build is about to write over, with the newest
    /// others; the same text twice is kept once.
    private static func keepUnread(_ raw: String) {
        var copies = unreadCopies().filter { $0 != raw }
        copies.append(raw)
        Stores.set(Array(copies.suffix(unreadKept)), forKey: unreadKey)
    }

    /// A cook in progress this build could not read (Cook.swift), the newest
    /// one, kept as stored: its egg may be one nothing else holds.
    private static let unreadCookKey = "cookInProgress.unread"

    static func keepUnreadCook(_ data: Data) {
        Stores.set(String(decoding: data, as: UTF8.self), forKey: unreadCookKey)
    }

    /// Every copy kept aside, the stores first, then the cook.
    private static func keptAside() -> [String] {
        unreadCopies() + [UserDefaults.standard.string(forKey: unreadCookKey)].compactMap { $0 }
    }

    /// How many results there are to export: every record, read or not, and
    /// every copy kept aside.
    static func resultsKept(_ k: Kept) -> Int {
        k.log.count + k.unread.count + keptAside().count
    }

    /// The results file (`resultsFile` in EggTimerCore): the store exactly as
    /// stored, the copies kept aside, and the sharing ID if there is one. Read
    /// from storage when it is asked for, so it is what is stored then.
    static func exportText(uid: String?, now: Date = .now) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let stored = UserDefaults.standard.data(forKey: key).map { String(decoding: $0, as: UTF8.self) }
        return resultsFile(
            ResultsMeta(app: .ios, appVersion: appVersion, exported: iso.string(from: now),
                        population: population.id, uid: uid),
            stored: stored, unread: keptAside()
        )
    }

    /// The results file's name, for the local day.
    static func exportName(now: Date = .now) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: now)
        return resultsFileName(day: String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0))
    }

    /// Forget every egg: the posterior, the base under it, the log and every
    /// copy kept aside. A run of wrong answers about how an egg was is
    /// otherwise undone only by deleting the app, and the honest thing is to
    /// let someone take it back.
    static func reset() {
        Stores.remove(key)
        Stores.remove(unreadKey)
        Stores.remove(unreadCookKey)
    }
}
