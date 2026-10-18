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
    let file = try Fixtures.load("probe.json")
    return try doseGrid(
        file.object("grid")["spec"], egg: decoded(Egg.self, file["egg"]), setup: decoded(CookSetup.self, file["setup"])
    )
}

/// One fold as the fixture writes it: the answers and the reading, the first
/// particle's likelihood before it, and the set after.
private struct Fold: Encodable {
    let cookTimeS: Double
    let yolkWord: YolkWord?
    let white: WhiteReport?
    let probeC: Double?
    let firstLikelihood: Double
    let after: After

    struct After: Encodable {
        let posterior: Posterior
        let ess: Double
        let alphaM2s: Double
        enum CodingKeys: String, CodingKey { case posterior, ess, alphaM2s = "alpha_m2s" }
    }

    enum CodingKeys: String, CodingKey {
        case cookTimeS = "cookTime_s", yolkWord, white, probeC = "probe_C", firstLikelihood, after
    }
}

/// A cook's countdown, whether it asks for a probe, and the readings its entry
/// takes, as the fixture writes them.
private struct Solved: Encodable {
    let massKg: Double
    let setup: CookSetup
    let level: Double
    let result: CookResult
    let coolingSeconds: Double
    let moment: Bool
    let range: [Double]
    let rangeMoved: [Double]
    let moved: ModelParams

    enum CodingKeys: String, CodingKey {
        case massKg = "mass_kg", setup, level, result, coolingSeconds, moment, range, rangeMoved, moved
    }
}

@Suite("The thermometer")
struct ProbeConformance {
    @Test("the peak in every cell of the grid, and between them")
    func grid() throws {
        let grid = try fixtureGrid()
        try expectJSON(grid, Fixtures.object("probe.json", "grid")["surface"], "the surface")
        for row in try Fixtures.list("probe.json", "lookups") {
            let (a, t) = try (row.num("alpha_m2s"), row.num("cookTime_s"))
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
            try expectClose(probeLikelihood(grid, first, row.num("cookTime_s"), r), row.num("likelihood"), "likelihood of \(r) C")
        }
    }

    @Test("a fold sequence with readings, particle by particle")
    func updates() throws {
        let grid = try fixtureGrid()
        let prior = try Fixtures.object("probe.json", "prior")
        var post = try createPrior(count: Int(prior.num("count")), seed: Int32(prior.num("seed")))
        for (i, step) in try Fixtures.list("probe.json", "updates").enumerated() {
            let word = try step.optionalValue(YolkWord.self, "yolkWord")
            let white = try step.optionalValue(WhiteReport.self, "white")
            let (probeC, t) = try (step.optionalNum("probe_C"), step.num("cookTime_s"))
            let firstLikelihood = answerLikelihood(grid, post.particles[0], t, yolkWord: word, white: white, probeC: probeC)
            updatePosterior(&post, grid: grid, cookTimeS: t, yolkWord: word, white: white, probeC: probeC)
            let fold = Fold(
                cookTimeS: t, yolkWord: word, white: white, probeC: probeC, firstLikelihood: firstLikelihood,
                after: .init(posterior: post, ess: effectiveSampleSize(post), alphaM2s: posteriorParams(post).alphaM2s)
            )
            expectJSON(fold, step, "update \(i)")
        }
    }

    @Test("the cooling counts to the peak, and the probe is asked for only where there is one")
    func cooling() throws {
        for row in try Fixtures.list("probe.json", "cooling") {
            let r = try CookResult(
                cookTimeS: row.num("cookTime_s"), peakYolkC: 60, peakYolkTimeS: row.num("peakYolkTime_s"),
                yolkAtPullC: 40, yolkDoseMin: 1, whiteDoseMin: 1, peakWhiteC: 80
            )
            let got: [String: Any] = [
                "cookTime_s": r.cookTimeS, "peakYolkTime_s": r.peakYolkTimeS, "coolingSeconds": coolingSecondsFor(r),
                "moment": [
                    "ice": probeMomentFor(r, cooling: .ice), "tap": probeMomentFor(r, cooling: .tap),
                    "counter": probeMomentFor(r, cooling: .counter), "eggCup": probeMomentFor(r, cooling: .eggCup),
                ],
            ]
            expectJSON(got, row, "peak at \(r.peakYolkTimeS - r.cookTimeS) s")
        }
    }

    @Test("solved cooks: the countdown, the moment, and the readings the entry takes")
    func solved() throws {
        for row in try Fixtures.list("probe.json", "solved") {
            let s = try decoded(CookSetup.self, row["setup"])
            let (massKg, level) = try (row.num("mass_kg"), row.num("level"))
            let egg = Geometry.eggFromMass(massKg)
            let r = solveCookTime(egg: egg, setup: s, params: .default, doneness: donenessFromSlider(level)).result
            let moved = try decoded(ModelParams.self, row["moved"])
            let range = plausibleProbeRangeC(egg: egg, setup: s, params: .default, cookTimeS: r.cookTimeS)
            let rangeMoved = plausibleProbeRangeC(egg: egg, setup: s, params: moved, cookTimeS: r.cookTimeS)
            let got = Solved(
                massKg: massKg, setup: s, level: level, result: r, coolingSeconds: coolingSecondsFor(r),
                moment: probeMomentFor(r, cooling: s.cooling), range: [range.low, range.high],
                rangeMoved: [rangeMoved.low, rangeMoved.high], moved: moved
            )
            expectJSON(got, row, "\(massKg) kg, \(s.cooling), \(s.startMode), level \(level)")
        }
    }
}
