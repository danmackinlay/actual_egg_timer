import Testing
import Foundation
@testable import EggTimerCore

/// The record and the replay, against `fixtures/record.json`.
///
/// Two separate claims. Which records a loader trusts is pinned case by case,
/// so a port that forgets a rule - or invents one - disagrees on a named case.
/// The replay is pinned particle by particle after every egg, for the same
/// reason as the filter's own fixture: a wrong fold does not crash, it learns
/// something else.
///
/// And one claim the fixture cannot make, because it is about THIS
/// implementation agreeing with itself: a posterior built egg by egg, with a
/// trip through JSON between every egg the way the app stores it, is
/// bit-identical to the one replayed from the log.

/// A record the way the app reads one: JSON bytes, the Codable shape, then the
/// rules on top. Nil if either refuses it.
private func decodeRecord(_ json: Any) -> EggRecord? {
    guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.fragmentsAllowed]),
          let record = try? JSONDecoder().decode(EggRecord.self, from: data),
          validRecord(record) else { return nil }
    return record
}

private func fixtureLog() throws -> [EggRecord] {
    let rows = try #require(Fixtures.node("record.json", "replay.log") as? [Any], "no replay log")
    try #require(!rows.isEmpty, "an empty replay log")
    return try rows.map { row in
        try #require(decodeRecord(row), "replay log record refused: \(row)")
    }
}

/// `calibrationGrid`'s bounds at the fixture's coarser counts.
private func fixtureGrid() throws -> GridPolicy {
    let grid = try Fixtures.object("record.json", "replay.grid")
    let alphaCount = try Int(grid.num("alphaCount"))
    let timeCount = try Int(grid.num("timeCount"))
    return { alphaCentre, cookTimeS in
        let g = calibrationGrid(alphaCentre: alphaCentre, cookTimeS: cookTimeS)
        return GridSpec(
            alphaMin: g.alphaMin, alphaMax: g.alphaMax, alphaCount: alphaCount,
            timeMinS: g.timeMinS, timeMaxS: g.timeMaxS, timeCount: timeCount
        )
    }
}

private func fixtureStart() throws -> Calibration {
    let start = try Fixtures.object("record.json", "replay.start")
    return try freshCalibration(count: Int(start.num("count")), seed: Int32(start.num("seed")))
}

private func calibration(from json: [String: Any]) throws -> Calibration {
    try Calibration(posterior: posterior(json), eggsLogged: Int(json.num("eggsLogged")))
}

private func expectCalibration(_ c: Calibration, _ expected: [String: Any], _ label: String) throws {
    let want = try calibration(from: expected)
    #expect(c.eggsLogged == want.eggsLogged, "\(label): eggs logged")
    #expect(c.posterior.rng == want.posterior.rng, "\(label): rng")
    #expect(c.posterior.particles.count == want.posterior.particles.count, "\(label): count")
    for i in 0..<want.posterior.particles.count {
        let a = c.posterior.particles[i]
        let b = want.posterior.particles[i]
        expectClose(a.alphaM2s, b.alphaM2s, "\(label) particle \(i) alpha")
        expectClose(a.logDoseOffset, b.logDoseOffset, "\(label) particle \(i) offset")
        expectClose(a.tauAirScale, b.tauAirScale, "\(label) particle \(i) tauAirScale")
        expectClose(a.noise, b.noise, "\(label) particle \(i) noise")
        expectClose(a.whiteOffset, b.whiteOffset, "\(label) particle \(i) white offset")
        expectClose(a.whiteFirmGap, b.whiteFirmGap, "\(label) particle \(i) firm gap")
        expectClose(c.posterior.weights[i], want.posterior.weights[i], "\(label) weight \(i)")
    }
}

