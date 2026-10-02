import Foundation

/// What the egg will be like: the predicted outcome at the chosen time
/// (INFERENCE.md section 8, "The outcome").
///
/// The odds say how often the cook will call the egg right; this says which
/// way the rest go. The three yolk answers and a runny white, as the cook
/// would give them, unrelated share included; the 10%, 50% and 90% points of
/// the delivered yolk doneness on the slider's scale, from each particle's
/// time-scale and its own egg-to-egg noise, WITHOUT the taste offset, clamped
/// to [0, 1]; and which way a miss leans, at a ratio of 1.5. The reasons are
/// in src/core/outcome.ts, which this is held to by fixtures/outcome.json.

/// How much likelier one way of missing has to be than the other before the
/// outcome leans that way: three misses in five.
public let leanRatio = 1.5

/// The quantiles the level range is read at: an 80% interval.
public let levelLowQ = 0.1
public let levelHighQ = 0.9

/// P(runny) at or above which the white is a risk: one egg in five. Both
/// apps' line for the white shows from here.
public let whiteRisk = 0.2

/// Bisection steps for each point of the level range: 2^-20 of the slider.
private let levelBisections = 20

public enum Lean: String, Sendable, Codable {
    case soft
    case firm
    case balanced
}

/// What the egg at the chosen time will be like. Codable, so a running cook
/// keeps the outcome it started with across a relaunch.
public struct Outcome: Sendable, Codable, Equatable {
    /// P(the cook answers too soft / just right / too firm) about the yolk.
    public let pTooSoft: Double
    public let pJustRight: Double
    public let pTooFirm: Double
    /// P(the cook answers runny / tender / firm) about the white. Sum to 1.
    /// The screens read only the first; a record keeps all three as the
    /// forecast made at "Eggs in" (DECISIONS.md 37).
    public let pWhiteRunny: Double
    public let pWhiteTender: Double
    public let pWhiteFirm: Double
    /// The 10%, 50% and 90% points of the delivered yolk doneness, on the
    /// slider's scale, clamped to [0, 1]. No taste offset.
    public let levelLow: Double
    public let levelMedian: Double
    public let levelHigh: Double
    /// Which way a miss is more likely.
    public let lean: Lean
}


/// Which way a miss leans, from the two ways of missing.
public func leanOf(_ pTooSoft: Double, _ pTooFirm: Double) -> Lean {
    if pTooSoft > leanRatio * pTooFirm { return .soft }
    if pTooFirm > leanRatio * pTooSoft { return .firm }
    return .balanced
}

/// The predicted outcome of pulling at `cookTimeS`, for a cook aiming at a
/// nominal yolk dose of 10^`logNominalTarget`: the decision's inputs, read at
/// the time it chose.
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

    // The share of eggs delivered at or under log dose x: the mixture's CDF.
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
        levelLow: level(levelLowQ),
        levelMedian: level(0.5),
        levelHigh: level(levelHighQ),
        lean: leanOf(soft, firm)
    )
}
