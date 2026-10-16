import Foundation

/// The twin of `src/core/outcome.ts`, held to it by `fixtures/outcome.json`;
/// the TypeScript's comments say what each part is for.

public enum Lean: String, Sendable, Codable {
    case soft
    case firm
    case balanced
}

/// Codable, so a running cook keeps the outcome it started with across a
/// relaunch.
public struct Outcome: Sendable, Codable, Equatable {
    public let pTooSoft: Double
    public let pJustRight: Double
    public let pTooFirm: Double
    public let pWhiteRunny: Double
    public let pWhiteTender: Double
    public let pWhiteFirm: Double
    /// Nil only on an outcome a running cook kept from a build before them.
    public let pYolkWord: [Double]?
    public let levelLow: Double
    public let levelMedian: Double
    public let levelHigh: Double
    public let lean: Lean
}


public func leanOf(_ pTooSoft: Double, _ pTooFirm: Double) -> Lean {
    if pTooSoft > leanRatio * pTooFirm { return .soft }
    if pTooFirm > leanRatio * pTooSoft { return .firm }
    return .balanced
}

/// The yolk's and the white's answers are summed here in the one pass that
/// reads the centres, where the TypeScript calls `yolkAnswerProbabilities` and
/// `whiteAnswerProbabilities`, which this package does not have.
public func predictOutcome(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, _ logNominalTarget: Double
) -> Outcome {
    let n = post.particles.count
    var centre = [Double](repeating: 0.0, count: n)
    var soft = 0.0
    var right = 0.0
    var firm = 0.0
    var runny = 0.0
    var tender = 0.0
    var whiteFirm = 0.0
    var total = 0.0
    for i in 0..<n {
        let p = post.particles[i]
        let w = post.weights[i]
        centre[i] = lookupLogYolkDose(grid, p.alphaM2s, cookTimeS)
        if w == 0.0 { continue }
        let yolk = yolkProbit(grid, p, cookTimeS, logNominalTarget)
        let white = whiteProbit(grid, p, cookTimeS)
        soft += w * withUnrelated(yolk[0])
        right += w * withUnrelated(yolk[1])
        firm += w * withUnrelated(yolk[2])
        runny += w * withUnrelated(white[0])
        tender += w * withUnrelated(white[1])
        whiteFirm += w * withUnrelated(white[2])
        total += w
    }
    if total > 0.0 {
        soft /= total
        right /= total
        firm /= total
        runny /= total
        tender /= total
        whiteFirm /= total
    } else {
        soft = 1.0 / 3.0
        right = 1.0 / 3.0
        firm = 1.0 / 3.0
        runny = 1.0 / 3.0
        tender = 1.0 / 3.0
        whiteFirm = 1.0 / 3.0
    }

    func cdf(_ x: Double) -> Double {
        var acc = 0.0
        for i in 0..<n {
            let w = post.weights[i]
            if w == 0.0 { continue }
            acc += w * normalCdf((x - centre[i]) / post.particles[i].noise)
        }
        return total > 0.0 ? acc / total : 0.5
    }
    let logLo = log10(yolkDoseRunny)
    let logHi = log10(yolkDoseHard)
    let atLo = cdf(logLo)
    let atHi = cdf(logHi)
    func level(_ q: Double) -> Double {
        if atLo >= q { return 0.0 }
        if atHi < q { return 1.0 }
        var a = logLo
        var b = logHi
        for _ in 0..<levelBisections {
            let mid = 0.5 * (a + b)
            if cdf(mid) < q { a = mid } else { b = mid }
        }
        return (0.5 * (a + b) - logLo) / (logHi - logLo)
    }

    return Outcome(
        pTooSoft: soft,
        pJustRight: right,
        pTooFirm: firm,
        pWhiteRunny: runny,
        pWhiteTender: tender,
        pWhiteFirm: whiteFirm,
        pYolkWord: yolkWordProbabilities(post, grid, cookTimeS),
        levelLow: level(levelLowQ),
        levelMedian: level(0.5),
        levelHigh: level(levelHighQ),
        lean: leanOf(soft, firm)
    )
}
