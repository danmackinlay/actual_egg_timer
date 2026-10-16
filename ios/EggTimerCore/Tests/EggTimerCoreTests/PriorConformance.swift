import Foundation
import Testing
@testable import EggTimerCore

/// A prior drawn from a population, against `fixtures/prior.json`: the
/// published population, the literature's and a shifted one, each read the
/// same way, starting at the same centre, and drawing the same particles to
/// the bit; and every file a reader must refuse, refused.

/// A population as the fixture writes one drawn: what it reads as, its centre,
/// the parameters and white target a fresh calibration on it solves with, the
/// RNG's state after the draw, and the first particles drawn.
private struct Drawn: Encodable {
    let name: String
    let population: Population
    let start: PriorStart
    let params: ModelParams
    let whiteDoseAtSoft: Double
    let rng: Int32
    let particles: [Particle]
}

@Suite("The population")
struct PriorConformance {
    private func data(_ json: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: json)
    }

    @Test("each population reads, starts at its centre and draws the same prior")
    func populations() throws {
        let file = try Fixtures.load("prior.json")
        let (count, seed) = try (Int(file.num("count")), Int32(file.num("seed")))
        for row in try file.rows("populations") {
            let name = try row.str("name")
            let pop = try #require(parsePopulation(data(row["file"] as Any)), "\(name) reads")
            let c = freshCalibration(count: count, seed: seed, population: pop)
            let shown = try row.rows("particles").count
            let drawn = Drawn(
                name: name, population: pop, start: priorStart(pop), params: calibrationParams(c),
                whiteDoseAtSoft: calibrationDoneness(c, level: 0.22).whiteDoseMin, rng: c.posterior.rng,
                particles: Array(c.posterior.particles.prefix(shown))
            )
            var expected = row
            expected["file"] = nil
            expectJSON(drawn, expected, name)
        }
    }

    @Test("a population file a reader cannot trust is refused")
    func refused() throws {
        for row in try Fixtures.list("prior.json", "refused") {
            let why = try row.str("why")
            #expect(try parsePopulation(data(row["file"] as Any)) == nil, "\(why)")
        }
    }
}