/// Exactly equal, bit for bit: every particle, every weight, the RNG and the count.
private func identical(_ a: Calibration, _ b: Calibration) -> Bool {
    guard a.eggsLogged == b.eggsLogged, a.posterior.rng == b.posterior.rng,
          a.posterior.particles.count == b.posterior.particles.count else { return false }
    for i in 0..<a.posterior.particles.count {
        let p = a.posterior.particles[i]
        let q = b.posterior.particles[i]
        if p.alphaM2s.bitPattern != q.alphaM2s.bitPattern
            || p.logDoseOffset.bitPattern != q.logDoseOffset.bitPattern
            || p.tauAirScale.bitPattern != q.tauAirScale.bitPattern
            || p.noise.bitPattern != q.noise.bitPattern
            || p.whiteOffset.bitPattern != q.whiteOffset.bitPattern
            || p.whiteFirmGap.bitPattern != q.whiteFirmGap.bitPattern
            || a.posterior.weights[i].bitPattern != b.posterior.weights[i].bitPattern {
            return false
        }
    }
    return true
}

/// The shape the app stores a posterior in: columns of doubles through
/// JSONEncoder, at full precision. What this test needs from it is that a
/// double survives the trip exactly.
private struct Columns: Codable {
    var n: Int
    var rng: Int32
    var a: [Double]
    var o: [Double]
    var t: [Double]
    var sd: [Double]
    var wo: [Double]
    var wg: [Double]
    var w: [Double]
}

private func throughJSON(_ c: Calibration) throws -> Calibration {
    let p = c.posterior
    let columns = Columns(
        n: c.eggsLogged, rng: p.rng,
        a: p.particles.map(\.alphaM2s), o: p.particles.map(\.logDoseOffset),
        t: p.particles.map(\.tauAirScale), sd: p.particles.map(\.noise),
        wo: p.particles.map(\.whiteOffset), wg: p.particles.map(\.whiteFirmGap), w: p.weights
    )
    let back = try JSONDecoder().decode(Columns.self, from: JSONEncoder().encode(columns))
    var particles = [Particle]()
    for i in 0..<back.a.count {
        particles.append(Particle(
            alphaM2s: back.a[i], logDoseOffset: back.o[i], tauAirScale: back.t[i],
            noise: back.sd[i], whiteOffset: back.wo[i], whiteFirmGap: back.wg[i]
        ))
    }
    return Calibration(
        posterior: Posterior(particles: particles, weights: back.w, rng: back.rng),
        eggsLogged: back.n
    )
}

@Suite("The record")
struct RecordConformance {
    /// Stamped into every iOS record, so a record from either app names the
    /// same schema and the same prior.
    @Test("the record's version and prior are the reference's")
    func identity() throws {
        let file = try Fixtures.load("record.json")
        #expect(try recordVersion == Int(file.num("version")))
        #expect(try priorID == file.str("prior"))
    }

    @Test("which records a loader trusts, case by case")
    func validation() throws {
        for c in try Fixtures.list("record.json", "cases") {
            let why = try c.str("why")
            let valid = try c.flag("valid")
            let record = decodeRecord(c["record"] as Any)
            #expect((record != nil) == valid, "\(why): valid should be \(valid)")
            guard let record else { continue }
            let yolk = try c.optionalNum("yolk")
            #expect(record.yolk.map { Double($0.rawValue) } == yolk, "\(why): yolk")
            #expect(record.white?.rawValue == c["white"] as? String, "\(why): white")
            // The probe reading: the same number, and the same "when".
            let probe = c["probe"] as? [String: Any]
            #expect((record.probe == nil) == (probe == nil), "\(why): probe")
            if let probe, let read = record.probe {
                #expect(try read.centreC == probe.num("centre_C"), "\(why): probe reading")
                #expect(try read.afterS == probe.optionalNum("after_s"), "\(why): probe asked at")
            }
        }
    }

    @Test("masses round to a hundredth of a gram")
    func massRounding() throws {
        for c in try Fixtures.list("record.json", "massRounding") {
            let massKg = try c.num("mass_kg")
            #expect(try recordMassG(massKg: massKg) == c.num("mass_g"), "mass \(massKg)")
        }
    }

    @Test("probe readings round to a hundredth of a degree")
    func probeRounding() throws {
        for c in try Fixtures.list("record.json", "probeRounding") {
            let centreC = try c.num("centre_C")
            #expect(try recordProbeC(centreC) == c.num("record_C"), "reading \(centreC)")
        }
    }

