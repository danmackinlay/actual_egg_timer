import Foundation
import Testing
@testable import EggTimerCore

/// A prior drawn from a population (E7), against `fixtures/prior.json`: the
/// published population, the literature's and a shifted one, each read the
/// same way, starting at the same centre, and drawing the same particles to
/// the bit; and every file a reader must refuse, refused.
@Suite("The population")
struct PriorConformance {
    private func data(_ json: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: json)
    }

    @Test("each population reads, starts at its centre and draws the same prior")
    func populations() throws {
        let file = try Fixtures.load("prior.json")
        let count = try Int(file.num("count"))
        let seed = try Int32(file.num("seed"))
        #expect(try literaturePopulation.id == file.str("literatureId"))
        for row in try file.rows("populations") {
            let name = try row.str("name")
            let pop = try #require(parsePopulation(data(row["file"] as Any)), "\(name) reads")
            let expected = try row.object("population")
            #expect(try pop.id == expected.str("id"), "\(name) id")
            #expect(try pop.alphaM2s.median == expected.object("alpha_m2s").num("median"), "\(name) alpha")
            #expect(try pop.whiteOffset.mean == expected.object("whiteOffset").num("mean"), "\(name) white")
            let start = try row.object("start")
            #expect(try priorStart(pop) == PriorStart(
                alphaM2s: start.num("alpha_m2s"), tauAirScale: start.num("tauAirScale"),
                whiteOffset: start.num("whiteOffset")
            ), "\(name) start")
            let c = freshCalibration(count: count, seed: seed, population: pop)
            let params = try row.object("params")
            #expect(try calibrationParams(c).alphaM2s == params.num("alpha_m2s"), "\(name) params")
            #expect(try calibrationParams(c).tauAirScale == params.num("tauAirScale"), "\(name) params")
            try expectClose(calibrationDoneness(c, level: 0.22).whiteDoseMin, row.num("whiteDoseAtSoft"), "\(name) white dose")
            #expect(try c.posterior.rng == Int32(row.num("rng")), "\(name) rng")
            let rows = try row.rows("particles")
            for (i, p) in rows.enumerated() {
                let q = c.posterior.particles[i]
                try expectClose(q.alphaM2s, p.num("alpha_m2s"), "\(name) particle \(i) alpha")
                try expectClose(q.logDoseOffset, p.num("logDoseOffset"), "\(name) particle \(i) taste")
                try expectClose(q.tauAirScale, p.num("tauAirScale"), "\(name) particle \(i) tauAir")
                try expectClose(q.noise, p.num("noise"), "\(name) particle \(i) noise")
                try expectClose(q.whiteOffset, p.num("whiteOffset"), "\(name) particle \(i) white")
                try expectClose(q.whiteFirmGap, p.num("whiteFirmGap"), "\(name) particle \(i) gap")
            }
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
