import Foundation

/// How sure the timer is, in words: from the predicted
/// spread of the five yolk words at the time on screen, read against the word
/// asked, a class (very certain, a ballpark, a wild guess), the 90% interval
/// in words and the most likely word; and a likely time range, the right cook
/// time's 90% interval. The definitions and their reasons are in
/// src/core/certainty.ts, which this is held to by fixtures/certainty.json.

/// How sure, in three words: the keys D1 will give words to.
public enum Certainty: String, Sendable, Codable {
    case veryCertain
    case ballpark
    case wildGuess
}

/// Nine times in ten: the mass the class and the interval are read at.
public let certaintyMass = 0.9

/// The time range's quantiles: a 90% interval, as the words' is.
public let timeRangeLowQ = 0.05
public let timeRangeHighQ = 0.95

/// The five words' spread, read against the word asked. Words are places in
/// `donenessAnchors`, 0 (Runny) to 4 (Hard).
public struct WordCertainty: Sendable, Equatable {
    /// The word asked: the slider's word at the level.
    public let asked: Int
    public let certainty: Certainty
    /// P(the word asked), and P(it or a neighbour).
    public let pAsked: Double
    public let pNear: Double
    /// The 90% interval, words `from` to `to`, softest first, and what it
    /// holds.
    public let from: Int
    public let to: Int
    public let pInterval: Double
    /// The most likely word.
    public let mostLikely: Int
}

/// A likely time range, s from eggs in.
public struct TimeRange: Sendable, Equatable {
    public let lowS: Double
    public let highS: Double
}

/// Everything a tap on the certainty word shows, and the cook time it was
/// read at, s from eggs in, so a reading held over a plan that has moved can
/// say its range about the time now (`timeRangeWords`).
public struct CertaintyReading: Sendable, Equatable {
    public let words: WordCertainty
    public let time: TimeRange
    public let atS: Double
}

/// The word asked at a slider level: the place of `anchorNear(level)`.
public func askedWord(_ level: Double) -> Int {
    let key = anchorNear(level).key
    for i in 0..<donenessAnchors.count where donenessAnchors[i].key == key {
        return i
    }
    return 0
}

/// p[from] + ... + p[to], added from the soft end.
private func massOf(_ p: [Double], _ from: Int, _ to: Int) -> Double {
    var m = 0.0
    for k in from...to {
        m += p[k]
    }
    return m
}

/// The class, the interval and the most likely word, from the five words'
/// probabilities (runny to hard) and the word asked.
public func wordCertainty(_ p: [Double], asked: Int) -> WordCertainty {
    let n = p.count
    let pAsked = p[asked]
    let pNear = massOf(p, asked > 0 ? asked - 1 : 0, asked < n - 1 ? asked + 1 : n - 1)
    let certainty: Certainty = pAsked >= certaintyMass
        ? .veryCertain
        : pNear >= certaintyMass ? .ballpark : .wildGuess

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

    var mostLikely = 0
    for k in 1..<n where p[k] > p[mostLikely] {
        mostLikely = k
    }
    return WordCertainty(
        asked: asked, certainty: certainty, pAsked: pAsked, pNear: pNear,
        from: from, to: to, pInterval: pInterval, mostLikely: mostLikely
    )
}

/// Where the bracket under the slider is drawn, as slider levels: from `low`
/// to `high`, with a mark at `mark` (certainty.ts, "THE BRACKET").
public struct WordBracket: Sendable, Equatable {
    public let low: Double
    public let mark: Double
    public let high: Double
}

/// The lower edge of word `k`'s band on the slider: the midpoint between its
/// anchor and the one below, or 0 for the softest.
public func wordBandLow(_ k: Int) -> Double {
    k > 0 ? 0.5 * (donenessAnchors[k - 1].level + donenessAnchors[k].level) : 0.0
}

/// The upper edge of word `k`'s band: the midpoint between its anchor and the
/// one above, or 1 for the firmest.
public func wordBandHigh(_ k: Int) -> Double {
    k < donenessAnchors.count - 1 ? 0.5 * (donenessAnchors[k].level + donenessAnchors[k + 1].level) : 1.0
}

/// The bracket for an interval: the outer edges of its first and last words'
/// bands, and the most likely word's anchor.
public func wordBracket(_ w: WordCertainty) -> WordBracket {
    WordBracket(low: wordBandLow(w.from), mark: donenessAnchors[w.mostLikely].level, high: wordBandHigh(w.to))
}

/// The likely time range for a cook aiming at a nominal yolk dose of
/// 10^`logNominalTarget`: the right cook time's 90% interval.
public func likelyTimeRange(_ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double) -> TimeRange {
    let r = predictCookTime(post, grid, logNominalTarget, lowQ: timeRangeLowQ, highQ: timeRangeHighQ)
    return TimeRange(lowS: r.lowS, highS: r.highS)
}

/// How sure the timer is of the egg at `cookTimeS` - the time on screen -
/// when the slider is at `level`, the level that time is for.
public func certaintyAt(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, level: Double
) -> CertaintyReading {
    CertaintyReading(
        words: wordCertainty(yolkWordProbabilities(post, grid, cookTimeS), asked: askedWord(level)),
        time: likelyTimeRange(post, grid, logYolkTarget(level)),
        atS: cookTimeS
    )
}
