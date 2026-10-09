import Testing
import Foundation
@testable import EggTimerCore

/// The thermometer, against `fixtures/probe.json`.
///
/// The peak on the dose grid and its interpolation; the error model's density
/// across both tails, where a careless exp(big) * erfc(tiny) would be NaN; one
/// particle's likelihood; a fold sequence of readings alone, with answers, and
/// wildly off, through the resample, particle by particle; and the rules -
/// how long the cooling counts, whether a probe is asked for, and which
/// readings are taken at entry.

private func fixtureGrid() throws -> DoseGrid {
    let egg = try Fixtures.object("probe.json", "egg")
    return try doseGrid(
        Fixtures.object("probe.json", "grid"),
        egg: Geometry.eggFromMass(egg.num("mass_kg")), setup: cookSetup(Fixtures.object("probe.json", "setup"))
    )
}

@Suite("The thermometer")
struct ProbeConformance {
    @Test("the constants match the reference")
    func constants() throws {
        let c = try Fixtures.object("probe.json", "constants")
        try expectClose(probeInstrumentSdC, c.num("instrumentSd_C"), "instrument sd")
        try expectClose(probeHandlingMeanC, c.num("handlingMean_C"), "handling mean")
        try expectClose(probeUnrelated, c.num("unrelated"), "unrelated share")
        try expectClose(probeUnrelatedSpanC, c.num("unrelatedSpan_C"), "unrelated span")
        try expectClose(probeAlphaSds, c.num("alphaSds"), "alpha sds")
        try expectClose(probeMarginC, c.num("margin_C"), "margin")
        try expectClose(coolingSeconds, c.num("coolingSeconds"), "cooling fallback")
        try expectClose(coolingMinSeconds, c.num("coolingMinSeconds"), "cooling floor")
    }

    @Test("the peak in every cell of the grid, and between them")
    func grid() throws {
        let grid = try fixtureGrid()
        let cells = try Fixtures.object("probe.json", "grid").numbers("peakYolk_C")
        #expect(grid.peakYolkC.count == cells.count)
        for i in 0..<cells.count { expectClose(grid.peakYolkC[i], cells[i], "peakYolk_C[\(i)]") }
        for row in try Fixtures.list("probe.json", "lookups") {
            let a = try row.num("alpha_m2s")
            let t = try row.num("cookTime_s")
            try expectClose(lookupPeakYolkC(grid, a, t), row.num("peakYolk_C"), "peak at alpha \(a), t \(t)")
        }
    }

    @Test("the error model's density, across both tails")
    func density() throws {
        for row in try Fixtures.list("probe.json", "density") {
            let d = try row.num("shortfall_C")
            let f = probeShortfallDensity(d)
            #expect(f.isFinite, "density at \(d) is finite")
            try expectClose(f, row.num("density"), "density at \(d)")
        }
    }

    @Test("one particle's likelihood, from a reading below freezing to a thousand degrees")
    func likelihood() throws {
        let grid = try fixtureGrid()
        let prior = try Fixtures.object("probe.json", "prior")
        let first = try createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed"))).particles[0]
        for row in try Fixtures.list("probe.json", "likelihood") {
            let r = try row.num("reading_C")
            try expectClose(
                probeLikelihood(grid, first, row.num("cookTime_s"), r), row.num("likelihood"),
                "likelihood of \(r) C"
            )
        }
    }

