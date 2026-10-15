import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore

/// The key an odds profile is cached by (`DecisionGrids.profileKey`): two
/// posteriors that differ anywhere get different keys, or one is served the
/// other's profile. The web holds its `profileKey` alike
/// (test/gridBuilds.test.ts).
@Suite("The odds-profile key") @MainActor
struct DecisionGridsTests {
    @Test("two posteriors whose white shifts cancel are cached under different keys")
    func cancellingShift() {
        let c = freshCalibration(count: particleCount, seed: calibrationSeed)
        // Every particle's white cutpoint offset and gap swapped: each moves,
        // their sum stays the same to the bit, and so does every other
        // dimension.
        var swapped = c
        swapped.posterior.particles = c.posterior.particles.map { p in
            var q = p
            q.whiteOffset = p.whiteFirmGap
            q.whiteFirmGap = p.whiteOffset
            return q
        }
        let pot = cookSetupOf(StoredCookTests.choices, timeToBoilS: 480)
        let inputs = decisionInputs(c, egg: pot.egg, setup: pot.setup)
        #expect(DecisionGrids.profileKey(inputs, swapped) != DecisionGrids.profileKey(inputs, c))
    }
}
