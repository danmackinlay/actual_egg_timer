import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/policy.json`, generated from `src/core/policy.ts`.
///
/// Everything it covers is a decision both apps make, so a copy that drifts
/// shows on screen: the eggs in the pan, the default egg, the presets. The
/// calibration grid matters most: its six numbers decide what the particle
/// filter can see, so two apps with different grids learn different things
/// from the same egg.
///
/// Same rule as the rest of the port: the fixtures are never regenerated to
/// make this pass. If a NUMBER is wrong it is wrong in the TypeScript first,
/// and `npm test` is what should catch it.

@Suite("Snapping and the labels match the reference implementation")
struct SliderConformance {
    @Test("the slider grid is the same grid")
    func steps() throws {
        let slider = try Fixtures.object("policy.json", "slider")
        try expectClose(sliderSteps, slider.num("steps"), "sliderSteps")
    }

    @Test("snapUp, snapDown, anchorNear and the target temperature, every case")
    func cases() throws {
        for c in try Fixtures.list("policy.json", "slider.cases") {
            let level = try c.num("level")
            try expectClose(snapUp(level), c.num("snapUp"), "snapUp(\(level))")
            try expectClose(snapDown(level), c.num("snapDown"), "snapDown(\(level))")
            try expectClose(
                targetPeakYolkC(level), c.num("targetPeakYolk_C"), "targetPeakYolkC(\(level))"
            )
            let anchor = try c.str("anchor")
            #expect(
                anchorNear(level).key == anchor,
                "anchorNear(\(level)): expected \(anchor), got \(anchorNear(level).key)"
            )
        }
    }
}

@Suite("Which tick words can be reached matches the reference implementation")
struct ReachableWordsConformance {
    @Test("anchorReachable, every case")
    func cases() throws {
        for c in try Fixtures.list("policy.json", "reachableWords") {
            let softest = try c.num("softest")
            let hardest = try c.num("hardest")
            let want = try #require(c["reachable"] as? [Bool], "reachable")
            #expect(want.count == donenessAnchors.count)
            for i in donenessAnchors.indices {
                #expect(
                    anchorReachable(i, softest: softest, hardest: hardest) == want[i],
                    "anchorReachable(\(i), \(softest), \(hardest))"
                )
            }
        }
    }
}

@Suite("The refusal verdict matches the reference implementation")
struct VerdictConformance {
    /// A Solution carrying only the fields the verdict reads. The fixture cases
    /// are synthetic for the same reason they are on the TypeScript side: the
    /// point is to pin the DECISION, not to re-test the solver, and a synthetic
    /// solution can sit exactly on boundaries a real one reaches by accident.
    private func solution(
        reachable: Bool, whiteSets: Bool, softestLevel: Double, hardestLevel: Double
    ) -> Solution {
        Solution(
            result: CookResult(
                cookTimeS: 0, peakYolkC: 0, peakYolkTimeS: 0, yolkAtPullC: 0,
                yolkDoseMin: 0, whiteDoseMin: 0, peakWhiteC: 0
            ),
            reachable: reachable,
            minCookTimeS: 0,
            softestLevel: softestLevel,
            hardestLevel: hardestLevel,
            whiteSets: whiteSets
        )
    }

    @Test("kind, labels, snap target and whether it is worth saying")
    func cases() throws {
        for c in try Fixtures.list("policy.json", "verdict") {
            let level = try c.num("level")
            let sol = try solution(
                reachable: c.flag("reachable"),
                whiteSets: c.flag("whiteSets"),
                softestLevel: c.num("softestLevel"),
                hardestLevel: c.num("hardestLevel")
            )
            let v = verdictFor(sol, level: level)
            let what = "verdict(level \(level), reachable \(sol.reachable),"
                + " whiteSets \(sol.whiteSets), softest \(sol.softestLevel),"
                + " hardest \(sol.hardestLevel))"

            #expect(try v.kind.rawValue == c.str("kind"), "\(what) kind")
            #expect(try v.wanted.key == c.str("wanted"), "\(what) wanted")
            #expect(try v.limit.key == c.str("limit"), "\(what) limit")
            #expect(try v.worthSaying == c.flag("worthSaying"), "\(what) worthSaying")

            switch (v.snapTo, try c.optionalNum("snapTo")) {
            case (nil, nil):
                break
            case let (actual?, expected?):
                expectClose(actual, expected, "\(what) snapTo")
            case let (actual, expected):
                Issue.record("\(what) snapTo: expected \(String(describing: expected)), got \(String(describing: actual))")
            }
        }
    }
}

@Suite("Texture bands match the reference implementation")
struct TextureConformance {
    @Test("the named edges: texture bands, the room egg, the calibration grid's alpha")
    func edges() throws {
        let e = try Fixtures.object("policy.json", "edges")
        let white = try e.object("whiteBandBelow_C")
        let yolk = try e.object("yolkBandBelow_C")
        #expect(try WhiteBandBelowC.justSet == white.num("justSet"))
        #expect(try WhiteBandBelowC.set == white.num("set"))
        #expect(try YolkBandBelowC.liquid == yolk.num("liquid"))
        #expect(try YolkBandBelowC.soft == yolk.num("soft"))
        #expect(try YolkBandBelowC.jammy == yolk.num("jammy"))
        #expect(try YolkBandBelowC.fudgy == yolk.num("fudgy"))
        #expect(try roomEggFromC == e.num("roomEggFrom_C"))
        #expect(try calibrationAlphaLow == e.num("calibrationAlphaLow"))
        #expect(try calibrationAlphaHigh == e.num("calibrationAlphaHigh"))
    }

    @Test("every band boundary, from both sides, and a white that never sets")
    func cases() throws {
        var runny = 0
        for c in try Fixtures.list("policy.json", "texture") {
            let yolk = try c.num("peakYolk_C")
            let white = try c.num("peakWhite_C")
            let sets = try c.flag("whiteSets")
            let t = textureFor(peakYolkC: yolk, peakWhiteC: white, whiteSets: sets)
            #expect(try t.white.rawValue == c.str("white"), "white band at \(white) C, sets \(sets)")
            #expect(try t.yolk.rawValue == c.str("yolk"), "yolk band at \(yolk) C")
            let note = textureNoteKeys(t)
            #expect(try note.key == c.str("noteKey"), "note at \(yolk) / \(white) C, sets \(sets)")
            #expect(note.parts["white"] == c["noteWhite"] as? String, "note's white at \(white) C")
            #expect(note.parts["yolk"] == c["noteYolk"] as? String, "note's yolk at \(yolk) C")
            if !sets { runny += 1 }
        }
        // The case the fixture exists for: without it, this suite would pass
        // on a port that never says "runny" at all.
        #expect(runny > 0, "the fixture has no white that never sets")
    }

    /// Not "white just set": the peak is on the lowest rung of the temperature
    /// scale, but the dose never gets there.
    @Test("a white the pan never sets is runny, not just set")
    func runnyWhite() {
        let t = textureFor(peakYolkC: 48, peakWhiteC: 51, whiteSets: false)
        #expect(t.white == .runny)
        #expect(textureNoteKeys(t) == TextureNote(key: "texture.white.runny", parts: [:]))
    }
}

@Suite("The calibration grid matches the reference implementation")
struct CalibrationGridConformance {
    /// The one that matters most: these six numbers are handed to
    /// `buildDoseGrid`, so they decide what the filter can see and therefore
    /// what the posterior becomes.
    @Test("extent and resolution, including the floor on a short cook")
    func cases() throws {
        for c in try Fixtures.list("policy.json", "calibrationGrid") {
            let alphaCentre = try c.num("alphaCentre")
            let cookTimeS = try c.num("cookTime_s")
            let g = calibrationGrid(alphaCentre: alphaCentre, cookTimeS: cookTimeS)
            let what = "grid(alpha \(alphaCentre), cook \(cookTimeS))"
            try expectClose(g.alphaMin, c.num("alphaMin"), "\(what) alphaMin")
            try expectClose(g.alphaMax, c.num("alphaMax"), "\(what) alphaMax")
            try expectClose(Double(g.alphaCount), c.num("alphaCount"), "\(what) alphaCount")
            try expectClose(g.timeMinS, c.num("timeMin_s"), "\(what) timeMinS")
            try expectClose(g.timeMaxS, c.num("timeMax_s"), "\(what) timeMaxS")
            try expectClose(Double(g.timeCount), c.num("timeCount"), "\(what) timeCount")
        }
    }

    @Test("the particle count and seed are the same kitchen")
    func particles() throws {
        let calibration = try Fixtures.object("policy.json", "calibration")
        try expectClose(Double(particleCount), calibration.num("particles"), "particleCount")
        try expectClose(Double(calibrationSeed), calibration.num("seed"), "calibrationSeed")
    }
}

@Suite("Boil memory matches the reference implementation")
struct BoilMemoryConformance {
    @Test("a first measurement is whole, a second is blended")
    func blend() throws {
        let blend = try Fixtures.list("policy.json", "boilMemory.blend")
        try #require(blend.count >= 2, "boilMemory.blend needs a first and a second measurement")
        let first = try rememberBoil([:], litres: 2, seconds: blend[0].num("measured"))
        try expectClose(estimateTimeToBoil(first, litres: 2), blend[0].num("result"), "first measurement")
        let second = try rememberBoil(first, litres: 2, seconds: blend[1].num("measured"))
        try expectClose(estimateTimeToBoil(second, litres: 2), blend[1].num("result"), "blended")
    }

    @Test("an incredible measurement is refused rather than remembered")
    func refused() throws {
        for c in try Fixtures.list("policy.json", "boilMemory.refused") {
            let seconds = try c.num("seconds")
            let remembered = try c.flag("remembered")
            let memory = rememberBoil([:], litres: 2, seconds: seconds)
            #expect(
                hasBoilMemory(memory) == remembered,
                "a \(seconds) s tap should\(remembered ? "" : " not") be remembered"
            )
        }
    }

    /// The fixture remembers the same two pans in both orders. This Dictionary
    /// has no order of its own, which is exactly how the two apps could once
    /// give different answers for the same two equidistant pans.
    @Test("the nearest remembered volume does not depend on insertion order")
    func estimate() throws {
        let forward = rememberBoil(rememberBoil([:], litres: 1, seconds: 300), litres: 3, seconds: 900)
        let backward = rememberBoil(rememberBoil([:], litres: 3, seconds: 900), litres: 1, seconds: 300)
        for c in try Fixtures.list("policy.json", "boilMemory.estimate") {
            let litres = try c.num("litres")
            try expectClose(
                estimateTimeToBoil(forward, litres: litres), c.num("forward"),
                "estimate at \(litres) L, remembered small-first"
            )
            try expectClose(
                estimateTimeToBoil(backward, litres: litres), c.num("backward"),
                "estimate at \(litres) L, remembered large-first"
            )
        }
    }

    @Test("the fallback is the same fallback")
    func fallback() throws {
        let memory = try Fixtures.object("policy.json", "boilMemory")
        try expectClose(defaultTimeToBoilS, memory.num("defaultSeconds"), "defaultTimeToBoilS")
    }
}

@Suite("Defaults and bounds match the reference implementation")
struct DefaultsConformance {
    /// Both apps open on the same eggs in the pan and the same egg.
    @Test("a fresh install starts from the same kitchen")
    func defaults() throws {
        let d = try Fixtures.object("policy.json", "defaults")
        try expectClose(Double(Defaults.sizeIndex), d.num("sizeIndex"), "sizeIndex")
        try expectClose(Defaults.customStartC, d.num("customStart_C"), "customStart_C")
        try expectClose(Defaults.altitudeM, d.num("altitude_m"), "altitude_m")
        try expectClose(Defaults.waterLitres, d.num("waterLitres"), "waterLitres")
        try expectClose(Double(Defaults.eggCount), d.num("eggCount"), "eggCount")
        try expectClose(Defaults.doneness, d.num("doneness"), "doneness")
        try expectClose(Defaults.eggMassKg, d.num("eggMass_kg"), "eggMass_kg")
        try expectClose(StartTempPresets.fridgeC, d.num("fridge_C"), "fridge preset")
        try expectClose(StartTempPresets.roomC, d.num("room_C"), "room preset")
    }

    @Test("the room follows the egg at the same threshold, and a measured room wins")
    func ambient() throws {
        for c in try Fixtures.list("policy.json", "ambient") {
            let start = try c.num("eggStart_C")
            let room = try c.optionalNum("room_C")
            try expectClose(
                ambientFor(eggStartC: start, roomC: room), c.num("ambient_C"),
                "ambient for \(start) C in a room of \(String(describing: room))"
            )
        }
    }

    @Test("a measured room counts only with a probe, and moves only the Room button")
    func measuredRoom() throws {
        for c in try Fixtures.list("policy.json", "roomInUse") {
            let probe = try c.flag("probe")
            let room = try c.optionalNum("room_C")
            let got = roomInUse(probe: probe, roomC: room)
            let want = try c.optionalNum("inUse_C")
            #expect(got == want, "room \(String(describing: room)), probe \(probe)")
        }
        for c in try Fixtures.list("policy.json", "startTempPresets") {
            let preset = try c.value(StartTempPreset.self, "preset")
            let room = try c.optionalNum("room_C")
            try expectClose(startTempPresetC(preset, roomC: room), c.num("eggStart_C"), "\(preset) preset")
        }
    }

    @Test("every bound is the same bound")
    func limits() throws {
        let limits = try Fixtures.object("policy.json", "limits")
        let pairs: [(String, ClosedRange<Double>)] = [
            ("mass_g", Limits.massG),
            ("eggTemp_C", Limits.eggTempC),
            ("room_C", Limits.roomC),
            ("altitude_m", Limits.altitudeM),
            ("waterLitres", Limits.waterLitres),
            ("eggCount", Limits.eggCount),
            ("doneness", Limits.doneness),
            ("sizeIndex", Limits.sizeIndex),
            ("timeToBoil_s", Limits.timeToBoilS),
        ]
        for (name, range) in pairs {
            guard let bounds = limits[name] as? [String: Any] else {
                Issue.record("fixtures/policy.json has no limit \(name)")
                continue
            }
            try expectClose(range.lowerBound, bounds.num("lo"), "\(name) lower bound")
            try expectClose(range.upperBound, bounds.num("hi"), "\(name) upper bound")
        }
    }
}

@Suite("Size classes by region match the reference implementation")
struct SizeClassConformance {
    /// Every key and every mass, in order (what each label shows, in either
    /// system, is UnitsConformance's). A US Large 8 g lighter than an EU
    /// one is half a minute of cooking, so a table that differs by a row is a
    /// different egg on the default path.
    @Test("both tables are the same tables")
    func tables() throws {
        for (name, classes) in [("eu", sizeClasses), ("us", usSizeClasses)] {
            let expected = try Fixtures.list("policy.json", "sizeClasses.\(name)")
            #expect(classes.count == expected.count, "\(name) table has \(classes.count) classes")
            for (actual, c) in zip(classes, expected) {
                #expect(try actual.key == c.str("key"), "\(name): \(actual.key)")
                try expectClose(actual.massKg, c.num("mass_kg"), "\(name) \(actual.key)")
            }
        }
    }

    @Test("the same regions get the American carton")
    func regions() throws {
        for c in try Fixtures.list("policy.json", "sizeClasses.regions") {
            let region = c["region"] as? String
            let table = try c.str("table")
            let expected = table == "us" ? usSizeClasses : sizeClasses
            #expect(
                sizeClassesFor(region: region) == expected,
                "region \(region ?? "nil") should get the \(table) table"
            )
            #expect(
                sizeTableFor(region: region).rawValue == table,
                "region \(region ?? "nil") names the \(table) table"
            )
        }
    }

    /// The rule for a stored record meeting a changed region. The two apps
    /// store the same index, so they must read it back the same way.
    @Test("a stored size is carried into either table the same way")
    func carry() throws {
        for c in try Fixtures.list("policy.json", "sizeClasses.carry") {
            let stored = try c.num("stored")
            #expect(
                try carrySizeIndex(stored, classes: sizeClasses) == Int(c.num("eu")),
                "stored \(stored) read against the EU table"
            )
            #expect(
                try carrySizeIndex(stored, classes: usSizeClasses) == Int(c.num("us")),
                "stored \(stored) read against the US table"
            )
        }
    }
}

@Suite("The phase rule matches the reference implementation")
struct PhaseConformance {
    /// The counter-rest timeline matters most: with no cooling deadline, an
    /// app that fell from COOKING straight to DONE would never show "Out of
    /// the water — now" or run the 20 s grace, while the pull notification
    /// still fired at a screen that already said Done. Sampled either side of
    /// every boundary.
    @Test("every boundary, with and without a cooling step")
    func timelines() throws {
        for timeline in try Fixtures.list("policy.json", "phase.timelines") {
            let name = try timeline.str("name")
            let cookEndS = try timeline.num("cookEnd_s")
            let coolEndS = try timeline.optionalNum("coolEnd_s")
            let outAtS = try timeline.optionalNum("outAt_s")
            for sample in try timeline.rows("samples") {
                let nowS = try sample.num("now_s")
                let phase = try sample.str("phase")
                let provisional = try sample.str("provisional")
                let running = phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: false, outAtS: outAtS),
                    nowS: nowS
                )
                #expect(
                    running.rawValue == phase,
                    "\(name) at \(nowS) s: expected \(phase), got \(running.rawValue)"
                )
                let guessing = phaseAt(
                    Deadlines(cookEndS: cookEndS, coolEndS: coolEndS, provisional: true, outAtS: outAtS),
                    nowS: nowS
                )
                let what = "\(name) at \(nowS) s, boil not yet tapped:"
                    + " expected \(provisional), got \(guessing.rawValue)"
                #expect(guessing.rawValue == provisional, "\(what)")
            }
        }
    }

    @Test("the cooling step and the pull grace are the same lengths")
    func constants() throws {
        let phase = try Fixtures.object("policy.json", "phase")
        try expectClose(coolingSeconds, phase.num("coolingSeconds"), "coolingSeconds")
        try expectClose(pullGraceSeconds, phase.num("pullGraceSeconds"), "pullGraceSeconds")
        let slowHob = try phase.object("slowHob")
        try expectClose(slowHobWhenLeftS, slowHob.num("whenLeft_s"), "slowHobWhenLeftS")
        try expectClose(slowHobExtraS, slowHob.num("extra_s"), "slowHobExtraS")
        try expectClose(slowHobEveryS, slowHob.num("every_s"), "slowHobEveryS")
    }
}

@Suite("What a sharing sender makes of the endpoint's answer matches the reference implementation")
struct ShareReplyConformance {
    @Test("every status's reading, and the bounds on waiting")
    func cases() throws {
        let share = try Fixtures.object("policy.json", "share")
        #expect(Double(shareWaitTries) == (try share.num("waitTries")), "shareWaitTries")
        try expectClose(shareWaitS, share.num("wait_s"), "shareWaitS")
        for c in try share.rows("replies") {
            let status = Int(try c.num("status"))
            let want = try c.value(ShareReply.self, "reply")
            #expect(shareReply(status) == want, "shareReply(\(status))")
        }
        for c in try share.rows("givesUp") {
            let tries = Int(try c.num("tries"))
            let waitedS = try c.num("waited_s")
            #expect(
                shareGivesUp(tries: tries, waitedS: waitedS) == (try c.flag("givesUp")),
                "shareGivesUp(\(tries), \(waitedS))"
            )
        }
    }
}
