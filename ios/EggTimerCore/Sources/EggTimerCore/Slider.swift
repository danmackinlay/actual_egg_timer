import Foundation

/// The twin of `src/core/slider.ts`, held to it by `fixtures/slider.json`; the
/// TypeScript's comments say what each part is for.

// MARK: - The slider

public func snapUp(_ level: Double) -> Double {
    clamp((level * sliderSteps - 1e-9).rounded(.up) / sliderSteps, to: Limits.doneness)
}

public func snapDown(_ level: Double) -> Double {
    clamp((level * sliderSteps + 1e-9).rounded(.down) / sliderSteps, to: Limits.doneness)
}

public func anchorNear(_ level: Double) -> DonenessAnchor {
    var best = donenessAnchors[0]
    var bestGap = abs(best.level - level)
    for i in 1..<donenessAnchors.count {
        let gap = abs(donenessAnchors[i].level - level)
        if gap < bestGap {
            bestGap = gap
            best = donenessAnchors[i]
        }
    }
    return best
}

public func anchorReachable(_ index: Int, softest: Double, hardest: Double) -> Bool {
    let key = donenessAnchors[index].key
    let lo = Int((snapUp(softest) * sliderSteps).rounded())
    let hi = Int((snapDown(hardest) * sliderSteps).rounded())
    guard lo <= hi else { return false }
    for p in lo...hi where anchorNear(Double(p) / sliderSteps).key == key {
        return true
    }
    return false
}

public func targetPeakYolkC(_ level: Double) -> Double {
    let last = donenessAnchors.count - 1
    if level <= donenessAnchors[0].level { return donenessAnchors[0].approxPeakYolkC }
    for i in 0..<last {
        let a = donenessAnchors[i]
        let b = donenessAnchors[i + 1]
        if level <= b.level {
            let span = b.level - a.level
            guard span > 0 else { return b.approxPeakYolkC }
            let t = (level - a.level) / span
            return a.approxPeakYolkC + t * (b.approxPeakYolkC - a.approxPeakYolkC)
        }
    }
    return donenessAnchors[last].approxPeakYolkC
}

// MARK: - The verdict

public enum RefusalKind: String, Sendable, Codable {
    case none
    case tooSoftForWhite
    case harderThanPanReaches
    case whiteNeverSets
}

public struct Verdict: Sendable, Codable {
    public let kind: RefusalKind
    public let wanted: DonenessAnchor
    public let limit: DonenessAnchor
    public let snapTo: Double?
    public let worthSaying: Bool
}

public func verdictFor(_ sol: Solution, level: Double) -> Verdict {
    let wanted = anchorNear(level)

    if sol.reachable {
        return Verdict(kind: .none, wanted: wanted, limit: wanted, snapTo: nil, worthSaying: false)
    }

    if !sol.whiteSets {
        return Verdict(
            kind: .whiteNeverSets, wanted: wanted, limit: wanted, snapTo: nil, worthSaying: true
        )
    }

    if level > sol.hardestLevel {
        let limit = anchorNear(sol.hardestLevel)
        let capped = snapDown(sol.hardestLevel)
        return Verdict(
            kind: .harderThanPanReaches,
            wanted: wanted,
            limit: limit,
            snapTo: capped < level ? capped : nil,
            worthSaying: limit.key != wanted.key
        )
    }

    let limit = anchorNear(sol.softestLevel)
    let snapped = snapUp(sol.softestLevel)
    return Verdict(
        kind: .tooSoftForWhite,
        wanted: wanted,
        limit: limit,
        snapTo: snapped > level ? snapped : nil,
        worthSaying: limit.key != wanted.key
    )
}
