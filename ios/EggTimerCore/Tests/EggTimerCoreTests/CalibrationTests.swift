import Testing
import Foundation
@testable import EggTimerCore

/// The Bayesian calibration, against `fixtures/calibration.json`.
///
/// This is the one part of the core with STATE and a random number generator,
/// and it is the part where a transliteration slip is least likely to announce
/// itself. A wrong shift in the RNG does not crash or produce a NaN: it draws a
/// different but entirely plausible prior, and the two implementations quietly
/// stop being the same model. Any seed gives a sensible-looking mean and
/// spread, to the eye.
///
/// So the fixtures carry the prior's every particle and weight, and after
/// each observation the posterior's summary (`PosteriorSummary`), which a
/// particle drawn otherwise moves at the fixtures' tolerance.

/// The fixture's egg, pot and surface, built here from its spec.
private struct Filter {
    let file: [String: Any]
    let egg: Egg
    let setup: CookSetup
    let grid: DoseGrid
    let target: Double

    init() throws {
        file = try Fixtures.load("calibration.json")
        egg = try decoded(Egg.self, file["egg"])
        setup = try decoded(CookSetup.self, file["setup"])
        grid = try doseGrid(file.object("grid")["spec"], egg: egg, setup: setup)
        target = try file.num("logNominalTarget")
    }

    /// A posterior and what is read off it, as the fixture writes one: its
    /// summary, or for the prior every particle and weight; the RNG's state
    /// (which goes negative partway through the sequence, the case a port
    /// that reaches for UInt32 would get wrong), the effective sample size,
    /// the mean time-scale and white offset, and the predicted cook time.
    func readout(_ post: Posterior, whole: Bool = false) -> Readout {
        Readout(
            posterior: whole ? .whole(post) : .summary(PosteriorSummary(post)), ess: effectiveSampleSize(post),
            alphaM2s: posteriorParams(post).alphaM2s,
            meanWhiteOffset: posteriorMeanWhiteOffset(post), predict: predictCookTime(post, grid, target)
        )
    }
}

/// A posterior written whole, or in summary.
private enum Written: Encodable {
    case whole(Posterior)
    case summary(PosteriorSummary)

    func encode(to encoder: Encoder) throws {
        switch self {
        case .whole(let p): try p.encode(to: encoder)
        case .summary(let s): try s.encode(to: encoder)
        }
    }
}

private struct Readout: Encodable {
    let posterior: Written
    let ess: Double
    let alphaM2s: Double
    let meanWhiteOffset: Double
    let predict: CookTimePrediction

    enum CodingKeys: String, CodingKey {
        case posterior, ess, alphaM2s = "alpha_m2s", meanWhiteOffset, predict
    }
}

/// One five-word update as the fixture writes it: the answer, then the first
/// particle's five probabilities, the posterior predictive and the first
/// particle's likelihood before the fold, and the set after it.
private struct WordUpdate: Encodable {
    let cookTimeS: Double
    let yolkWord: YolkWord?
    let white: WhiteReport?
    let firstProbit: [Double]
    let predictive: [Double]
    let firstLikelihood: Double
    let after: Readout

    enum CodingKeys: String, CodingKey {
        case cookTimeS = "cookTime_s", yolkWord, white, firstProbit, predictive, firstLikelihood, after
    }
}

@Suite("Dose grid")
struct DoseGridConformance {
    @Test("every cell of the cached surface")
    func cells() throws {
        let f = try Filter()
        try expectJSON(f.grid, f.file.object("grid")["surface"], "the surface")
    }

    /// Includes points off the grid on both axes. The clamp is where an
    /// off-by-one in the bilinear indexing would hide, because inside the grid
    /// a wrong corner is still a plausible number.
    @Test("interpolation, including the clamp outside the grid")
    func lookups() throws {
        let f = try Filter()
        for row in try f.file.rows("lookups") {
            let (alpha, time) = try (row.num("alpha_m2s"), row.num("cookTime_s"))
            let got = [
                "alpha_m2s": alpha, "cookTime_s": time, "logYolk": lookupLogYolkDose(f.grid, alpha, time),
                "logWhite": lookupLogWhiteDose(f.grid, alpha, time),
            ]
            expectJSON(got, row, "at alpha \(alpha), t \(time)")
        }
    }

    @Test("inverting the surface for a cook time")
    func inverse() throws {
        let f = try Filter()
        for row in try f.file.rows("inverse") {
            try expectClose(
                cookTimeForLogYolkDose(f.grid, row.num("alpha_m2s"), row.num("logDose")), row.num("cookTime_s"),
                "cookTimeForLogYolkDose at alpha \(row.num("alpha_m2s"))"
            )
        }
    }
}

@Suite("Particle filter")
struct InferenceConformance {
    @Test("the prior, particle by particle")
    func prior() throws {
        let f = try Filter()
        let prior = try f.file.object("prior")
        let post = try createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        var expected = prior
        expected["count"] = nil
        expected["seed"] = nil
        expectJSON(f.readout(post, whole: true), expected, "the prior")
    }

    /// The filter told the yolk the cook got, in five words, and the white,
    /// from the prior. Folds that drive the effective sample size below n/2
    /// resample, which is the only part of the filter that touches the RNG
    /// after the prior.
    @Test("every five-word update: one particle's five, the predictive, and the set in summary")
    func wordUpdates() throws {
        let f = try Filter()
        let prior = try f.file.object("prior")
        var post = try createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        for (i, step) in try f.file.rows("wordUpdates").enumerated() {
            let word = try step.optionalValue(YolkWord.self, "yolkWord")
            let white = try step.optionalValue(WhiteReport.self, "white")
            let t = try step.num("cookTime_s")
            let before = (
                probit: yolkWordProbit(f.grid, post.particles[0], t), predictive: yolkWordProbabilities(post, f.grid, t),
                likelihood: answerLikelihood(f.grid, post.particles[0], t, yolkWord: word, white: white)
            )
            updatePosterior(&post, grid: f.grid, cookTimeS: t, yolkWord: word, white: white)
            let update = WordUpdate(
                cookTimeS: t, yolkWord: word, white: white, firstProbit: before.probit, predictive: before.predictive,
                firstLikelihood: before.likelihood, after: f.readout(post)
            )
            expectJSON(update, step, "word update \(i)")
        }
    }

    /// A white-only answer resampling from a known starting point: a set the
    /// reference sharpened until it sat just above the threshold, rather than
    /// one this implementation could redraw - see `whiteResample` in
    /// tools/fixtures/calibration.ts.
    @Test("a white answer that degenerates the set resamples identically")
    func whiteResample() throws {
        let f = try Filter()
        let step = try f.file.object("whiteResample")
        let before = try step.object("before")
        var post = try decoded(Posterior.self, before["posterior"])
        try expectClose(effectiveSampleSize(post), before.num("ess"), "whiteResample: starting ess")
        #expect(
            effectiveSampleSize(post) >= Double(post.particles.count) / 2.0,
            "the fixture is meant to START above the resample threshold"
        )
        let white = try #require(try step.optionalValue(WhiteReport.self, "white"), "whiteResample has no white answer")
        updatePosterior(&post, grid: f.grid, cookTimeS: try step.num("cookTime_s"), yolkWord: nil, white: white)
        expectJSON(f.readout(post), step["after"], "whiteResample")
    }
}
