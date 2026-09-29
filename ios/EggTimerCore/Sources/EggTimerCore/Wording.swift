import Foundation
import EggTimerCopy

/// Which catalogue key each part of the screen says, from the facts of the
/// cook: src/core/wording.ts, against `fixtures/wording.json`. The app renders
/// the keys and fills in its own arguments; the CHOICE of key is here, so the
/// two apps cannot choose differently. The app project has no test target, so
/// this is the only way its choices get tested.

// MARK: - The refusal

/// The refusal's sentence, or nil when there is nothing worth saying. The app
/// adds `limit` and, for `refusal.harderThanPan`, `water`. A yolk too soft for
/// the white is blamed on the cooling the cook chose.
public func refusalKey(_ v: Verdict, cooling: Cooling) -> CopyRef? {
    guard v.worthSaying else { return nil }
    switch v.kind {
    case .none: return nil
    case .whiteNeverSets: return CopyRef("refusal.whiteNeverSets")
    case .harderThanPanReaches: return CopyRef("refusal.harderThanPan")
    case .unlikelySoft, .unlikelyHard:
        return CopyRef(
            v.kind == .unlikelySoft ? "refusal.unlikelySoft" : "refusal.unlikelyHard",
            ["hits": (reachOdds * 10).rounded(), "of": 10]
        )
    case .tooSoftForWhite:
        switch cooling {
        case .counter: return CopyRef("refusal.counter")
        case .tap: return CopyRef("refusal.tap")
        case .ice: return CopyRef("refusal.ice")
        }
    }
}

// MARK: - The outcome

/// P(just right) at or above which the yolk is "probably just right": more
/// likely than not, and nothing less.
public let directionLikely = 0.5

/// The catalogue key of the direction sentence.
public func directionKey(_ o: Outcome) -> String {
    if o.pJustRight >= directionLikely {
        switch o.lean {
        case .firm: return "outcome.likely.firm"
        case .soft: return "outcome.likely.soft"
        case .balanced: return "outcome.likely"
        }
    }
    switch o.lean {
    case .firm: return "outcome.miss.firm"
    case .soft: return "outcome.miss.soft"
    case .balanced: return "outcome.unsure"
    }
}

/// Whether the white gets its line.
public func whiteAtRisk(_ o: Outcome) -> Bool {
    o.pWhiteRunny >= whiteRisk
}

/// The range in the slider's words: a key and its arguments, each argument
/// itself a doneness key for the caller to render. One word when both ends are
/// nearest the same one.
public func rangeWords(_ o: Outcome) -> (key: String, args: [String: String]) {
    let low = anchorNear(o.levelLow).key
    let high = anchorNear(o.levelHigh).key
    if low == high { return ("outcome.range.one", ["level": low]) }
    return ("outcome.range", ["low": low, "high": high])
}

// MARK: - The phase

/// What the readout's words depend on. While a cook runs, every field is the
/// cook's own (its ticket), never the controls'.
public struct PhaseFacts: Sendable {
    public var phase: Phase
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    /// Idle only: whether the white sets at all, so there is a cook to start.
    public var whiteSets: Bool
    /// Idle only: whether this pan's time to boil is remembered, not guessed.
    public var boilKnown: Bool
    /// Cooling only: whether the countdown ends in a probe reading.
    public var probeWanted: Bool

    public init(
        phase: Phase, startMode: StartMode, afterBoil: HeatAfterBoil, cooling: Cooling,
        whiteSets: Bool, boilKnown: Bool, probeWanted: Bool
    ) {
        self.phase = phase
        self.startMode = startMode
        self.afterBoil = afterBoil
        self.cooling = cooling
        self.whiteSets = whiteSets
        self.boilKnown = boilKnown
        self.probeWanted = probeWanted
    }
}

/// The readout's keys in one phase. The app supplies the arguments.
public struct PhaseKeys: Sendable, Equatable {
    /// Above the clock.
    public let label: String
    /// Under the clock.
    public let subline: String
    /// The primary button, or nil when the phase has none.
    public let action: String?
    /// What the primary button (or, without one, the pan) asks of the cook, or
    /// nil when there is nothing true to add.
    public let hint: String?
}

/// Where the eggs go at the pull, as the button says it.
public func pulledKey(_ cooling: Cooling) -> String {
    switch cooling {
    case .ice: "action.pulled.ice"
    case .tap: "action.pulled.tap"
    case .counter: "action.pulled.counter"
    }
}

