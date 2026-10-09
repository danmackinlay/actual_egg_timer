import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/slider.json`, generated from
/// `src/core/slider.ts`: snapping, the nearest label, the target temperature,
/// which tick words can be reached, and the refusal verdict.
///
/// Same rule as the rest of the port: the fixtures are never regenerated to
/// make this pass. If a NUMBER is wrong it is wrong in the TypeScript first,
/// and `npm test` is what should catch it.

@Suite("Snapping and the labels match the reference implementation")
struct SliderConformance {
    @Test("the slider grid is the same grid")
    func steps() throws {
        try expectClose(sliderSteps, Fixtures.number("slider.json", "steps"), "sliderSteps")
    }

    @Test("snapUp, snapDown, anchorNear and the target temperature, every case")
    func cases() throws {
        for c in try Fixtures.list("slider.json", "cases") {
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
        for c in try Fixtures.list("slider.json", "reachableWords") {
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
        for c in try Fixtures.list("slider.json", "verdict") {
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
