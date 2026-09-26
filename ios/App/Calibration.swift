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
/// stored posterior is a cache of that replay; `folded` says how much of the log
/// it has absorbed, and the rest is folded again on launch. The web app keeps
/// its log the same way.
///
/// `Calibration` itself - a posterior and the count of eggs that taught it -
/// now lives in EggTimerCore, because a replay has to carry the count exactly.

/// Everything that is kept, and the invariant that holds it together:
/// `calibration` is `replay(base ?? prior, log.prefix(folded))`.
struct Kept: Sendable {
    /// The frozen v2 posterior this phone migrated with, or nil. See `baseKey`.
    var base: Calibration?
    var calibration: Calibration
    var folded: Int
    var log: [EggRecord]
}

enum Calibrations {
    /// The posterior, the frozen base under it, and the log.
    private static let key = "calibration.v3"

    /// The posterior E1 replaces - read ONCE, and kept as the frozen base.
    ///
    /// It was learned from real eggs under the likelihood that is still in
    /// force, so it is as good as it was yesterday; what it lacks is the eggs
    /// themselves, which were never written down. So it becomes the BASE: the
    /// posterior a replay starts from instead of the prior, with the log folded
    /// on top. A base cannot be replayed, so it cannot survive a change to the
    /// likelihood: it is dropped at the next one (E2), which starts from the
    /// prior and replays the log alone. The web app does the same.
    private static let baseKey = "calibration.v2"

    /// The posterior v2 replaced, deleted rather than read.
    ///
    /// The shape did not change when the white channel landed - no particle
    /// gained a field - so a v1 record could have been loaded verbatim. It is
    /// dropped anyway, because of what is IN it: every observation in a v1
    /// posterior was folded under a likelihood that attributed the white's
    /// behaviour to the yolk, and at least one real one is known to have been a
    /// white complaint recorded on the yolk axis. Carrying that forward would
    /// import a miscoded observation into a model that now has somewhere correct
    /// to put it. A fresh prior is the literature values, which is a worse
    /// starting point than a good posterior and a better one than a confidently
    /// wrong posterior. The web app drops its own the same way.
    private static let supersededKey = "calibration.v1"

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

    /// Parameters to solve with. Before any feedback this is the literature
    /// values, so the app is fully useful on day one and calibration is purely
    /// additive.
    static func params(_ c: Calibration) -> ModelParams {
        calibrationParams(c)
    }

    /// Spread of the posterior on alpha, as a percentage. Plateaus near 3%:
    /// ordinal feedback carries 1-2 bits per egg, so learning correctly stops
    /// rather than falsely converging.
    static func spread(_ c: Calibration) -> Double {
        c.eggsLogged == 0 ? 0 : 100 * posteriorAlphaRelSd(c.posterior)
    }

    // MARK: - Persistence

    /// Column-wise. The current posterior is written at full precision: it is a
    /// cache of a replay, and a cache that rounds is one a replay can never
    /// match. JSONEncoder writes a double so that it reads back as the same
    /// double, which the core's tests check. A migrated base keeps the rounding
    /// it was stored with in v2.
    private struct StoredPosterior: Codable {
        var n: Int
        var rng: Int32
        var a: [Double]
        var o: [Double]
        var t: [Double]
        var w: [Double]
    }

    private struct StoredV3: Encodable {
        var v = 3
        var base: StoredPosterior?
        var cal: StoredPosterior
        var folded: Int
        var log: [EggRecord]
    }

    /// The parts of a stored v3 read one at a time, so a damaged part is refused
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

    /// What v2 stored: the same columns, rounded, with a version.
    private struct StoredV2: Decodable {
        var v: Int
        var n: Int
        var rng: Int32
        var a: [Double]
        var o: [Double]
        var t: [Double]
        var w: [Double]
    }

    private static func columns(_ c: Calibration) -> StoredPosterior {
        let p = c.posterior.particles
        return StoredPosterior(
            n: c.eggsLogged, rng: c.posterior.rng,
            a: p.map(\.alphaM2s), o: p.map(\.logDoseOffset), t: p.map(\.tauAirScale),
            w: c.posterior.weights
        )
    }

    /// A posterior, or nil if any part of it is damaged. A half-valid posterior
    /// is worse than none: a single NaN weight would poison every solve from
    /// then on. Same rules as the web app's.
    private static func calibration(
        n: Int, rng: Int32, a: [Double], o: [Double], t: [Double], w: [Double]
    ) -> Calibration? {
        guard
            n >= 0, !a.isEmpty, o.count == a.count, t.count == a.count, w.count == a.count,
            a.allSatisfy({ $0.isFinite && $0 > 0 }),
            o.allSatisfy(\.isFinite),
            t.allSatisfy({ $0.isFinite && $0 > 0 }),
            w.allSatisfy({ $0.isFinite && $0 >= 0 })
        else { return nil }
        var particles = [Particle]()
        particles.reserveCapacity(a.count)
        for i in 0..<a.count {
            particles.append(Particle(alphaM2s: a[i], logDoseOffset: o[i], tauAirScale: t[i]))
        }
        return Calibration(posterior: Posterior(particles: particles, weights: w, rng: rng), eggsLogged: n)
    }

    private static func calibration(_ s: StoredPosterior?) -> Calibration? {
        guard let s else { return nil }
        return calibration(n: s.n, rng: s.rng, a: s.a, o: s.o, t: s.t, w: s.w)
    }

    static func save(_ k: Kept) {
        let stored = StoredV3(
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
    ///  - no v3, a good v2: the v2 posterior becomes the frozen base.
    ///  - the posterior damaged, the log good: the posterior goes back to its
    ///    start and the whole log is folded again.
    ///  - the log damaged: what it taught is in the posterior, which is sound, so
    ///    that becomes the new base and the log starts again empty.
    ///  - a posterior ahead of its log: the same.
    ///  - a damaged base: dropped, and the log replayed from the prior.
    static func load() -> Kept {
        let defaults = UserDefaults.standard
        // Whatever v1 left behind goes now, rather than sitting in UserDefaults
        // being neither read nor collected.
        defaults.removeObject(forKey: supersededKey)
        let (kept, loaded) = decode(defaults.data(forKey: key), defaults.data(forKey: baseKey))
        if !loaded { save(kept) }
        // The v2 key is the only copy of a base until a v3 holding it is written.
        if defaults.data(forKey: key) != nil { defaults.removeObject(forKey: baseKey) }
        return kept
    }

    private static func decode(_ v3: Data?, _ v2: Data?) -> (Kept, loaded: Bool) {
        let decoder = JSONDecoder()
        guard let v3, let parts = try? decoder.decode(StoredParts.self, from: v3), parts.v == 3 else {
            guard let v2, let old = try? decoder.decode(StoredV2.self, from: v2), old.v == 2,
                  let base = calibration(n: old.n, rng: old.rng, a: old.a, o: old.o, t: old.t, w: old.w)
            else { return (freshKept(), false) }
            return (Kept(base: base, calibration: base, folded: 0, log: []), false)
        }
        let base = calibration(parts.base)
        let cal = calibration(parts.cal)
        let log: [EggRecord]? = {
            guard let stored = try? decoder.decode(StoredLog.self, from: v3),
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
        UserDefaults.standard.removeObject(forKey: baseKey)
        UserDefaults.standard.removeObject(forKey: supersededKey)
    }
}
