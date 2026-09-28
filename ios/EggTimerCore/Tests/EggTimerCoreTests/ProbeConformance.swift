import Testing
import Foundation
@testable import EggTimerCore

/// The thermometer (E4), against `fixtures/probe.json`.
///
/// The peak on the dose grid and its interpolation; the error model's density
/// across both tails, where a careless exp(big) * erfc(tiny) would be NaN; one
/// particle's likelihood; a fold sequence of readings alone, with answers, and
/// wildly off, through the resample, particle by particle; and the policy -
/// how long the cooling counts, whether a probe is asked for, and which
/// readings are taken at entry.
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

private func file() -> [String: Any] { Fixtures.load("probe.json") }

private func block(_ key: String) -> [String: Any] {
    guard let b = file()[key] as? [String: Any] else { fatalError("probe.json has no \(key)") }
    return b
}

private func rows(_ key: String) -> [[String: Any]] {
    guard let r = file()[key] as? [[String: Any]] else { fatalError("probe.json has no \(key)") }
    return r
}

private func doubles(_ json: [String: Any], _ key: String) -> [Double] {
    guard let list = json[key] as? [NSNumber] else { fatalError("no numeric array \(key)") }
    return list.map(\.doubleValue)
}

private func setup(_ json: [String: Any]) -> CookSetup {
    guard let startMode = StartMode(rawValue: json.str("startMode")),
          let cooling = Cooling(rawValue: json.str("cooling")) else {
        fatalError("probe.json: a setup not shaped as expected")
    }
    let afterBoil = HeatAfterBoil(rawValue: json["afterBoil"] as? String ?? "hold") ?? .hold
    return CookSetup(
        startMode: startMode, eggStartC: json.num("eggStart_C"), ambientC: json.num("ambient_C"),
        boilingC: json.num("boiling_C"), timeToBoilS: json.num("timeToBoil_s"), cooling: cooling,
        waterLitres: json.num("waterLitres"), afterBoil: afterBoil, eggCount: json.num("eggCount")
    )
}

private func fixtureGrid() -> DoseGrid {
    let g = block("grid")
    guard let egg = file()["egg"] as? [String: Any] else { fatalError("no egg") }
    return buildDoseGrid(
        egg: Geometry.eggFromMass(egg.num("mass_kg")), setup: setup(block("setup")),
        tauAirScale: g.num("tauAirScale"),
        alphaMin: g.num("alphaMin"), alphaMax: g.num("alphaMax"), alphaCount: Int(g.num("alphaCount")),
        timeMinS: g.num("timeMin_s"), timeMaxS: g.num("timeMax_s"), timeCount: Int(g.num("timeCount"))
    )
}

private func whiteReport(_ json: [String: Any]) -> WhiteReport? {
    guard let raw = json["white"] as? String else { return nil }
    guard let report = WhiteReport(rawValue: raw) else { fatalError("unknown white \(raw)") }
    return report
}

@Suite("The thermometer")
struct ProbeConformance {
    @Test("the constants match the reference")
    func constants() {
        let c = block("constants")
        expectClose(probeInstrumentSdC, c.num("instrumentSd_C"), "instrument sd")
        expectClose(probeHandlingMeanC, c.num("handlingMean_C"), "handling mean")
        expectClose(probeUnrelated, c.num("unrelated"), "unrelated share")
        expectClose(probeUnrelatedSpanC, c.num("unrelatedSpan_C"), "unrelated span")
        expectClose(probeAlphaSds, c.num("alphaSds"), "alpha sds")
        expectClose(probeMarginC, c.num("margin_C"), "margin")
        expectClose(coolingSeconds, c.num("coolingSeconds"), "cooling fallback")
        expectClose(coolingMinSeconds, c.num("coolingMinSeconds"), "cooling floor")
    }

    @Test("the peak in every cell of the grid, and between them")
    func grid() {
        let grid = fixtureGrid()
        let cells = doubles(block("grid"), "peakYolk_C")
        #expect(grid.peakYolkC.count == cells.count)
        for i in 0..<cells.count { expectClose(grid.peakYolkC[i], cells[i], "peakYolk_C[\(i)]") }
        for row in rows("lookups") {
            let a = row.num("alpha_m2s")
            let t = row.num("cookTime_s")
            expectClose(lookupPeakYolkC(grid, a, t), row.num("peakYolk_C"), "peak at alpha \(a), t \(t)")
        }
    }

    @Test("the error model's density, across both tails")
    func density() {
        for row in rows("density") {
            let d = row.num("shortfall_C")
            let f = probeShortfallDensity(d)
            #expect(f.isFinite, "density at \(d) is finite")
            expectClose(f, row.num("density"), "density at \(d)")
        }
    }

    @Test("one particle's likelihood, from a reading below freezing to a thousand degrees")
    func likelihood() {
        let grid = fixtureGrid()
        let prior = block("prior")
        let first = createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed"))).particles[0]
        for row in rows("likelihood") {
            let r = row.num("reading_C")
            expectClose(
                probeLikelihood(grid, first, row.num("cookTime_s"), r), row.num("likelihood"),
                "likelihood of \(r) C"
            )
        }
    }

