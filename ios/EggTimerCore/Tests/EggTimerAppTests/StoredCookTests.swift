import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore

/// The cook as this app stores it, through its own coder: what a relaunch
/// reads back is what was written, to the bit.
@Suite("The stored cook") @MainActor
struct StoredCookTests {
    @Test("a stored cook through JSONEncoder and JSONDecoder comes back to the bit, in the web's shape")
    func storedToTheBit() throws {
        var cooks = try fixtureRows("running.json", "reads").compactMap { readRunningCook($0["raw"]) }
        #expect(cooks.count >= 10)
        // And each again with doubles of 17 significant digits in its fields,
        // which is what JSONSerialization read back an ulp off.
        var draw = SplitMix(seed: 20261007)
        for base in cooks {
            // Every time moved by a fraction, and a correction of every
            // number, logged as a cook makes one.
            var cook = shiftedCook(base, by: draw.next())
            var choices = cook.choices
            choices.massKg = 0.04 + 0.04 * draw.next()
            choices.waterLitres = 0.2 + 3 * draw.next()
            choices.level = draw.next()
            choices.altitudeM = 2000 * draw.next()
            cook = corrected(cook, choices: choices, nowS: cook.startedAtS + 1 + draw.next())
            cooks.append(foldCook(
                idMs: cook.idMs, start: cook.start, nudgeS: 20 * draw.next() - 10,
                boilMemory: ["\(choices.waterLitres)": 300 + 600 * draw.next()], units: cook.units, lang: cook.lang,
                log: cook.log
            ))
        }
        for (i, cook) in cooks.enumerated() {
            let stored = StoredCook(cook: cook, answers: i % 2 == 0 ? .unanswered : .beforeReload, leanHintS: draw.next())
            let data = try JSONEncoder().encode(stored)
            let back = try JSONDecoder().decode(StoredCook.self, from: data)
            #expect(back == stored)
            #expect(back.cook == cook)
            // The web's keys and nulls: what JSONSerialization makes of it is
            // the store's own JSON, to its last bit but one.
            #expect(sameJSON(try JSONSerialization.jsonObject(with: data), stored.jsonObject, ulps: 4))
        }
    }
}

/// The rows of a fixture's list, read from the repository's fixtures/.
@MainActor private func fixtureRows(_ file: String, _ key: String) throws -> [[String: Any]] {
    let url = World.copyFolder.deletingLastPathComponent().appendingPathComponent("fixtures/\(file)")
    let fixture = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    return try #require(fixture[key] as? [[String: Any]])
}

/// Two JSON values, as JSONSerialization gives them, equal: numbers to
/// within `ulps` of the larger; a missing key and JSON's null alike.
private func sameJSON(_ a: Any?, _ b: Any?, ulps: Double) -> Bool {
    let aNull = a == nil || a is NSNull
    let bNull = b == nil || b is NSNull
    if aNull || bNull { return aNull && bNull }
    if let x = a as? [String: Any], let y = b as? [String: Any] {
        return Set(x.keys).union(y.keys).allSatisfy { sameJSON(x[$0], y[$0], ulps: ulps) }
    }
    if let x = a as? [Any], let y = b as? [Any] {
        return x.count == y.count && zip(x, y).allSatisfy { sameJSON($0, $1, ulps: ulps) }
    }
    if let x = a as? String, let y = b as? String { return x == y }
    if let x = a as? NSNumber, let y = b as? NSNumber {
        let xb = CFGetTypeID(x) == CFBooleanGetTypeID()
        let yb = CFGetTypeID(y) == CFBooleanGetTypeID()
        if xb || yb { return xb && yb && x.boolValue == y.boolValue }
        let (u, v) = (x.doubleValue, y.doubleValue)
        return u == v || abs(u - v) <= ulps * max(abs(u), abs(v)).ulp
    }
    return false
}

/// A fixed stream of doubles in [0, 1) with every bit of the mantissa used:
/// SplitMix64, for draws a test can repeat.
private struct SplitMix {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) / Double(UInt64(1) << 53)
    }
}
