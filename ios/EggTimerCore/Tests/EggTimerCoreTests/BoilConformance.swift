import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/boil.json`, generated from
/// `src/core/boil.ts`: a boil remembered, blended or refused, and the
/// estimate for a volume, measured or not.

@Suite("Boil memory matches the reference implementation")
struct BoilMemoryConformance {
    @Test("a first measurement is whole, a second is blended")
    func blend() throws {
        let blend = try Fixtures.list("boil.json", "blend")
        try #require(blend.count >= 2, "blend needs a first and a second measurement")
        let first = try rememberBoil([:], litres: 2, seconds: blend[0].num("measured"))
        try expectClose(estimateTimeToBoil(first, litres: 2), blend[0].num("result"), "first measurement")
        let second = try rememberBoil(first, litres: 2, seconds: blend[1].num("measured"))
        try expectClose(estimateTimeToBoil(second, litres: 2), blend[1].num("result"), "blended")
    }

    @Test("an incredible measurement is refused rather than remembered")
    func refused() throws {
        for c in try Fixtures.list("boil.json", "refused") {
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
        for c in try Fixtures.list("boil.json", "estimate") {
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
        try expectClose(defaultTimeToBoilS, Fixtures.number("boil.json", "defaultSeconds"), "defaultTimeToBoilS")
    }
}