/// The readout's keys: `phaseKeys` in wording.ts, which says why each is.
public func phaseKeys(_ f: PhaseFacts) -> PhaseKeys {
    let cold = f.startMode == .cold
    let standing = f.afterBoil == .off
    switch f.phase {
    case .idle:
        let subline = cold
            ? (f.boilKnown ? "readout.sub.coldAssumes" : "readout.sub.coldGuesses")
            : (standing ? "readout.sub.standing" : "readout.sub.hot")
        let hint = !f.whiteSets
            ? "action.hint.whiteNeverSets"
            : cold ? "action.hint.cold" : standing ? "action.hint.hotStanding" : "action.hint.hotBoiling"
        return PhaseKeys(
            label: "readout.phase.total", subline: subline,
            action: cold ? "action.startHeating" : "action.eggsIn", hint: hint
        )
    case .heating:
        return PhaseKeys(
            label: "readout.phase.heating", subline: "readout.sub.heating", action: "action.fullBoil",
            hint: standing ? "action.hint.heatingStanding" : "action.hint.heating"
        )
    case .cooking:
        return PhaseKeys(
            label: standing ? "readout.phase.cookingHeatOff" : "readout.phase.cookingBoiling",
            subline: cold ? "readout.sub.cookingCold" : "readout.sub.cookingHot", action: nil,
            hint: standing ? "action.hint.cookingStanding" : "action.hint.cookingBoiling"
        )
    case .pull:
        // On a counter rest nothing starts on its own: the grace runs out into
        // done, and the subline already says the yolk is still cooking.
        return PhaseKeys(
            label: "readout.phase.pull", subline: "readout.sub.pull", action: pulledKey(f.cooling),
            hint: f.cooling == .counter ? nil : "action.hint.pull"
        )
    case .cooling:
        return PhaseKeys(
            label: f.cooling == .ice ? "readout.phase.coolingIce" : "readout.phase.coolingTap",
            subline: f.probeWanted ? "readout.sub.coolingProbe" : "readout.sub.coolingPeak",
            action: nil, hint: nil
        )
    case .done:
        return PhaseKeys(
            label: "readout.phase.done", subline: cold ? "readout.sub.doneCold" : "readout.sub.doneHot",
            action: "action.startAgain", hint: nil
        )
    }
}

// MARK: - The sentence

/// One clause of the setup sentence: its words in the sentence, the name of
/// the control it opens, and that control's value. A nil `value` is the
/// argument itself (the egg's mass, or the cook's own temperature). The app
/// supplies `mass`, `temp` and `bath`.
public struct ClauseKeys: Sendable, Equatable {
    public let text: String
    public let label: String
    public let value: String?
}

public enum Clause: String, Sendable, CaseIterable, Identifiable {
    case egg, from, start, cooling
    public var id: String { rawValue }
}

/// What the setup sentence's clauses depend on.
public struct ClauseFacts: Sendable {
    public var eggFrom: EggFrom
    public var startMode: StartMode
    public var sousVide: Bool
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling

    public init(eggFrom: EggFrom, startMode: StartMode, sousVide: Bool, afterBoil: HeatAfterBoil, cooling: Cooling) {
        self.eggFrom = eggFrom
        self.startMode = startMode
        self.sousVide = sousVide
        self.afterBoil = afterBoil
        self.cooling = cooling
    }
}

/// The setup sentence's keys. The start clause carries the boil, and the
/// standing when the heat goes off: "into cold water" alone reads as if the
/// eggs never boil.
public func clauseKeys(_ f: ClauseFacts) -> [Clause: ClauseKeys] {
    let standing = f.afterBoil == .off
    let from: ClauseKeys = switch f.eggFrom {
    case .fridge: ClauseKeys(text: "setup.from.fridge", label: "controls.eggFrom", value: "controls.eggFrom.fridge")
    case .room: ClauseKeys(text: "setup.from.room", label: "controls.eggFrom", value: "controls.eggFrom.room")
    case .custom: ClauseKeys(text: "setup.from.custom", label: "controls.eggFrom", value: nil)
    }
    let start: ClauseKeys = if f.sousVide {
        ClauseKeys(text: "setup.start.sous", label: "controls.start", value: "controls.start.sousVide")
    } else if f.startMode == .cold {
        ClauseKeys(
            text: standing ? "setup.start.coldStanding" : "setup.start.cold",
            label: "controls.start", value: "controls.start.cold"
        )
    } else {
        ClauseKeys(
            text: standing ? "setup.start.hotStanding" : "setup.start.hot",
            label: "controls.start", value: "controls.start.hot"
        )
    }
    let cooling: ClauseKeys = switch f.cooling {
    case .ice: ClauseKeys(text: "setup.cooling.ice", label: "controls.cooling", value: "controls.cooling.ice")
    case .tap: ClauseKeys(text: "setup.cooling.tap", label: "controls.cooling", value: "controls.cooling.tap")
    case .counter:
        ClauseKeys(text: "setup.cooling.counter", label: "controls.cooling", value: "controls.cooling.counter")
    }
    return [
        .egg: ClauseKeys(text: "setup.egg", label: "controls.egg", value: nil),
        .from: from,
        .start: start,
        .cooling: cooling,
    ]
}
