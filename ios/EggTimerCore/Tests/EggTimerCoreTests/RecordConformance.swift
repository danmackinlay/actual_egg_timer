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

private func file() -> [String: Any] { Fixtures.load("record.json") }

private func replayJSON() -> [String: Any] {
    guard let replay = file()["replay"] as? [String: Any] else {
        fatalError("fixtures/record.json has no replay")
    }
    return replay
}

/// A record the way the app reads one: JSON bytes, the Codable shape, then the
/// rules on top. Nil if either refuses it.
private func decodeRecord(_ json: Any) -> EggRecord? {
    guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.fragmentsAllowed]),
          let record = try? JSONDecoder().decode(EggRecord.self, from: data),
          validRecord(record) else { return nil }
    return record
}

private func fixtureLog() -> [EggRecord] {
    guard let rows = replayJSON()["log"] as? [Any] else { fatalError("no replay log") }
    return rows.map { row in
        guard let r = decodeRecord(row) else { fatalError("replay log record refused: \(row)") }
        return r
    }
}

/// `calibrationGrid`'s bounds at the fixture's coarser counts.
private func fixtureGrid() -> GridPolicy {
    guard let grid = replayJSON()["grid"] as? [String: Any] else { fatalError("no replay grid") }
    let alphaCount = Int(grid.num("alphaCount"))
    let timeCount = Int(grid.num("timeCount"))
    return { alphaCentre, cookTimeS in
        let g = calibrationGrid(alphaCentre: alphaCentre, cookTimeS: cookTimeS)
        return GridSpec(
            alphaMin: g.alphaMin, alphaMax: g.alphaMax, alphaCount: alphaCount,
            timeMinS: g.timeMinS, timeMaxS: g.timeMaxS, timeCount: timeCount
        )
    }
}

private func fixtureStart() -> Calibration {
    guard let start = replayJSON()["start"] as? [String: Any] else { fatalError("no replay start") }
    return freshCalibration(count: Int(start.num("count")), seed: Int32(start.num("seed")))
}

private func calibration(from json: [String: Any]) -> Calibration {
    guard let rows = json["particles"] as? [[String: Any]],
          let weights = json["weights"] as? [NSNumber],
          let rng = json["rng"] as? NSNumber else {
        fatalError("fixture has no particle set")
    }
    let particles = rows.map {
        Particle(
            alphaM2s: $0.num("alpha_m2s"), logDoseOffset: $0.num("logDoseOffset"),
            tauAirScale: $0.num("tauAirScale"), noise: $0.num("noise"),
            whiteOffset: $0.num("whiteOffset"), whiteFirmGap: $0.num("whiteFirmGap")
        )
    }
    return Calibration(
        posterior: Posterior(
            particles: particles, weights: weights.map(\.doubleValue), rng: Int32(truncating: rng)
        ),
        eggsLogged: Int(json.num("eggsLogged"))
    )
}

