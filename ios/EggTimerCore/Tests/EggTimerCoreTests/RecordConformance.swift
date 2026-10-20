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

/// Exactly equal, bit for bit: every particle, every weight, the RNG and the count.
private func identical(_ a: Calibration, _ b: Calibration) -> Bool {
    guard a.eggsLogged == b.eggsLogged, a.posterior.rng == b.posterior.rng,
          a.posterior.particles.count == b.posterior.particles.count else { return false }
    for i in 0..<a.posterior.particles.count {
        let p = a.posterior.particles[i]
        let q = b.posterior.particles[i]
        if p.alphaM2s.bitPattern != q.alphaM2s.bitPattern
            || p.logDoseOffset.bitPattern != q.logDoseOffset.bitPattern
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
        t: p.particles.map { _ in 1.0 }, sd: p.particles.map(\.noise),
        wo: p.particles.map(\.whiteOffset), wg: p.particles.map(\.whiteFirmGap), w: p.weights
    )
    let back = try JSONDecoder().decode(Columns.self, from: JSONEncoder().encode(columns))
    var particles = [Particle]()
    for i in 0..<back.a.count {
        particles.append(Particle(
            alphaM2s: back.a[i], logDoseOffset: back.o[i],
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
    /// What a loader makes of each: the record as parsed, or null where it
    /// refuses one, written back with the TypeScript's keys.
    @Test("which records a loader trusts, case by case")
    func validation() throws {
        for c in try Fixtures.list("record.json", "cases") {
            try expectJSON(decodeRecord(c["record"] as Any), c["parsed"], c.str("why"), strict: true)
        }
    }

    /// Each field that takes one of a list: this port's enumeration is the
    /// TypeScript's, member for member and in order, and the canonical record
    /// carrying each of its cases loads as it does there. The decoder takes a
    /// member only through `init(rawValue:)`, so a case added to an enum is all
    /// a record needs; one added to the TypeScript's list fails here until it
    /// is a case.
    @Test("every member of every list a field takes, against the TypeScript's")
    func members() throws {
        let swift: [String: [String]] = [
            "app": AppName.allCases.map(\.rawValue),
            "egg.massFrom": MassFrom.allCases.map(\.rawValue),
            "egg.sizeTable": SizeTable.allCases.map(\.rawValue),
            "setup.startMode": StartMode.allCases.map(\.rawValue),
            "setup.eggFrom": EggFrom.allCases.map(\.rawValue),
            "setup.timeToBoilFrom": TimeToBoilFrom.allCases.map(\.rawValue),
            "setup.cooling": Cooling.allCases.map(\.rawValue),
            "setup.afterBoil": HeatAfterBoil.allCases.map(\.rawValue),
            "pulledBy": PulledBy.allCases.map(\.rawValue),
            "yolkWord": YolkWord.allCases.map(\.rawValue),
            "white": WhiteReport.allCases.map(\.rawValue),
            "units": Units.allCases.map(\.rawValue),
        ]
        let fields = try #require(Fixtures.node("record.json", "members.fields") as? [String: [String]])
        #expect(Set(swift.keys) == Set(fields.keys), "the same fields")
        for (path, members) in fields {
            #expect(swift[path] == members, "\(path): the same members")
        }
        let cases = try Fixtures.list("record.json", "members.cases")
        for (path, members) in swift {
            for member in members {
                let c = try #require(
                    cases.first { $0["path"] as? String == path && $0["member"] as? String == member },
                    "no case for \(path) \(member)"
                )
                expectJSON(decodeRecord(c["record"] as Any), c["parsed"], "\(path) \(member)", strict: true)
            }
        }
    }

    /// What both apps write down for a cook: the same record from the same
    /// facts, with its nulls written and `id` only when there is one.
    @Test("the record made from a cook's facts, case by case")
    func made() throws {
        for c in try Fixtures.list("record.json", "made") {
            let why = try c.str("why")
            let made = try recordFor(decoded(CookFacts.self, c["facts"]))
            expectJSON(made, c["record"], why, strict: true)
            #expect(validRecord(made), "\(why): a record the loader reads")
        }
    }

    @Test("a probe reading's when, from the end of the counted cooling")
    func probeWhen() throws {
        for c in try Fixtures.list("record.json", "probeWhen") {
            let record = try decoded(EggRecord.self, c["record"])
            let coolEnd = try c.optionalNum("coolEnd_s")
            let read = try probeReadingFor(record, centreC: c.num("centre_C"), coolEndS: coolEnd)
            expectJSON(read, c["probe"], "cooling ended at \(String(describing: coolEnd))", strict: true)
        }
    }

    /// What a launch makes of its store: the decision the app's own
    /// `Calibrations.load` takes, every path, held to the TypeScript's.
    @Test("what a launch makes of the store it read, case by case")
    func load() throws {
        let section = try Fixtures.object("record.json", "load")
        let population = try section.str("population")
        let likelihood = try section.str("likelihood")
        for c in try Fixtures.list("record.json", "load.cases") {
            let read = try decoded(StoreRead.self, c["read"])
            try expectJSON(loadDecision(read, population: population, likelihood: likelihood), c["decision"], c.str("why"))
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

    /// The same store makes the same results file, as data, with the same
    /// keys.
    @Test("the results file is the TypeScript's")
    func resultsFiles() throws {
        for n in try Fixtures.list("record.json", "resultsFile.names") {
            #expect(try resultsFileName(day: n.str("day")) == n.str("name"))
        }
        for c in try Fixtures.list("record.json", "resultsFile.cases") {
            let meta = try decoded(ResultsMeta.self, c["meta"])
            let file = try JSONSerialization.jsonObject(with: Data(resultsFile(meta, stored: c["stored"] as? String).utf8))
            let differences = jsonDifferences(file, c["file"], strict: true)
            #expect(differences.isEmpty, "results file for \(meta.appVersion): \(differences.prefix(6))")
        }
    }

    /// Written with explicit nulls, as the TypeScript wrote the log, and read
    /// back as the same record.
    @Test("a record survives its own JSON, nulls and all")
    func roundTrip() throws {
        let rows = try #require(Fixtures.node("record.json", "replay.log") as? [Any], "no replay log")
        for (i, (row, record)) in zip(rows, try fixtureLog()).enumerated() {
            expectJSON(record, row, "log record \(i)", strict: true)
            let back = try JSONDecoder().decode(EggRecord.self, from: JSONEncoder().encode(record))
            #expect(back == record, "log record \(i), read back")
        }
    }
}

/// One egg of the replay as the fixture writes it: the surface it was learned
/// on (none for an egg with no answer), the time it was scored at, the white
/// target the next soft egg is solved for, and the calibration after it.
private struct ReplayStep: Encodable {
    let spec: GridSpec?
    let cookTimeS: Double
    let whiteDoseAtSoft: Double
    let after: Calibration

    enum CodingKeys: String, CodingKey {
        case spec, cookTimeS = "cookTime_s", whiteDoseAtSoft, after
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(spec, forKey: .spec)
        try c.encode(cookTimeS, forKey: .cookTimeS)
        try c.encode(whiteDoseAtSoft, forKey: .whiteDoseAtSoft)
        try c.encode(after, forKey: .after)
    }
}

@Suite("Replay")
struct ReplayConformance {
    @Test("a fifteen-egg log in the five yolk words, egg by egg, every particle")
    func stepByStep() throws {
        let steps = try Fixtures.list("record.json", "replay.steps")
        let log = try fixtureLog()
        let grid = try fixtureGrid()
        var c = try fixtureStart()
        try #require(steps.count == log.count)
        for (i, r) in log.enumerated() {
            var spec: GridSpec?
            if recordTeaches(r) {
                let q = gridRequestFor(c, r, grid: grid)
                spec = q.spec
                foldRecord(&c, r, grid: buildRequestedGrid(q))
            }
            let made = ReplayStep(
                spec: spec, cookTimeS: recordCookTimeS(r),
                whiteDoseAtSoft: calibrationDoneness(c, level: 0.22).whiteDoseMin, after: c
            )
            expectJSON(made, steps[i], "step \(i)")
        }
    }

    @Test("the tail of the log from a frozen base")
    func fromBase() throws {
        let block = try Fixtures.object("record.json", "replay.fromBase")
        let tail = try Array(fixtureLog().dropFirst(Int(block.num("after"))))
        let rebuilt = try replay(decoded(Calibration.self, block["base"]), tail, grid: fixtureGrid())
        expectJSON(rebuilt, block["final"], "from base")
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
            if r.yolkWord != nil { first.white = nil }
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

@Suite("The calibration grid matches the reference implementation")
struct CalibrationGridConformance {
    /// The one that matters most: these six numbers are handed to
    /// `buildDoseGrid`, so they decide what the filter can see and therefore
    /// what the posterior becomes.
    @Test("extent and resolution, including the floor on a short cook")
    func cases() throws {
        for c in try Fixtures.list("record.json", "calibrationGrid.cases") {
            let g = try calibrationGrid(alphaCentre: c.num("alphaCentre"), cookTimeS: c.num("cookTime_s"))
            expectJSON(g, c["grid"], "grid(alpha \(try c.num("alphaCentre")), cook \(try c.num("cookTime_s")))")
        }
    }
}
