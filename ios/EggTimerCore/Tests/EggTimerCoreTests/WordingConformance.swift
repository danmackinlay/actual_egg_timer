import Testing
import Foundation
@testable import EggTimerCore

/// Which catalogue key each part of the screen says, against
/// `fixtures/wording.json` (src/core/wording.ts).
private func rows(_ key: String) -> [[String: Any]] {
    guard let r = Fixtures.load("wording.json")[key] as? [[String: Any]], !r.isEmpty else {
        fatalError("wording.json has no rows \(key)")
    }
    return r
}

private func optionalString(_ json: [String: Any], _ key: String) -> String? {
    json[key] as? String
}

private func cooling(_ json: [String: Any]) -> Cooling {
    guard let c = Cooling(rawValue: json.str("cooling")) else { fatalError("cooling \(json)") }
    return c
}

private func startMode(_ json: [String: Any]) -> StartMode {
    guard let s = StartMode(rawValue: json.str("startMode")) else { fatalError("startMode \(json)") }
    return s
}

private func afterBoil(_ json: [String: Any]) -> HeatAfterBoil {
    guard let a = HeatAfterBoil(rawValue: json.str("afterBoil")) else { fatalError("afterBoil \(json)") }
    return a
}

@Suite("Wording")
struct WordingConformance {
    @Test("the constants")
    func constants() {
        guard let c = Fixtures.load("wording.json")["constants"] as? [String: Any] else { fatalError("constants") }
        #expect(directionLikely == c.num("directionLikely"))
        #expect(whiteRisk == c.num("whiteRisk"))
    }

    @Test("the refusal's key")
    func refusal() {
        for row in rows("refusal") {
            guard let kind = RefusalKind(rawValue: row.str("kind")) else { fatalError("kind \(row)") }
            let v = Verdict(
                kind: kind, wanted: anchorNear(0.4), limit: anchorNear(0.6), snapTo: nil,
                worthSaying: row.flag("worthSaying")
            )
            let ref = refusalKey(v, cooling: cooling(row))
            let label = "\(kind) \(row.flag("worthSaying")) \(row.str("cooling"))"
            #expect(ref?.key == optionalString(row, "key"), "\(label) key")
            let args = (row["args"] as? [String: NSNumber])?.mapValues(\.doubleValue)
            #expect(ref?.args == args, "\(label) args")
        }
    }

    @Test("the outcome's direction, white line and range")
    func outcome() {
        for row in rows("outcome") {
            guard let lean = Lean(rawValue: row.str("lean")) else { fatalError("lean \(row)") }
            let o = Outcome(
                pTooSoft: 0, pJustRight: row.num("pJustRight"), pTooFirm: 0, pWhiteRunny: row.num("pWhiteRunny"),
                levelLow: row.num("levelLow"), levelMedian: row.num("levelLow"), levelHigh: row.num("levelHigh"),
                lean: lean
            )
            let label = "\(row.num("pJustRight")) \(lean) \(row.num("pWhiteRunny"))"
            #expect(directionKey(o) == row.str("direction"), "\(label) direction")
            #expect(whiteAtRisk(o) == row.flag("whiteAtRisk"), "\(label) white")
            guard let range = row["range"] as? [String: Any], let args = range["args"] as? [String: String] else {
                fatalError("range \(row)")
            }
            let r = rangeWords(o)
            #expect(r.key == range.str("key"), "\(label) range key")
            #expect(r.args == args, "\(label) range args")
        }
    }

    @Test("the readout's keys in every phase")
    func phase() {
        for row in rows("phase") {
            guard let phase = Phase(rawValue: row.str("phase")) else { fatalError("phase \(row)") }
            let k = phaseKeys(PhaseFacts(
                phase: phase, startMode: startMode(row), afterBoil: afterBoil(row), cooling: cooling(row),
                whiteSets: row.flag("whiteSets"), boilKnown: row.flag("boilKnown"), probeWanted: row.flag("probeWanted")
            ))
            let expected = PhaseKeys(
                label: row.str("label"), subline: row.str("subline"),
                action: optionalString(row, "action"), hint: optionalString(row, "hint")
            )
            #expect(k == expected, "\(row)")
        }
    }

    @Test("the setup sentence's keys")
    func clauses() {
        for row in rows("clauses") {
            guard let from = EggFrom(rawValue: row.str("eggFrom")),
                  let keys = row["keys"] as? [String: [String: Any]] else { fatalError("clause \(row)") }
            let k = clauseKeys(ClauseFacts(
                eggFrom: from, startMode: startMode(row), sousVide: row.flag("sousVide"),
                afterBoil: afterBoil(row), cooling: cooling(row)
            ))
            #expect(k.count == keys.count)
            for clause in Clause.allCases {
                guard let e = keys[clause.rawValue] else { fatalError("no \(clause)") }
                let expected = ClauseKeys(text: e.str("text"), label: e.str("label"), value: optionalString(e, "value"))
                #expect(k[clause] == expected, "\(clause) in \(row)")
            }
        }
    }
}