    @Test("a fold sequence with readings, particle by particle")
    func updates() {
        let grid = fixtureGrid()
        let prior = block("prior")
        var post = createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        for (i, step) in rows("updates").enumerated() {
            guard let after = step["after"] as? [String: Any],
                  let particles = after["particles"] as? [[String: Any]],
                  let rng = after["rng"] as? NSNumber else { fatalError("malformed update \(i)") }
            let yolk = (step["yolk"] as? NSNumber).flatMap { Feedback(rawValue: $0.intValue) }
            let white = whiteReport(step)
            let probeC = step.optionalNum("probe_C")
            let t = step.num("cookTime_s")
            let target = step.num("logNominalTarget")
            expectClose(
                answerLikelihood(grid, post.particles[0], t, target, yolk: yolk, white: white, probeC: probeC),
                step.num("firstLikelihood"), "update \(i): the first particle's likelihood"
            )
            updatePosterior(
                &post, grid: grid, cookTimeS: t, logNominalTarget: target,
                yolk: yolk, white: white, probeC: probeC
            )
            let weights = doubles(after, "weights")
            #expect(post.particles.count == particles.count)
            for k in 0..<particles.count {
                expectClose(post.particles[k].alphaM2s, particles[k].num("alpha_m2s"), "update \(i) particle \(k) alpha")
                expectClose(post.particles[k].logDoseOffset, particles[k].num("logDoseOffset"), "update \(i) particle \(k) offset")
                expectClose(post.particles[k].tauAirScale, particles[k].num("tauAirScale"), "update \(i) particle \(k) tau")
                expectClose(post.particles[k].noise, particles[k].num("noise"), "update \(i) particle \(k) noise")
                expectClose(post.particles[k].whiteOffset, particles[k].num("whiteOffset"), "update \(i) particle \(k) white")
                expectClose(post.particles[k].whiteFirmGap, particles[k].num("whiteFirmGap"), "update \(i) particle \(k) gap")
                expectClose(post.weights[k], weights[k], "update \(i) weight \(k)")
            }
            #expect(post.rng == Int32(truncating: rng), "update \(i): rng state")
            expectClose(effectiveSampleSize(post), after.num("ess"), "update \(i) ess")
            expectClose(posteriorParams(post).alphaM2s, after.num("alpha_m2s"), "update \(i) mean alpha")
        }
    }

    @Test("the cooling counts to the peak, and the probe is asked for only where there is one")
    func cooling() {
        for row in rows("cooling") {
            guard let moment = row["moment"] as? [String: Any] else { fatalError("no moment") }
            let r = CookResult(
                cookTimeS: row.num("cookTime_s"), peakYolkC: 60, peakYolkTimeS: row.num("peakYolkTime_s"),
                yolkAtPullC: 40, yolkDoseMin: 1, whiteDoseMin: 1, peakWhiteC: 80
            )
            let label = "peak at \(row.num("peakYolkTime_s") - row.num("cookTime_s")) s"
            #expect(coolingSecondsFor(r) == row.num("coolingSeconds"), "\(label): cooling")
            #expect(probeMomentFor(r, cooling: .ice) == moment.flag("ice"), "\(label): ice")
            #expect(probeMomentFor(r, cooling: .tap) == moment.flag("tap"), "\(label): tap")
            #expect(probeMomentFor(r, cooling: .counter) == moment.flag("counter"), "\(label): counter")
        }
    }

    @Test("solved cooks: the countdown, the moment, and the readings the entry takes")
    func solved() {
        for row in rows("solved") {
            guard let setupJSON = row["setup"] as? [String: Any],
                  let range = row["range"] as? [NSNumber],
                  let rangeMoved = row["rangeMoved"] as? [NSNumber],
                  let moved = row["moved"] as? [String: Any] else { fatalError("malformed solved cook") }
            let s = setup(setupJSON)
            let egg = Geometry.eggFromMass(row.num("mass_kg"))
            let level = row.num("level")
            let label = "\(row.num("mass_kg")) kg, \(s.cooling), \(s.startMode), level \(level)"
            let sol = solveCookTime(egg: egg, setup: s, params: .default, doneness: donenessFromSlider(level))
            expectClose(sol.result.cookTimeS, row.num("cookTime_s"), "\(label): cook")
            expectClose(sol.result.peakYolkTimeS, row.num("peakYolkTime_s"), "\(label): peak time")
            expectClose(sol.result.peakYolkC, row.num("peakYolk_C"), "\(label): peak")
            #expect(coolingSecondsFor(sol.result) == row.num("coolingSeconds"), "\(label): cooling")
            #expect(probeMomentFor(sol.result, cooling: s.cooling) == row.flag("moment"), "\(label): moment")
            let cook = row.num("cookTime_s")
            let at = plausibleProbeRangeC(egg: egg, setup: s, params: .default, cookTimeS: cook)
            expectClose(at.low, range[0].doubleValue, "\(label): lowest reading taken")
            expectClose(at.high, range[1].doubleValue, "\(label): highest reading taken")
            let params = ModelParams(alphaM2s: moved.num("alpha_m2s"), tauAirScale: moved.num("tauAirScale"))
            let movedAt = plausibleProbeRangeC(egg: egg, setup: s, params: params, cookTimeS: cook)
            expectClose(movedAt.low, rangeMoved[0].doubleValue, "\(label): lowest, moved")
            expectClose(movedAt.high, rangeMoved[1].doubleValue, "\(label): highest, moved")
        }
    }
}
