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

enum Calibrations {
    /// The posterior, the base under it, and the log. v4: a particle of six
    /// numbers, and records of today's shape only.
    private static let key = "calibration.v4"

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
        /// The noise scale, the white offset and the tender | firm gap.
        var sd: [Double]
        var wo: [Double]
        var wg: [Double]
        var w: [Double]
    }

    private struct StoredV4: Encodable {
        var v = 4
        /// The population the posterior was drawn from.
        var p: String
        /// The `modelID` the posterior was folded under.
        var m: String = modelID
        var base: StoredPosterior?
        var cal: StoredPosterior
        var folded: Int
        var log: [EggRecord]
    }

    /// The parts of a stored v4 read one at a time, so a damaged part is refused
    /// on its own instead of taking the rest down with it. The log is read by
    /// `StoredLog`, separately, for the same reason.
    private struct StoredParts: Decodable {
        var v: Int?
        var p: String?
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

    /// The log, every record of it, or nothing: one record this build cannot
    /// read refuses the whole log, as the web's `parseLog` does.
    private struct StoredLog: Decodable {
        var log: [EggRecord]
    }

    private static func columns(_ c: Calibration) -> StoredPosterior {
        let p = c.posterior.particles
        return StoredPosterior(
            n: c.eggsLogged, rng: c.posterior.rng,
            a: p.map(\.alphaM2s), o: p.map(\.logDoseOffset),
            sd: p.map(\.noise), wo: p.map(\.whiteOffset), wg: p.map(\.whiteFirmGap),
            w: c.posterior.weights
        )
    }

    /// A posterior, or nil if any part of it is damaged. A half-valid posterior
    /// is worse than none: a single NaN weight would poison every solve from
    /// then on. Same rules as the web app's: alpha, the noise and the firm gap
    /// strictly positive (a zero noise divides by zero in the probit), weights
    /// non-negative, the two offsets anything finite.
    private static func calibration(_ s: StoredPosterior?) -> Calibration? {
        guard let s else { return nil }
        let a = s.a
        guard
            s.n >= 0, !a.isEmpty,
            [s.o.count, s.sd.count, s.wo.count, s.wg.count, s.w.count].allSatisfy({ $0 == a.count }),
            a.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.o.allSatisfy(\.isFinite),
            s.sd.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.wo.allSatisfy(\.isFinite),
            s.wg.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.w.allSatisfy({ $0.isFinite && $0 >= 0 })
        else { return nil }
        var particles = [Particle]()
        particles.reserveCapacity(a.count)
        for i in 0..<a.count {
            particles.append(Particle(
                alphaM2s: a[i], logDoseOffset: s.o[i],
                noise: s.sd[i], whiteOffset: s.wo[i], whiteFirmGap: s.wg[i]
            ))
        }
        return Calibration(posterior: Posterior(particles: particles, weights: s.w, rng: s.rng), eggsLogged: s.n)
    }

    static func save(_ k: Kept) {
        let data = try? JSONEncoder().encode(StoredV4(
            p: population.id, base: k.base.map(columns), cal: columns(k.calibration), folded: k.folded, log: k.log))
        if let data {
            Stores.set(data, forKey: key)
        }
        #if DEBUG
        let last = k.log.last.flatMap { try? JSONEncoder().encode($0) }.map { String(decoding: $0, as: UTF8.self) }
        Screenshots.log("log \(k.log.count) folded \(k.folded) last \(last ?? "-")")
        #endif
    }

    /// What is in storage, made safe to fold on top of. The store is read
    /// apart here, part by part; what to keep of it is EggTimerCore's
    /// `loadDecision`, the web's too, whose header has every path. Every
    /// damaged part is refused, never read around: a store this build cannot
    /// read is dropped, a log with a record it cannot read is dropped with
    /// what it taught kept as the base, and a posterior folded under another
    /// model or drawn from another population is replayed - "a model change
    /// is a replay".
    ///
    /// Whatever comes back starts at this population's centre: the start is
    /// the population's, not stored.
    static func load() -> Kept {
        var (kept, path) = decode(UserDefaults.standard.data(forKey: key))
        let start = priorStart(population)
        kept.calibration.start = start
        kept.base?.start = start
        if path != .loaded { save(kept) }
        return kept
    }

    private static func decode(_ v4: Data?) -> (Kept, path: LoadPath) {
        let decoder = JSONDecoder()
        let parts = v4.flatMap { try? decoder.decode(StoredParts.self, from: $0) }.flatMap { $0.v == 4 ? $0 : nil }
        let base = calibration(parts?.base)
        let cal = calibration(parts?.cal)
        // A base the store leaves out is none: this app leaves it out when
        // there is none. (The web, which writes null, reads it as damaged.)
        let baseRead: StoredBase? = parts.flatMap { p in
            p.baseDamaged || (p.base != nil && base == nil) ? .damaged : base != nil ? .sound : nil
        }
        let log = parts == nil ? nil
            : v4.flatMap { try? decoder.decode(StoredLog.self, from: $0) }.flatMap { $0.log.allSatisfy(validRecord) ? $0.log : nil }
        let d = loadDecision(
            StoreRead(
                readable: parts != nil, base: baseRead,
                posterior: cal != nil, folded: parts?.folded.flatMap { $0 >= 0 ? $0 : nil },
                records: log?.count, population: parts?.p, model: parts?.m
            ),
            population: population.id, model: modelID
        )
        let keptBase: Calibration? = switch d.base {
        case .stored: base
        case .posterior: cal
        case nil: nil
        }
        let kept = Kept(
            base: keptBase,
            calibration: d.calibration == .posterior ? cal ?? start(keptBase) : start(keptBase),
            folded: d.folded, log: d.log ? log ?? [] : []
        )
        return (kept, d.path)
    }

    /// How many results there are to export: every egg in the log.
    static func resultsKept(_ k: Kept) -> Int {
        k.log.count
    }

    /// The results file (`resultsFile` in EggTimerCore): the store exactly as
    /// stored, and the sharing ID if there is one. Read from storage when it
    /// is asked for, so it is what is stored then.
    static func exportText(uid: String?, now: Date = AppClock.now) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let stored = UserDefaults.standard.data(forKey: key).map { String(decoding: $0, as: UTF8.self) }
        return resultsFile(
            ResultsMeta(app: .ios, appVersion: appVersion, exported: iso.string(from: now),
                        population: population.id, uid: uid),
            stored: stored
        )
    }

    /// The results file's name, for the local day.
    static func exportName(now: Date = AppClock.now) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: now)
        return resultsFileName(day: String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0))
    }

    /// Forget every egg: the posterior, the base under it and the log. A run
    /// of wrong answers about how an egg was is otherwise undone only by
    /// deleting the app, and the honest thing is to let someone take it back.
    static func reset() {
        Stores.remove(key)
    }
}
