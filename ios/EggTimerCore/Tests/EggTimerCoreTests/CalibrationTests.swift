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
private let tolerance = 1e-12

private func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}

private struct Calibration {
    let egg: Egg
    let setup: CookSetup
    let file: [String: Any]
    let gridJSON: [String: Any]
}

private func loadCalibration() -> Calibration {
    let file = Fixtures.load("calibration.json")
    guard let eggJSON = file["egg"] as? [String: Any],
          let setupJSON = file["setup"] as? [String: Any],
          let gridJSON = file["grid"] as? [String: Any],
          let startMode = StartMode(rawValue: setupJSON["startMode"] as? String ?? ""),
          let cooling = Cooling(rawValue: setupJSON["cooling"] as? String ?? "") else {
        fatalError("fixtures/calibration.json is not shaped as expected")
    }
    // Rebuilt from the recorded mass, so the geometry is exercised here too.
    let egg = Geometry.eggFromMass(eggJSON.num("mass_kg"))
    let afterBoil = HeatAfterBoil(rawValue: setupJSON["afterBoil"] as? String ?? "hold") ?? .hold
    let setup = CookSetup(
        startMode: startMode,
        eggStartC: setupJSON.num("eggStart_C"),
        ambientC: setupJSON.num("ambient_C"),
        boilingC: setupJSON.num("boiling_C"),
        timeToBoilS: setupJSON.num("timeToBoil_s"),
        cooling: cooling,
        waterLitres: setupJSON.num("waterLitres"),
        afterBoil: afterBoil,
        eggCount: setupJSON.num("eggCount")
    )
    return Calibration(egg: egg, setup: setup, file: file, gridJSON: gridJSON)
}

private func buildFixtureGrid(_ c: Calibration) -> DoseGrid {
    buildDoseGrid(
        egg: c.egg, setup: c.setup, tauAirScale: c.gridJSON.num("tauAirScale"),
        alphaMin: c.gridJSON.num("alphaMin"),
        alphaMax: c.gridJSON.num("alphaMax"),
        alphaCount: Int(c.gridJSON.num("alphaCount")),
        timeMinS: c.gridJSON.num("timeMin_s"),
        timeMaxS: c.gridJSON.num("timeMax_s"),
        timeCount: Int(c.gridJSON.num("timeCount"))
    )
}

private func doubles(_ json: [String: Any], _ key: String) -> [Double] {
    guard let list = json[key] as? [NSNumber] else {
        fatalError("fixture has no numeric array \(key)")
    }
    return list.map(\.doubleValue)
}

/// A whole particle set read straight out of the fixture. Needed because one case
/// starts from a posterior the reference constructed rather than from one this
/// implementation could redraw - see `whiteResample` in tools/fixtures.ts.
private func posterior(from json: [String: Any], _ label: String) -> Posterior {
    guard let rows = json["particles"] as? [[String: Any]],
          let rng = json["rng"] as? NSNumber else {
        fatalError("\(label): no particle set in the fixture")
    }
    var particles = [Particle]()
    particles.reserveCapacity(rows.count)
    for row in rows {
        particles.append(Particle(
            alphaM2s: row.num("alpha_m2s"),
            logDoseOffset: row.num("logDoseOffset"),
            tauAirScale: row.num("tauAirScale")
        ))
    }
    return Posterior(particles: particles, weights: doubles(json, "weights"), rng: Int32(truncating: rng))
}

/// The white answer a fixture row carries, or nil when that egg was not asked
/// about. A row with an unknown string is a fixture the port cannot read, which
/// must fail loudly rather than quietly skip a fold.
private func whiteReport(_ json: [String: Any], _ label: String) -> WhiteReport? {
    guard let raw = json["white"] as? String else { return nil }
    guard let report = WhiteReport(rawValue: raw) else {
        fatalError("\(label): unknown white report \(raw)")
    }
    return report
}

