import Testing
import Foundation
@testable import EggTimerCore

/// The Bayesian calibration, against `fixtures/calibration.json`.
///
/// This is the one part of the core with STATE and a random number generator,
/// and it is the part where a transliteration slip is least likely to announce
/// itself. A wrong shift in the RNG does not crash or produce a NaN: it draws a
/// different but entirely plausible prior, and the two implementations quietly
/// stop being the same model. Summary statistics would not catch it either -
/// any seed gives a sensible-looking mean and spread.
///
/// So the fixtures carry every particle and every weight, before the first
/// observation and after each one, and this compares all of them.

private struct Calibration {
    let egg: Egg
    let setup: CookSetup
    let file: [String: Any]
    let gridJSON: [String: Any]
}

private func loadCalibration() throws -> Calibration {
    let file = try Fixtures.load("calibration.json")
    let eggJSON = try file.object("egg")
    let setupJSON = try file.object("setup")
    let gridJSON = try file.object("grid")
    // Rebuilt from the recorded mass, so the geometry is exercised here too.
    let egg = try Geometry.eggFromMass(eggJSON.num("mass_kg"))
    let setup = try cookSetup(setupJSON)
    return Calibration(egg: egg, setup: setup, file: file, gridJSON: gridJSON)
}

@Suite("Dose grid")
struct DoseGridConformance {
    @Test("every cell of the cached surface")
    func cells() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)

        try expectClose(grid.logAlphaMin, c.gridJSON.num("logAlphaMin"), "logAlphaMin")
        try expectClose(grid.logAlphaStep, c.gridJSON.num("logAlphaStep"), "logAlphaStep")
        try expectClose(grid.timeStepS, c.gridJSON.num("timeStep_s"), "timeStep_s")

        let yolk = try c.gridJSON.numbers("logYolk")
        let white = try c.gridJSON.numbers("logWhite")
        #expect(grid.logYolk.count == yolk.count)
        #expect(grid.logWhite.count == white.count)
        for i in 0..<yolk.count {
            expectClose(grid.logYolk[i], yolk[i], "logYolk[\(i)]")
            expectClose(grid.logWhite[i], white[i], "logWhite[\(i)]")
        }
    }

    /// Includes points off the grid on both axes. The clamp is where an
    /// off-by-one in the bilinear indexing would hide, because inside the grid
    /// a wrong corner is still a plausible number.
    @Test("interpolation, including the clamp outside the grid")
    func lookups() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)
        for row in try c.file.rows("lookups") {
            let alpha = try row.num("alpha_m2s")
            let time = try row.num("cookTime_s")
            try expectClose(
                lookupLogYolkDose(grid, alpha, time), row.num("logYolk"),
                "logYolk at alpha \(alpha), t \(time)"
            )
            try expectClose(
                lookupLogWhiteDose(grid, alpha, time), row.num("logWhite"),
                "logWhite at alpha \(alpha), t \(time)"
            )
        }
    }

    @Test("inverting the surface for a cook time")
    func inverse() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)
        for row in try c.file.rows("inverse") {
            try expectClose(
                cookTimeForLogYolkDose(grid, row.num("alpha_m2s"), row.num("logDose")),
                row.num("cookTime_s"),
                "cookTimeForLogYolkDose at alpha \(row.num("alpha_m2s"))"
            )
        }
    }
}

@Suite("Particle filter")
struct InferenceConformance {
    /// Compare a whole particle set, one number at a time. Anything less would
    /// pass with the wrong random number generator.
    private func expectPosterior(
        _ post: Posterior, _ expected: [String: Any], _ label: String,
        _ grid: DoseGrid, _ logNominalTarget: Double
    ) throws {
        let particles = try expected.rows("particles")
        let weights = try expected.numbers("weights")
        #expect(post.particles.count == particles.count, "\(label): particle count")
        #expect(post.weights.count == weights.count, "\(label): weight count")

        for i in 0..<particles.count {
            try expectClose(post.particles[i].alphaM2s, particles[i].num("alpha_m2s"), "\(label) particle \(i) alpha")
            try expectClose(post.particles[i].logDoseOffset, particles[i].num("logDoseOffset"), "\(label) particle \(i) offset")
            try expectClose(post.particles[i].noise, particles[i].num("noise"), "\(label) particle \(i) noise")
            try expectClose(post.particles[i].whiteOffset, particles[i].num("whiteOffset"), "\(label) particle \(i) white offset")
            try expectClose(post.particles[i].whiteFirmGap, particles[i].num("whiteFirmGap"), "\(label) particle \(i) firm gap")
            expectClose(post.weights[i], weights[i], "\(label) weight \(i)")
        }

        // The RNG state itself, as a signed 32-bit integer. It goes negative
        // partway through this sequence, which is the case a port that reaches
        // for UInt32 or Int throughout would get wrong.
        let rng = try #require(expected["rng"] as? NSNumber, "\(label): no rng")
        #expect(post.rng == Int32(truncating: rng), "\(label): rng state")

        try expectClose(effectiveSampleSize(post), expected.num("ess"), "\(label) ess")
        let params = posteriorParams(post)
        try expectClose(params.alphaM2s, expected.num("alpha_m2s"), "\(label) mean alpha")
        try expectClose(posteriorMeanWhiteOffset(post), expected.num("meanWhiteOffset"), "\(label) mean white offset")

        let predictJSON = try expected.object("predict")
        let predicted = predictCookTime(post, grid, logNominalTarget)
        try expectClose(predicted.lowS, predictJSON.num("low_s"), "\(label) predict low")
        try expectClose(predicted.medianS, predictJSON.num("median_s"), "\(label) predict median")
        try expectClose(predicted.highS, predictJSON.num("high_s"), "\(label) predict high")
    }

