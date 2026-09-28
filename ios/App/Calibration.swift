import Foundation
import EggTimerCore

/// Bridges the particle filter in `EggTimerCore` to the app, and keeps the
/// record.
///
/// The model's constants come from the literature, and the carryover term has
/// no published measurement behind it at all. Rather than pretend otherwise,
/// the app asks how each egg turned out and folds the answer into a posterior.
/// After about three eggs the suggested time stops moving.
///
/// Since E1 the answer is not thrown away once folded. Each egg is kept as a
/// record (INFERENCE.md section 4) in a log beside the posterior, and the
/// posterior is what `replay` makes of that log - so a later change to the
/// likelihood replays the eggs instead of discarding what they taught. The
/// stored posterior is a cache of that replay; `folded` says how much of the
/// log it has absorbed, and the rest is folded again on launch. The web app
/// keeps its log the same way.
///
/// `Calibration` itself - a posterior and the count of eggs that taught it -
/// now lives in EggTimerCore, because a replay has to carry the count exactly.

/// Everything that is kept, and the invariant that holds it together:
/// `calibration` is `replay(base ?? prior, log.prefix(folded))`.
struct Kept: Sendable {
    /// Where the replay starts when it is not the prior: only ever the posterior
    /// of a log that was damaged and had to be dropped. Nil on every healthy
    /// phone since E2 dropped E1's frozen base.
    var base: Calibration?
    var calibration: Calibration
    var folded: Int
    var log: [EggRecord]
}

enum Calibrations {
    /// The posterior, the base under it, and the log. v4 since E2, whose
    /// particle has six numbers where E1's had three.
    /// Nothing before it is read: no build older than this one left the
    /// owner's devices (D1), so the v1-v3 stores are simply never looked at.
    private static let key = "calibration.v4"

    /// Carried on every record: the web app deploys on push and this one ships
    /// when a build does, and the fit has to know which version said what.
    static let appVersion: String =
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"

    static func fresh() -> Calibration {
        freshCalibration(count: particleCount, seed: calibrationSeed)
    }

    static func freshKept() -> Kept {
        Kept(base: nil, calibration: fresh(), folded: 0, log: [])
    }

    /// Where a replay starts: the base if there is one, the prior if not.
    private static func start(_ base: Calibration?) -> Calibration {
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
        /// The noise scale, the white offset and the tender | firm gap (E2, E3).
        var sd: [Double]
        var wo: [Double]
        var wg: [Double]
        var w: [Double]
    }

    private struct StoredV4: Encodable {
        var v = 4
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
        var base: StoredPosterior?
        var baseDamaged = false
        var cal: StoredPosterior?
        var folded: Int?

        enum CodingKeys: String, CodingKey { case v, base, cal, folded }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            v = try? c.decode(Int.self, forKey: .v)
            if c.contains(.base), (try? c.decodeNil(forKey: .base)) == false {
                base = try? c.decode(StoredPosterior.self, forKey: .base)
                baseDamaged = base == nil
            }
            cal = try? c.decode(StoredPosterior.self, forKey: .cal)
            folded = try? c.decode(Int.self, forKey: .folded)
        }
    }

    private struct StoredLog: Decodable {
        var log: [EggRecord]
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
    /// then on. Same rules as the web app's.
    /// A posterior, or nil if any part of it is damaged. Same rules as the web
    /// app's: alpha, tauAirScale, the noise and the firm gap strictly positive
    /// (a zero noise divides by zero in the probit), weights non-negative, the
    /// two offsets anything finite.
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
        let stored = StoredV4(
            base: k.base.map(columns), cal: columns(k.calibration), folded: k.folded, log: k.log
        )
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// What is in storage, made safe to fold on top of. Every damaged part is
    /// refused, never read around - the same paths as the web app's
    /// `decodeKept`:
    ///
    ///  - no v4 that can be read: the prior.
    ///  - the posterior damaged, the log good: the posterior goes back to its
    ///    start and the whole log is folded again.
    ///  - the log damaged: what it taught is in the posterior, which is sound, so
    ///    that becomes the new base and the log starts again empty.
    ///  - a posterior ahead of its log: the same.
    ///  - a damaged base: dropped, and the log replayed from the prior.
    static func load() -> Kept {
        let (kept, loaded) = decode(UserDefaults.standard.data(forKey: key))
        if !loaded { save(kept) }
        return kept
    }

    private static func decode(_ v4: Data?) -> (Kept, loaded: Bool) {
        let decoder = JSONDecoder()
        guard let v4, let parts = try? decoder.decode(StoredParts.self, from: v4), parts.v == 4 else {
            return (freshKept(), false)
        }
        let base = calibration(parts.base)
        let cal = calibration(parts.cal)
        let log: [EggRecord]? = {
            guard let stored = try? decoder.decode(StoredLog.self, from: v4),
                  stored.log.allSatisfy(validRecord) else { return nil }
            return stored.log
        }()
        guard let log else {
            let sound = cal ?? base
            return (Kept(base: sound, calibration: start(sound), folded: 0, log: []), false)
        }
        guard !parts.baseDamaged, parts.base == nil || base != nil,
              let cal, let folded = parts.folded, folded >= 0 else {
            return (Kept(base: base, calibration: start(base), folded: 0, log: log), false)
        }
        if folded > log.count {
            return (Kept(base: cal, calibration: cal, folded: 0, log: []), false)
        }
        return (Kept(base: base, calibration: cal, folded: folded, log: log), true)
    }

    /// Forget every egg: the posterior, the base under it and the log. A run of
    /// wrong answers about how an egg was is otherwise undone only by deleting
    /// the app, and the honest thing is to let someone take it back.
    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
