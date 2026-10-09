import Foundation

/// The doneness slider: its grid, the labelled position nearest a level,
/// which words can still be chosen, the yolk temperature a level asks for,
/// and the verdict on a level the pan cannot deliver - which refusal applies
/// and where the slider must move to. Transliterated from
/// `src/core/slider.ts`, and held to it by `fixtures/slider.json`. Which words
/// a screen says about it is `Wording.swift`.
///
/// Pure, like the rest of this package: no UserDefaults, no SwiftUI, no clock.

// MARK: - The slider

/// Positions per unit of slider travel. A snapped level always lands where the
/// thumb can sit.
public let sliderSteps = 100.0

/// Round a level onto the slider's grid, away from the unreachable side. The
/// nudge keeps a level already on the grid from being pushed a whole step by
/// floating-point noise.
public func snapUp(_ level: Double) -> Double {
    clamp((level * sliderSteps - 1e-9).rounded(.up) / sliderSteps, to: Limits.doneness)
}

public func snapDown(_ level: Double) -> Double {
    clamp((level * sliderSteps + 1e-9).rounded(.down) / sliderSteps, to: Limits.doneness)
}

/// The labelled position nearest a slider level. An exact tie goes to the
/// softer anchor, because the table is walked in order and only a strictly
/// smaller gap displaces the incumbent. Stated rather than left implicit: it
/// decides which refusal sentence a cook reads, so both ports must agree.
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

/// Whether the word of the anchor at `index` names any position the slider
/// can rest on between `softest` and `hardest`: the positions from
/// `snapUp(softest)` to `snapDown(hardest)`, each read as `anchorNear` reads
/// it. A word is struck through on the track only when it names none of
/// them. Not `anchor.level < softest`: after a runny white the softest
/// level is a little above 0, still Runny, and Runny can still be chosen.
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

/// Peak yolk temperature the slider is asking for, interpolated between the
/// anchors. The dose scale is logarithmic precisely so that this is linear in
/// temperature, so a straight interpolation is right - and it costs nothing,
/// which lets the reading track the finger while the real solve catches up.
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

/// Why a requested doneness was refused, if it was.
///
///  - `tooSoftForWhite`      even the shortest cook that sets the white already
///                           overshoots the yolk. Snap UP.
///  - `harderThanPanReaches` the heat is off and the pan runs out before the
///                           yolk gets there. Snap DOWN.
///  - `whiteNeverSets`       the water falls past what the white needs while the
///                           egg is still in it. Nothing on the slider is on
///                           offer, so there is nowhere to snap to.
///
/// A level the pan can deliver is never refused, however low its odds: those
/// are warned of instead (`lowOddsAt`, Reach.swift; DECISIONS.md 83).
public enum RefusalKind: String, Sendable {
    case none
    case tooSoftForWhite
    case harderThanPanReaches
    case whiteNeverSets
}

public struct Verdict: Sendable {
    public let kind: RefusalKind
    /// The anchor the user asked for.
    public let wanted: DonenessAnchor
    /// The nearest anchor this pan can actually deliver - the softest for
    /// `tooSoftForWhite`, the hardest for `harderThanPanReaches`. Equal to
    /// `wanted` when there is nothing to say.
    public let limit: DonenessAnchor
    /// Where the slider must move to, or nil to leave it alone.
    public let snapTo: Double?
    /// False when the gap is real but too small to be worth a sentence: a
    /// sliver of unreachable track that rounds to the same label the user asked
    /// for. Only explain a refusal someone can actually taste.
    public let worthSaying: Bool
}

/// Read a Solution as a decision about the slider. Deliberately does NOT
/// re-solve: the caller decides whether the snapped position is worth a second
/// solve, because mid-cook it is not - the egg is already in the water.
public func verdictFor(_ sol: Solution, level: Double) -> Verdict {
    let wanted = anchorNear(level)

    if sol.reachable {
        return Verdict(kind: .none, wanted: wanted, limit: wanted, snapTo: nil, worthSaying: false)
    }

    if !sol.whiteSets {
        // Nothing to snap to: the slider has no reachable position at all. The
        // numbers shown are the furthest this pan goes, which is the only
        // honest thing left to put on screen - and it is always worth saying.
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