    @Test("the prior, particle by particle")
    func prior() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)
        let priorJSON = try c.file.object("prior")
        let target = try c.file.num("logNominalTarget")
        let post = try createPrior(
            count: Int(priorJSON.num("count")),
            seed: Int32(priorJSON.num("seed"))
        )
        try expectPosterior(post, priorJSON, "prior", grid, target)
    }

    /// The filter told the yolk the cook got, in five words,
    /// and the white, from the prior: the first particle's five probabilities,
    /// the posterior predictive, the first particle's likelihood, and the set.
    /// Folds that drive the effective sample size below n/2 resample, which is
    /// the only part of the filter that touches the RNG after the prior.
    @Test("every five-word update: one particle's five, the predictive, and the whole set")
    func wordUpdates() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)
        let priorJSON = try c.file.object("prior")
        var post = try createPrior(
            count: Int(priorJSON.num("count")),
            seed: Int32(priorJSON.num("seed"))
        )
        let target = try c.file.num("logNominalTarget")
        for (i, step) in try c.file.rows("wordUpdates").enumerated() {
            let word = try step.optionalValue(YolkWord.self, "yolkWord")
            let white = try step.optionalValue(WhiteReport.self, "white")
            let cookTimeS = try step.num("cookTime_s")
            let probit = yolkWordProbit(grid, post.particles[0], cookTimeS)
            for (k, p) in try step.numbers("firstProbit").enumerated() {
                expectClose(probit[k], p, "word update \(i): the first particle's word \(k)")
            }
            let predictive = yolkWordProbabilities(post, grid, cookTimeS)
            for (k, p) in try step.numbers("predictive").enumerated() {
                expectClose(predictive[k], p, "word update \(i): the predictive's word \(k)")
            }
            try expectClose(
                answerLikelihood(grid, post.particles[0], cookTimeS, yolkWord: word, white: white),
                step.num("firstLikelihood"), "word update \(i): the first particle's likelihood"
            )
            updatePosterior(&post, grid: grid, cookTimeS: cookTimeS, yolkWord: word, white: white)
            try expectPosterior(
                post, step.object("after"), "word update \(i) (\(word?.rawValue ?? "-") / \(white?.rawValue ?? "-"))",
                grid, target
            )
        }
    }

    /// A white-only answer resampling from a known starting point: a set the
    /// reference sharpened until it sat just above the threshold.
    @Test("a white answer that degenerates the set resamples identically")
    func whiteResample() throws {
        let c = try loadCalibration()
        let grid = try doseGrid(c.gridJSON, egg: c.egg, setup: c.setup)
        let step = try c.file.object("whiteResample")
        let before = try step.object("before")
        let after = try step.object("after")
        let white = try #require(try step.optionalValue(WhiteReport.self, "white"), "whiteResample has no white answer")
        let target = try c.file.num("logNominalTarget")
        // A particle set the reference constructed rather than one this
        // implementation could redraw - see `whiteResample` in tools/fixtures/calibration.ts.
        var post = try posterior(before)
        try expectClose(effectiveSampleSize(post), before.num("ess"), "whiteResample: starting ess")
        #expect(
            effectiveSampleSize(post) >= Double(post.particles.count) / 2.0,
            "the fixture is meant to START above the resample threshold"
        )
        let cookTimeS = try step.num("cookTime_s")
        updatePosterior(&post, grid: grid, cookTimeS: cookTimeS, yolkWord: nil, white: white)
        try expectPosterior(post, after, "whiteResample", grid, target)
    }

    @Test("the likelihood's constants and priors match the reference")
    func constants() throws {
        let c = try loadCalibration()
        let l = try c.file.object("likelihood")
        try expectClose(feedbackBand, l.num("feedbackBand"), "FEEDBACK_BAND")
        try expectClose(unrelated, l.num("unrelated"), "UNRELATED")
        try expectClose(noiseMedian, l.num("noiseMedian"), "NOISE_MEDIAN")
        try expectClose(noiseLogSd, l.num("noiseLogSd"), "NOISE_LOG_SD")
        try expectClose(whiteOffsetSd, l.num("whiteOffsetSd"), "WHITE_OFFSET_SD")
        try expectClose(whiteFirmGapMedian, l.num("whiteFirmGapMedian"), "WHITE_FIRM_GAP_MEDIAN")
        try expectClose(whiteFirmGapLogSd, l.num("whiteFirmGapLogSd"), "WHITE_FIRM_GAP_LOG_SD")
        try expectClose(kernelDiscount, l.num("kernelDiscount"), "KERNEL_DISCOUNT")
        let cuts = try l.numbers("yolkWordCuts")
        #expect(cuts.count == yolkWordCuts.count, "four cutpoints between five words")
        for k in cuts.indices { expectClose(yolkWordCuts[k], cuts[k], "YOLK_WORD_CUTS[\(k)]") }
    }

    /// The cuts are literals so that stored words keep their meaning; this
    /// fails when an anchor moves, so whoever moves one chooses what the
    /// stored words mean then (src/core/infer.ts, `YOLK_WORD_CUTS`).
    @Test("the frozen yolk word cuts are today's anchors' midpoints")
    func yolkWordCutsFrozen() {
        let lo = log10(yolkDoseRunny)
        let hi = log10(yolkDoseHard)
        #expect(yolkWordCuts.count == donenessAnchors.count - 1)
        for i in 0..<(donenessAnchors.count - 1) {
            let edge = 0.5 * (donenessAnchors[i].level + donenessAnchors[i + 1].level)
            #expect(abs(yolkWordCuts[i] - (lo + (hi - lo) * edge)) < 1e-12, "cut \(i)")
        }
    }
}