private func expectCalibration(_ c: Calibration, _ expected: [String: Any], _ label: String) {
    let want = calibration(from: expected)
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
    func identity() {
        #expect(recordVersion == Int(file().num("version")))
        #expect(priorID == file().str("prior"))
    }

    @Test("which records a loader trusts, case by case")
    func validation() {
        guard let cases = file()["cases"] as? [[String: Any]] else { fatalError("no record cases") }
        for c in cases {
            let why = c.str("why")
            let record = decodeRecord(c["record"] as Any)
            #expect((record != nil) == c.flag("valid"), "\(why): valid should be \(c.flag("valid"))")
            guard let record else { continue }
            let yolk = c.optionalNum("yolk")
            #expect(record.yolk.map { Double($0.rawValue) } == yolk, "\(why): yolk")
            #expect(record.white?.rawValue == c["white"] as? String, "\(why): white")
            // The probe reading (E4): the same number, and the same "when".
            let probe = c["probe"] as? [String: Any]
            #expect((record.probe == nil) == (probe == nil), "\(why): probe")
            if let probe, let read = record.probe {
                #expect(read.centreC == probe.num("centre_C"), "\(why): probe reading")
                #expect(read.afterS == probe.optionalNum("after_s"), "\(why): probe asked at")
            }
        }
    }

    @Test("masses round to a hundredth of a gram")
    func massRounding() {
        guard let cases = file()["massRounding"] as? [[String: Any]] else { fatalError("no mass cases") }
        for c in cases {
            #expect(recordMassG(massKg: c.num("mass_kg")) == c.num("mass_g"), "mass \(c.num("mass_kg"))")
        }
    }

    @Test("probe readings round to a hundredth of a degree")
    func probeRounding() {
        guard let cases = file()["probeRounding"] as? [[String: Any]] else { fatalError("no probe cases") }
        for c in cases {
            #expect(recordProbeC(c.num("centre_C")) == c.num("record_C"), "reading \(c.num("centre_C"))")
        }
    }

    /// Written with explicit nulls, and read back as the same record.
    @Test("a record survives its own JSON, nulls and all")
    func roundTrip() throws {
        for record in fixtureLog() {
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
    func stepByStep() {
        guard let steps = replayJSON()["steps"] as? [[String: Any]] else { fatalError("no steps") }
        let log = fixtureLog()
        let grid = fixtureGrid()
        var c = fixtureStart()
        #expect(steps.count == log.count)
        for (i, r) in log.enumerated() {
            let step = steps[i]
            if recordTeaches(r) {
                let q = gridRequest(c, r, grid: grid)
                guard let spec = step["spec"] as? [String: Any] else { fatalError("step \(i): no spec") }
                expectClose(q.spec.alphaMin, spec.num("alphaMin"), "step \(i) alphaMin")
                expectClose(q.spec.timeMaxS, spec.num("timeMax_s"), "step \(i) timeMax")
                expectClose(recordCookTimeS(r), step.num("cookTime_s"), "step \(i) scored at")
                foldRecord(&c, r, grid: buildRequestedGrid(q))
            } else {
                #expect(step["spec"] is NSNull, "step \(i): an unanswered egg builds no surface")
            }
            guard let after = step["after"] as? [String: Any] else { fatalError("step \(i): no state") }
            expectCalibration(c, after, "step \(i)")
            expectClose(
                calibrationDoneness(c, level: 0.22).whiteDoseMin, step.num("whiteDoseAtSoft"),
                "step \(i): the white target the next soft egg is solved for"
            )
        }
    }

    @Test("the tail of the log from a frozen base")
    func fromBase() {
        guard let block = replayJSON()["fromBase"] as? [String: Any],
              let base = block["base"] as? [String: Any],
              let final = block["final"] as? [String: Any] else { fatalError("no fromBase") }
        let tail = Array(fixtureLog().dropFirst(Int(block.num("after"))))
        let rebuilt = replay(calibration(from: base), tail, grid: fixtureGrid())
        expectCalibration(rebuilt, final, "from base")
    }

    /// The claim E1 is done on, in this language, with E2's second answer: the
    /// app folds each egg when its first answer comes, stores the posterior,
    /// and on the second answer folds the egg AGAIN from the posterior before
    /// it; a replay folds the log in one go. They must not merely agree to twelve figures - they must be
    /// the same bits, or "a model change is a replay" quietly means "a model
    /// change moves your posterior a little for no reason".
    @Test("egg by egg, stored between eggs, is bit-identical to a replay")
    func bitIdentical() throws {
        let log = fixtureLog()
        let grid = fixtureGrid()
        // From a base that is not the prior, as a migrated phone starts.
        let base = replay(fixtureStart(), Array(log.prefix(1)), grid: grid)
        var c = try throughJSON(base)
        for r in log.dropFirst() {
            guard recordTeaches(r) else { continue }
            let before = c
            let surface = buildRequestedGrid(gridRequest(c, r, grid: grid))
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
    func startUntouched() {
        let start = fixtureStart()
        let before = start
        _ = replay(start, Array(fixtureLog().prefix(2)), grid: fixtureGrid())
        #expect(identical(start, before))
    }
}