    @Test("a fold sequence with readings, particle by particle")
    func updates() throws {
        let grid = try fixtureGrid()
        let prior = try Fixtures.object("probe.json", "prior")
        var post = try createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        for (i, step) in try Fixtures.list("probe.json", "updates").enumerated() {
            let after = try step.object("after")
            let particles = try after.rows("particles")
            let rng = try #require(after["rng"] as? NSNumber, "malformed update \(i)")
            let word = try step.optionalValue(YolkWord.self, "yolkWord")
            let white = try step.optionalValue(WhiteReport.self, "white")
            let probeC = try step.optionalNum("probe_C")
            let t = try step.num("cookTime_s")
            try expectClose(
                answerLikelihood(grid, post.particles[0], t, yolkWord: word, white: white, probeC: probeC),
                step.num("firstLikelihood"), "update \(i): the first particle's likelihood"
            )
            updatePosterior(&post, grid: grid, cookTimeS: t, yolkWord: word, white: white, probeC: probeC)
            let weights = try after.numbers("weights")
            #expect(post.particles.count == particles.count)
            for k in 0..<particles.count {
                try expectClose(post.particles[k].alphaM2s, particles[k].num("alpha_m2s"), "update \(i) particle \(k) alpha")
                try expectClose(post.particles[k].logDoseOffset, particles[k].num("logDoseOffset"), "update \(i) particle \(k) offset")
                try expectClose(post.particles[k].noise, particles[k].num("noise"), "update \(i) particle \(k) noise")
                try expectClose(post.particles[k].whiteOffset, particles[k].num("whiteOffset"), "update \(i) particle \(k) white")
                try expectClose(post.particles[k].whiteFirmGap, particles[k].num("whiteFirmGap"), "update \(i) particle \(k) gap")
                expectClose(post.weights[k], weights[k], "update \(i) weight \(k)")
            }
            #expect(post.rng == Int32(truncating: rng), "update \(i): rng state")
            try expectClose(effectiveSampleSize(post), after.num("ess"), "update \(i) ess")
            try expectClose(posteriorParams(post).alphaM2s, after.num("alpha_m2s"), "update \(i) mean alpha")
        }
    }

    @Test("the cooling counts to the peak, and the probe is asked for only where there is one")
    func cooling() throws {
        for row in try Fixtures.list("probe.json", "cooling") {
            let moment = try row.object("moment")
            let r = try CookResult(
                cookTimeS: row.num("cookTime_s"), peakYolkC: 60, peakYolkTimeS: row.num("peakYolkTime_s"),
                yolkAtPullC: 40, yolkDoseMin: 1, whiteDoseMin: 1, peakWhiteC: 80
            )
            let label = "peak at \(r.peakYolkTimeS - r.cookTimeS) s"
            #expect(try coolingSecondsFor(r) == row.num("coolingSeconds"), "\(label): cooling")
            #expect(try probeMomentFor(r, cooling: .ice) == moment.flag("ice"), "\(label): ice")
            #expect(try probeMomentFor(r, cooling: .tap) == moment.flag("tap"), "\(label): tap")
            #expect(try probeMomentFor(r, cooling: .counter) == moment.flag("counter"), "\(label): counter")
        }
    }

    @Test("solved cooks: the countdown, the moment, and the readings the entry takes")
    func solved() throws {
        for row in try Fixtures.list("probe.json", "solved") {
            let range = try row.numbers("range")
            let rangeMoved = try row.numbers("rangeMoved")
            try #require(range.count == 2 && rangeMoved.count == 2, "a range is a low and a high")
            let moved = try row.object("moved")
            let s = try cookSetup(row.object("setup"))
            let massKg = try row.num("mass_kg")
            let egg = Geometry.eggFromMass(massKg)
            let level = try row.num("level")
            let label = "\(massKg) kg, \(s.cooling), \(s.startMode), level \(level)"
            let sol = solveCookTime(egg: egg, setup: s, params: .default, doneness: donenessFromSlider(level))
            try expectClose(sol.result.cookTimeS, row.num("cookTime_s"), "\(label): cook")
            try expectClose(sol.result.peakYolkTimeS, row.num("peakYolkTime_s"), "\(label): peak time")
            try expectClose(sol.result.peakYolkC, row.num("peakYolk_C"), "\(label): peak")
            #expect(try coolingSecondsFor(sol.result) == row.num("coolingSeconds"), "\(label): cooling")
            #expect(try probeMomentFor(sol.result, cooling: s.cooling) == row.flag("moment"), "\(label): moment")
            let cook = try row.num("cookTime_s")
            let at = plausibleProbeRangeC(egg: egg, setup: s, params: .default, cookTimeS: cook)
            expectClose(at.low, range[0], "\(label): lowest reading taken")
            expectClose(at.high, range[1], "\(label): highest reading taken")
            let params = try ModelParams(alphaM2s: moved.num("alpha_m2s"))
            let movedAt = plausibleProbeRangeC(egg: egg, setup: s, params: params, cookTimeS: cook)
            expectClose(movedAt.low, rangeMoved[0], "\(label): lowest, moved")
            expectClose(movedAt.high, rangeMoved[1], "\(label): highest, moved")
        }
    }
}