    /// Written with explicit nulls, and read back as the same record.
    @Test("a record survives its own JSON, nulls and all")
    func roundTrip() throws {
        for record in try fixtureLog() {
            let data = try JSONEncoder().encode(record)
            let back = try JSONDecoder().decode(EggRecord.self, from: data)
            #expect(back == record)
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            #expect(object?["white"] is NSNull || object?["white"] is String, "white written")
            #expect(
                record.probe == nil ? object?["probe"] is NSNull : object?["probe"] is [String: Any],
                "probe written, as null when there is none"
            )
            #expect(object?["yolk"] != nil, "yolk written")
        }
    }
}

@Suite("Replay")
struct ReplayConformance {
    @Test("a ten-egg log, egg by egg, every particle")
    func stepByStep() throws {
        let steps = try Fixtures.list("record.json", "replay.steps")
        let log = try fixtureLog()
        let grid = try fixtureGrid()
        var c = try fixtureStart()
        try #require(steps.count == log.count)
        for (i, r) in log.enumerated() {
            let step = steps[i]
            if recordTeaches(r) {
                let q = gridRequestFor(c, r, grid: grid)
                let spec = try step.object("spec")
                try expectClose(q.spec.alphaMin, spec.num("alphaMin"), "step \(i) alphaMin")
                try expectClose(q.spec.timeMaxS, spec.num("timeMax_s"), "step \(i) timeMax")
                try expectClose(recordCookTimeS(r), step.num("cookTime_s"), "step \(i) scored at")
                foldRecord(&c, r, grid: buildRequestedGrid(q))
            } else {
                #expect(step["spec"] is NSNull, "step \(i): an unanswered egg builds no surface")
            }
            try expectCalibration(c, step.object("after"), "step \(i)")
            try expectClose(
                calibrationDoneness(c, level: 0.22).whiteDoseMin, step.num("whiteDoseAtSoft"),
                "step \(i): the white target the next soft egg is solved for"
            )
        }
    }

    @Test("the tail of the log from a frozen base")
    func fromBase() throws {
        let block = try Fixtures.object("record.json", "replay.fromBase")
        let tail = try Array(fixtureLog().dropFirst(Int(block.num("after"))))
        let rebuilt = try replay(calibration(from: block.object("base")), tail, grid: fixtureGrid())
        try expectCalibration(rebuilt, block.object("final"), "from base")
    }

    /// The record's headline claim, in this language: the app folds each egg
    /// when its first answer comes, stores the posterior, and on the second
    /// answer folds the egg AGAIN from the posterior before it; a replay folds
    /// the log in one go. They must not merely agree to twelve figures - they
    /// must be the same bits, or "a model change is a replay" quietly means "a model
    /// change moves your posterior a little for no reason".
    @Test("egg by egg, stored between eggs, is bit-identical to a replay")
    func bitIdentical() throws {
        let log = try fixtureLog()
        let grid = try fixtureGrid()
        // From a base that is not the prior, as a migrated phone starts.
        let base = try replay(fixtureStart(), Array(log.prefix(1)), grid: grid)
        var c = try throughJSON(base)
        for r in log.dropFirst() {
            guard recordTeaches(r) else { continue }
            let before = c
            let surface = buildRequestedGrid(gridRequestFor(c, r, grid: grid))
            // The first answer alone - whichever it was - folded and stored.
            var first = r
            if r.yolk != nil { first.white = nil }
            foldRecord(&c, first, grid: surface)
            c = try throughJSON(c)
            // The second answer arrives later: the egg is folded again from
            // before it, against the kept surface.
            if first != r {
                c = before
                foldRecord(&c, r, grid: surface)
                c = try throughJSON(c)
            }
        }
        let rebuilt = replay(try throughJSON(base), Array(log.dropFirst()), grid: grid)
        #expect(identical(c, rebuilt))
        #expect(!identical(c, base), "the log moved the posterior")
    }

    @Test("a replay does not move where it started")
    func startUntouched() throws {
        let start = try fixtureStart()
        let before = start
        _ = try replay(start, Array(fixtureLog().prefix(2)), grid: fixtureGrid())
        #expect(identical(start, before))
    }
}
