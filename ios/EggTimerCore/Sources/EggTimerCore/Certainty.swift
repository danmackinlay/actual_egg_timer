import Foundation

/// The twin of `src/core/certainty.ts`, held to it by
/// `fixtures/certainty.json`; the TypeScript's comments say what each part is
/// for.

public enum Certainty: String, Sendable, Codable {
    case veryCertain
    case ballpark
    case wildGuess
}

/// Words are places in `donenessAnchors`, 0 (Runny) to 4 (Hard).
public struct WordCertainty: Sendable, Equatable, Codable {
    public let asked: Int
    public let certainty: Certainty
    public let pAsked: Double
    public let pNear: Double
    public let from: Int
    public let to: Int
    public let pInterval: Double
    public let mostLikely: Int
}

public struct TimeRange: Sendable, Equatable, Codable {
    public let lowS: Double
    public let highS: Double

    enum CodingKeys: String, CodingKey {
        case lowS = "low_s", highS = "high_s"
    }
}

public struct CertaintyReading: Sendable, Equatable, Codable {
    public let words: WordCertainty
    public let time: TimeRange
    public let atS: Double

    enum CodingKeys: String, CodingKey {
        case words, time, atS = "at_s"
    }
}

public func askedWord(_ level: Double) -> Int {
    let key = anchorNear(level).key
    for i in 0..<donenessAnchors.count where donenessAnchors[i].key == key {
        return i
    }
    return 0
}

private func massOf(_ p: [Double], _ from: Int, _ to: Int) -> Double {
    var m = 0.0
    for k in from...to {
        m += p[k]
    }
    return m
}

public func wordCertainty(_ p: [Double], asked: Int) -> WordCertainty {
    let n = p.count
    let pAsked = p[asked]
    let pNear = massOf(p, asked > 0 ? asked - 1 : 0, asked < n - 1 ? asked + 1 : n - 1)

    var from = 0
    var to = n - 1
    var pInterval = massOf(p, 0, n - 1)
    var found = false
    var width = 1
    while width < n && !found {
        var best = -1.0
        var start = 0
        while start + width <= n {
            let m = massOf(p, start, start + width - 1)
            if m >= certaintyMass && m > best {
                best = m
                from = start
                to = start + width - 1
                pInterval = m
                found = true
            }
            start += 1
        }
        width += 1
    }

    let askedInside = from <= asked && asked <= to
    let certainty: Certainty = pAsked >= certaintyMass
        ? .veryCertain
        : pNear >= certaintyMass && askedInside ? .ballpark : .wildGuess

    var mostLikely = 0
    for k in 1..<n where p[k] > p[mostLikely] {
        mostLikely = k
    }
    return WordCertainty(
        asked: asked, certainty: certainty, pAsked: pAsked, pNear: pNear,
        from: from, to: to, pInterval: pInterval, mostLikely: mostLikely
    )
}

public struct WordBracket: Sendable, Equatable, Codable {
    public let low: Double
    public let mark: Double
    public let high: Double
}

public func wordBandLow(_ k: Int) -> Double {
    k > 0 ? 0.5 * (donenessAnchors[k - 1].level + donenessAnchors[k].level) : 0.0
}

public func wordBandHigh(_ k: Int) -> Double {
    k < donenessAnchors.count - 1 ? 0.5 * (donenessAnchors[k].level + donenessAnchors[k + 1].level) : 1.0
}

public func wordBracket(_ w: WordCertainty) -> WordBracket {
    WordBracket(low: wordBandLow(w.from), mark: donenessAnchors[w.mostLikely].level, high: wordBandHigh(w.to))
}

func likelyTimeRange(_ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double) -> TimeRange {
    let r = predictCookTime(post, grid, logNominalTarget, lowQ: timeRangeLowQ, highQ: timeRangeHighQ)
    return TimeRange(lowS: r.lowS, highS: r.highS)
}

public func certaintyAt(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, level: Double
) -> CertaintyReading {
    CertaintyReading(
        words: wordCertainty(yolkWordProbabilities(post, grid, cookTimeS), asked: askedWord(level)),
        time: likelyTimeRange(post, grid, logYolkTarget(level)),
        atS: cookTimeS
    )
}