@Suite("Dose grid")
struct DoseGridConformance {
    @Test("every cell of the cached surface")
    func cells() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)

        expectClose(grid.logAlphaMin, c.gridJSON.num("logAlphaMin"), "logAlphaMin")
        expectClose(grid.logAlphaStep, c.gridJSON.num("logAlphaStep"), "logAlphaStep")
        expectClose(grid.timeStepS, c.gridJSON.num("timeStep_s"), "timeStep_s")

        let yolk = doubles(c.gridJSON, "logYolk")
        let white = doubles(c.gridJSON, "logWhite")
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
    func lookups() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let cases = c.file["lookups"] as? [[String: Any]] else {
            fatalError("no lookups in fixtures/calibration.json")
        }
        for row in cases {
            let alpha = row.num("alpha_m2s")
            let time = row.num("cookTime_s")
            expectClose(
                lookupLogYolkDose(grid, alpha, time), row.num("logYolk"),
                "logYolk at alpha \(alpha), t \(time)"
            )
            expectClose(
                lookupLogWhiteDose(grid, alpha, time), row.num("logWhite"),
                "logWhite at alpha \(alpha), t \(time)"
            )
        }
    }

    @Test("inverting the surface for a cook time")
    func inverse() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let cases = c.file["inverse"] as? [[String: Any]] else {
            fatalError("no inverse cases in fixtures/calibration.json")
        }
        for row in cases {
            expectClose(
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
    ) {
        guard let particles = expected["particles"] as? [[String: Any]] else {
            fatalError("\(label): no particles in fixture")
        }
        let weights = doubles(expected, "weights")
        #expect(post.particles.count == particles.count, "\(label): particle count")
        #expect(post.weights.count == weights.count, "\(label): weight count")

        for i in 0..<particles.count {
            expectClose(post.particles[i].alphaM2s, particles[i].num("alpha_m2s"), "\(label) particle \(i) alpha")
            expectClose(post.particles[i].logDoseOffset, particles[i].num("logDoseOffset"), "\(label) particle \(i) offset")
            expectClose(post.particles[i].tauAirScale, particles[i].num("tauAirScale"), "\(label) particle \(i) tauAirScale")
            expectClose(post.weights[i], weights[i], "\(label) weight \(i)")
        }

        // The RNG state itself, as a signed 32-bit integer. It goes negative
        // partway through this sequence, which is the case a port that reaches
        // for UInt32 or Int throughout would get wrong.
        guard let rng = expected["rng"] as? NSNumber else { fatalError("\(label): no rng") }
        #expect(post.rng == Int32(truncating: rng), "\(label): rng state")

        expectClose(effectiveSampleSize(post), expected.num("ess"), "\(label) ess")
        let params = posteriorParams(post)
        expectClose(params.alphaM2s, expected.num("alpha_m2s"), "\(label) mean alpha")
        expectClose(params.tauAirScale, expected.num("tauAirScale"), "\(label) mean tauAirScale")
        expectClose(posteriorMeanOffset(post), expected.num("meanOffset"), "\(label) mean offset")
        expectClose(posteriorAlphaRelSd(post), expected.num("alphaRelSd"), "\(label) alpha rel sd")

        guard let predictJSON = expected["predict"] as? [String: Any] else {
            fatalError("\(label): no predict")
        }
        let predicted = predictCookTime(post, grid, logNominalTarget)
        expectClose(predicted.lowS, predictJSON.num("low_s"), "\(label) predict low")
        expectClose(predicted.medianS, predictJSON.num("median_s"), "\(label) predict median")
        expectClose(predicted.highS, predictJSON.num("high_s"), "\(label) predict high")
    }

    @Test("the prior, particle by particle")
    func prior() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let priorJSON = c.file["prior"] as? [String: Any],
              let updates = c.file["updates"] as? [[String: Any]],
              let first = updates.first else {
            fatalError("fixtures/calibration.json has no prior")
        }
        let target = first.num("logNominalTarget")
        let post = createPrior(
            count: Int(priorJSON.num("count")),
            seed: Int32(priorJSON.num("seed"))
        )
        expectPosterior(post, priorJSON, "prior", grid, target)
    }

    /// Replays the whole sequence. Several of these updates drive the effective
    /// sample size below n/2 and resample, which is the only part of the filter
    /// that touches the RNG after the prior is drawn - and the only part where
    /// the order of the particles matters.
    ///
    /// The white answers are replayed in the same pass, each folded straight
    /// after the yolk answer for the same egg, because that is the order the apps
    /// fold them in and the posterior depends on it. The ask decision is checked
    /// where the apps read it, between the two folds.
    @Test("every update, including the resamples and the white answers")
    func updates() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let priorJSON = c.file["prior"] as? [String: Any],
              let updates = c.file["updates"] as? [[String: Any]] else {
            fatalError("fixtures/calibration.json has no updates")
        }
        var post = createPrior(
            count: Int(priorJSON.num("count")),
            seed: Int32(priorJSON.num("seed"))
        )
        for (i, step) in updates.enumerated() {
            guard let raw = step["feedback"] as? NSNumber,
                  let feedback = Feedback(rawValue: raw.intValue),
                  let after = step["after"] as? [String: Any] else {
                fatalError("malformed update \(i)")
            }
            let target = step.num("logNominalTarget")
            let cookTimeS = step.num("cookTime_s")
            updatePosterior(
                &post, grid: grid,
                cookTimeS: cookTimeS,
                logNominalTarget: target,
                feedback: feedback
            )
            expectPosterior(post, after, "update \(i) (feedback \(raw.intValue))", grid, target)

            expectClose(
                whiteRunnyProbability(post, grid, cookTimeS), step.num("whiteRunny"),
                "update \(i): predicted probability the white was runny"
            )
            #expect(
                shouldAskAboutWhite(post, grid, cookTimeS) == (step["askWhite"] as? Bool ?? false),
                "update \(i): whether the white is worth asking about"
            )

            guard let white = whiteReport(step, "update \(i)") else { continue }
            guard let afterWhite = step["afterWhite"] as? [String: Any] else {
                fatalError("update \(i) has a white answer but no posterior after it")
            }
            updateWhite(&post, grid: grid, cookTimeS: cookTimeS, white: white)
            expectPosterior(post, afterWhite, "update \(i) (white \(white.rawValue))", grid, target)
        }
    }

    /// The white fold's own resample. The channel is too weak to degenerate a
    /// healthy particle set on its own, so this case starts from a set the
    /// reference already sharpened - otherwise the branch would be shipped in both
    /// implementations and executed in neither.
    @Test("a white answer that degenerates the set resamples identically")
    func whiteResample() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let step = c.file["whiteResample"] as? [String: Any],
              let before = step["before"] as? [String: Any],
              let after = step["after"] as? [String: Any],
              let white = whiteReport(step, "whiteResample"),
              let updates = c.file["updates"] as? [[String: Any]],
              let first = updates.first else {
            fatalError("fixtures/calibration.json has no whiteResample case")
        }
        // The readout's predicted cook time is against the same nominal target as
        // the rest of the file; it is recorded once, on every update.
        let target = first.num("logNominalTarget")
        var post = posterior(from: before, "whiteResample")
        expectClose(effectiveSampleSize(post), before.num("ess"), "whiteResample: starting ess")
        #expect(
            effectiveSampleSize(post) >= Double(post.particles.count) / 2.0,
            "the fixture is meant to START above the resample threshold"
        )
        let cookTimeS = step.num("cookTime_s")
        updateWhite(&post, grid: grid, cookTimeS: cookTimeS, white: white)
        expectPosterior(post, after, "whiteResample", grid, target)
    }

    /// When the second question is asked at all, over a sweep of cook times. This
    /// is the one number in the calibration a user can SEE: get it wrong and an
    /// app either asks about the white after every egg or never mentions it, and
    /// no comparison of posteriors would notice.
    @Test("whether the white is worth asking about, across a range of cooks")
    func whiteAsk() {
        let c = loadCalibration()
        let grid = buildFixtureGrid(c)
        guard let priorJSON = c.file["prior"] as? [String: Any],
              let cases = c.file["whiteAsk"] as? [[String: Any]] else {
            fatalError("fixtures/calibration.json has no whiteAsk cases")
        }
        for row in cases {
            let post = createPrior(
                count: Int(priorJSON.num("count")),
                seed: Int32(priorJSON.num("seed"))
            )
            let t = row.num("cookTime_s")
            expectClose(
                whiteRunnyProbability(post, grid, t), row.num("whiteRunny"),
                "whiteRunnyProbability at t = \(t)"
            )
            #expect(
                shouldAskAboutWhite(post, grid, t) == (row["askWhite"] as? Bool ?? false),
                "shouldAskAboutWhite at t = \(t)"
            )
        }
    }

    @Test("both feedback bands and the ask threshold match the reference")
    func band() {
        let c = loadCalibration()
        expectClose(feedbackBand, c.file.num("feedbackBand"), "FEEDBACK_BAND")
        expectClose(whiteFeedbackBand, c.file.num("whiteFeedbackBand"), "WHITE_FEEDBACK_BAND")
        expectClose(whiteAskMinP, c.file.num("whiteAskMinP"), "WHITE_ASK_MIN_P")
    }
}
