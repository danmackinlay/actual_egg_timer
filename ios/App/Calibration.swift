import Foundation
import EggTimerCore

/// Bridges the particle filter in `EggTimerCore` to the app.
///
/// The model's constants come from the literature, and the carryover term has
/// no published measurement behind it at all. Rather than pretend otherwise,
/// the app asks how each egg turned out and folds the answer into a posterior.
/// After about three eggs the suggested time stops moving.
///
/// Building the dose surface costs roughly a second, which is far too slow to
/// sit anywhere near a slider - so it happens once per logged outcome, after
/// the egg has been eaten, and never while anything is being adjusted.
struct Calibration: Sendable {
    var posterior: Posterior
    var eggsLogged: Int
}

enum Calibrations {
    private static let key = "calibration.v1"

    static func fresh() -> Calibration {
        Calibration(
            posterior: createPrior(count: particleCount, seed: calibrationSeed), eggsLogged: 0
        )
    }

    /// Parameters to solve with. Before any feedback this is the prior mean,
    /// which is identical to shipping the literature values - so the app is
    /// fully useful on day one and calibration is purely additive.
    static func params(_ c: Calibration) -> ModelParams {
        c.eggsLogged == 0 ? .default : posteriorParams(c.posterior)
    }

    /// Spread of the posterior on alpha, as a percentage. Plateaus near 3%:
    /// ordinal feedback carries 1-2 bits per egg, so learning correctly stops
    /// rather than falsely converging.
    static func spread(_ c: Calibration) -> Double {
        c.eggsLogged == 0 ? 0 : 100 * posteriorAlphaRelSd(c.posterior)
    }

    /// Fold in one outcome. Builds the dose surface for the cook that was
    /// actually performed, then reweights.
    ///
    /// `nonisolated` and pure - takes a calibration and returns the new one -
    /// so the caller can run the whole thing off the main actor without any of
    /// it being shared while it runs.
    nonisolated static func recordOutcome(
        _ c: Calibration, egg: Egg, setup: CookSetup,
        cookTimeS: Double, logNominalTarget: Double, feedback: Feedback
    ) -> Calibration {
        let current = params(c)
        // The grid's extent decides what the filter can see, and therefore what
        // the posterior becomes. It is core policy precisely so that the web
        // app cannot learn something different from the same egg.
        let g = calibrationGrid(alphaCentre: current.alphaM2s, cookTimeS: cookTimeS)
        let grid = buildDoseGrid(
            egg: egg, setup: setup, tauAirScale: current.tauAirScale,
            alphaMin: g.alphaMin, alphaMax: g.alphaMax, alphaCount: g.alphaCount,
            timeMinS: g.timeMinS, timeMaxS: g.timeMaxS, timeCount: g.timeCount
        )
        var posterior = c.posterior
        updatePosterior(
            &posterior, grid: grid,
            cookTimeS: cookTimeS, logNominalTarget: logNominalTarget, feedback: feedback
        )
        return Calibration(posterior: posterior, eggsLogged: c.eggsLogged + 1)
    }

    // MARK: - Persistence

    /// Column-wise and rounded. A thousand particles at full precision is well
    /// over 100 kB of JSON, and nothing downstream can tell the difference at
    /// five figures - the posterior's own spread is three orders of magnitude
    /// wider than the rounding.
    private struct Stored: Codable {
        var v: Int
        var n: Int
        var rng: Int32
        var a: [Double]
        var o: [Double]
        var t: [Double]
        var w: [Double]
    }

    static func save(_ c: Calibration) {
        let p = c.posterior.particles
        var stored = Stored(
            v: 1, n: c.eggsLogged, rng: c.posterior.rng,
            a: [], o: [], t: [], w: []
        )
        stored.a.reserveCapacity(p.count)
        for i in 0..<p.count {
            stored.a.append(significant(p[i].alphaM2s, 7))
            stored.o.append(significant(p[i].logDoseOffset, 5))
            stored.t.append(significant(p[i].tauAirScale, 5))
            stored.w.append(significant(c.posterior.weights[i], 5))
        }
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// Whatever is in storage, or a fresh prior if it is missing, from another
    /// version, or damaged. A half-valid posterior is worse than none: a single
    /// NaN weight would poison every solve from then on.
    static func load() -> Calibration {
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let s = try? JSONDecoder().decode(Stored.self, from: data),
            s.v == 1, s.n >= 0, !s.a.isEmpty,
            s.o.count == s.a.count, s.t.count == s.a.count, s.w.count == s.a.count,
            s.a.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.o.allSatisfy(\.isFinite),
            s.t.allSatisfy({ $0.isFinite && $0 > 0 }),
            s.w.allSatisfy({ $0.isFinite && $0 >= 0 })
        else { return fresh() }

        var particles = [Particle]()
        particles.reserveCapacity(s.a.count)
        for i in 0..<s.a.count {
            particles.append(Particle(
                alphaM2s: s.a[i], logDoseOffset: s.o[i], tauAirScale: s.t[i]
            ))
        }
        return Calibration(
            posterior: Posterior(particles: particles, weights: s.w, rng: s.rng),
            eggsLogged: s.n
        )
    }

    /// Clear the posterior. A run of wrong answers to "How was it?" is
    /// otherwise undone only by deleting the app, and the honest thing is to
    /// let someone take it back.
    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func significant(_ v: Double, _ digits: Int) -> Double {
        guard v.isFinite, v != 0 else { return v }
        let scale = pow(10.0, Double(digits) - 1 - (log10(abs(v))).rounded(.down))
        return (v * scale).rounded() / scale
    }
}
