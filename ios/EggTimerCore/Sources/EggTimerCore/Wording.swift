import Foundation
import EggTimerCopy

/// The twin of `src/core/wording.ts`, held to it by `fixtures/wording.json`;
/// the TypeScript's comments say what each part is for.

/// A key in a core value's JSON is spelled as the catalogue spells it, as the
/// TypeScript's is.
extension CopyKey: Codable {}

// MARK: - The refusal

public func refusalKey(_ v: Verdict, cooling: Cooling) -> CopyRef? {
    guard v.worthSaying else { return nil }
    switch v.kind {
    case .none: return nil
    case .whiteNeverSets: return CopyRef(.`refusal.whiteNeverSets`)
    case .harderThanPanReaches: return CopyRef(.`refusal.harderThanPan`)
    case .tooSoftForWhite:
        switch cooling {
        case .counter, .eggCup: return CopyRef(.`refusal.counter`)
        case .tap: return CopyRef(.`refusal.tap`)
        case .bowl: return CopyRef(.`refusal.bowl`)
        case .ice: return CopyRef(.`refusal.ice`)
        }
    }
}

public func warningKey(_ v: Verdict, lowOdds: Bool, cooling: Cooling) -> CopyRef? {
    if let refusal = refusalKey(v, cooling: cooling) { return refusal }
    guard lowOdds else { return nil }
    return CopyRef(.`warn.wildGuess`)
}

// MARK: - The certainty

public func certaintyKey(_ c: Certainty) -> CopyKey {
    switch c {
    case .veryCertain: return .`certainty.veryCertain`
    case .ballpark: return .`certainty.ballpark`
    case .wildGuess: return .`certainty.wildGuess`
    }
}

public struct WordsRef: Sendable, Equatable {
    public let key: CopyKey
    public let args: [String: Double]
    public let words: [String: CopyKey]
}

public struct TimeRangeWords: Sendable, Equatable {
    public let key: CopyKey
    public let lowS: Double
    public let highS: Double
    public let ofDay: Bool
}

public func timeRangeWords(_ sure: CertaintyReading, startedAtS: Double?, cookTimeS: Double) -> TimeRangeWords {
    let r = sure.time
    guard let start = startedAtS else {
        return TimeRangeWords(key: .`certainty.time`, lowS: r.lowS, highS: r.highS, ofDay: false)
    }
    if cookTimeS == sure.atS {
        return TimeRangeWords(key: .`certainty.timeOut`, lowS: start + r.lowS, highS: start + r.highS, ofDay: true)
    }
    let now = start + cookTimeS
    return TimeRangeWords(
        key: .`certainty.timeOut`, lowS: now + (r.lowS - sure.atS), highS: now + (r.highS - sure.atS), ofDay: true
    )
}

public func intervalWords(_ w: WordCertainty) -> WordsRef {
    let args: [String: Double] = ["hits": (certaintyMass * 10).rounded(), "of": 10]
    if w.from == w.to {
        return WordsRef(key: .`certainty.interval.one`, args: args, words: ["word": donenessAnchors[w.from].key])
    }
    return WordsRef(
        key: .`certainty.interval`, args: args,
        words: ["from": donenessAnchors[w.from].key, "to": donenessAnchors[w.to].key]
    )
}

public func mostLikelyWords(_ w: WordCertainty) -> WordsRef {
    WordsRef(key: .`certainty.mostLikely`, args: [:], words: ["word": donenessAnchors[w.mostLikely].key])
}

public func mostLikelyShown(_ w: WordCertainty) -> Bool {
    w.mostLikely != w.asked
}

public func mostLikelyOpened(_ w: WordCertainty) -> Bool {
    !mostLikelyShown(w) && w.from != w.to
}

// MARK: - The outcome

public func whiteAtRisk(_ o: Outcome) -> Bool {
    o.pWhiteRunny >= whiteRisk
}

public func forecastWhiteAtRisk(_ f: Forecast) -> Bool {
    f.white[0] >= whiteRisk
}

public func rangeWords(_ w: WordCertainty) -> (key: CopyKey, args: [String: CopyKey]) {
    let low = donenessAnchors[w.from].key
    if w.from == w.to { return (.`outcome.range.one`, ["level": low]) }
    return (.`outcome.range`, ["low": low, "high": donenessAnchors[w.to].key])
}

// MARK: - The phase

public struct PhaseFacts: Sendable {
    public var phase: Phase
    public var startMode: StartMode
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    public var whiteSets: Bool
    public var boilKnown: Bool
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

public struct PhaseKeys: Sendable, Equatable {
    public let label: CopyKey
    public let subline: CopyKey
    public let action: CopyKey?
    public let hint: CopyKey?
}

public func pulledKey(_ cooling: Cooling) -> CopyKey {
    switch cooling {
    case .ice: .`action.pulled.ice`
    case .tap: .`action.pulled.tap`
    case .bowl: .`action.pulled.bowl`
    case .counter, .eggCup: .`action.pulled.counter`
    }
}

public func phaseKeys(_ f: PhaseFacts) -> PhaseKeys {
    let cold = f.startMode == .cold
    let standing = f.afterBoil == .off
    switch f.phase {
    case .idle:
        let subline: CopyKey = cold ? .`readout.sub.coldAssumes` : (standing ? .`readout.sub.standing` : .`readout.sub.hot`)
        let hint: CopyKey = !f.whiteSets
            ? .`action.hint.whiteNeverSets`
            : cold ? .`action.hint.cold` : standing ? .`action.hint.hotStanding` : .`action.hint.hotBoiling`
        return PhaseKeys(
            label: .`readout.phase.total`, subline: subline,
            action: cold ? .`action.startHeating` : .`action.eggsIn`, hint: hint
        )
    case .heating:
        return PhaseKeys(
            label: .`readout.phase.heating`, subline: .`readout.sub.heating`, action: .`action.fullBoil`,
            hint: standing ? .`action.hint.heatingStanding` : .`action.hint.heating`
        )
    case .cooking:
        return PhaseKeys(
            label: standing ? .`readout.phase.cookingHeatOff` : .`readout.phase.cookingBoiling`,
            subline: cold ? .`readout.sub.cookingCold` : .`readout.sub.cookingHot`, action: nil,
            hint: standing ? .`action.hint.cookingStanding` : .`action.hint.cookingBoiling`
        )
    case .pull:
        return PhaseKeys(
            label: .`readout.phase.pull`, subline: .`readout.sub.pull`, action: pulledKey(f.cooling),
            hint: restsInAir(f.cooling) ? nil : .`action.hint.pull`
        )
    case .cooling:
        return PhaseKeys(
            label: f.cooling == .ice ? .`readout.phase.coolingIce`
                : f.cooling == .bowl ? .`readout.phase.coolingBowl` : .`readout.phase.coolingTap`,
            subline: f.probeWanted ? .`readout.sub.coolingProbe` : .`readout.sub.coolingPeak`,
            action: nil, hint: nil
        )
    case .done:
        return PhaseKeys(
            label: .`readout.phase.done`, subline: cold ? .`readout.sub.doneCold` : .`readout.sub.doneHot`,
            action: .`action.startAgain`, hint: nil
        )
    }
}

// MARK: - The sentence

public struct ClauseKeys: Sendable, Equatable {
    public let text: CopyKey
    public let label: CopyKey
    public let value: CopyKey?
}

public enum Clause: String, Sendable, CaseIterable, Identifiable {
    case egg, from, start, cooling
    public var id: String { rawValue }
}

public struct ClauseFacts: Sendable {
    public var eggFrom: EggFrom
    public var startMode: StartMode
    public var sousVide: Bool
    public var afterBoil: HeatAfterBoil
    public var cooling: Cooling
    public var coolingWaterGiven: Bool

    public init(
        eggFrom: EggFrom, startMode: StartMode, sousVide: Bool, afterBoil: HeatAfterBoil, cooling: Cooling,
        coolingWaterGiven: Bool = false
    ) {
        self.eggFrom = eggFrom
        self.startMode = startMode
        self.sousVide = sousVide
        self.afterBoil = afterBoil
        self.cooling = cooling
        self.coolingWaterGiven = coolingWaterGiven
    }
}

public func clauseKeys(_ f: ClauseFacts) -> [Clause: ClauseKeys] {
    let standing = f.afterBoil == .off
    let from: ClauseKeys = switch f.eggFrom {
    case .fridge: ClauseKeys(text: .`setup.from.fridge`, label: .`controls.eggFrom`, value: .`controls.eggFrom.fridge`)
    case .room: ClauseKeys(text: .`setup.from.room`, label: .`controls.eggFrom`, value: .`controls.eggFrom.room`)
    case .custom: ClauseKeys(text: .`setup.from.custom`, label: .`controls.eggFrom`, value: nil)
    }
    let start: ClauseKeys = if f.sousVide {
        ClauseKeys(text: .`setup.start.sous`, label: .`controls.start`, value: .`controls.start.sousVide`)
    } else if f.startMode == .cold {
        ClauseKeys(
            text: standing ? .`setup.start.coldStanding` : .`setup.start.cold`,
            label: .`controls.start`, value: .`controls.start.cold`
        )
    } else {
        ClauseKeys(
            text: standing ? .`setup.start.hotStanding` : .`setup.start.hot`,
            label: .`controls.start`, value: .`controls.start.hot`
        )
    }
    let cooling: ClauseKeys = switch f.cooling {
    case .ice: ClauseKeys(text: .`setup.cooling.ice`, label: .`controls.cooling`, value: .`controls.cooling.ice`)
    case .tap:
        ClauseKeys(
            text: f.coolingWaterGiven ? .`setup.cooling.tapAt` : .`setup.cooling.tap`,
            label: .`controls.cooling`, value: .`controls.cooling.tap`
        )
    case .bowl:
        ClauseKeys(
            text: f.coolingWaterGiven ? .`setup.cooling.bowlAt` : .`setup.cooling.bowl`,
            label: .`controls.cooling`, value: .`controls.cooling.bowl`
        )
    case .counter, .eggCup:
        ClauseKeys(text: .`setup.cooling.counter`, label: .`controls.cooling`, value: .`controls.cooling.counter`)
    }
    return [
        .egg: ClauseKeys(text: .`setup.egg`, label: .`controls.egg`, value: nil),
        .from: from,
        .start: start,
        .cooling: cooling,
    ]
}

// MARK: - The sous-vide clock's units

public func longDuration(_ seconds: Double) -> CopyRef {
    let minutes = Int((seconds / 60.0).rounded())
    if minutes < 90 { return CopyRef(.`duration.minutes`, ["minutes": Double(minutes)]) }
    let hours = minutes / 60
    let rest = minutes % 60
    if hours < 48 {
        return rest == 0
            ? CopyRef(.`duration.hours`, ["hours": Double(hours)])
            : CopyRef(.`duration.hoursMinutes`, ["hours": Double(hours), "minutes": Double(rest)])
    }
    let days = Int((Double(hours) / 24.0).rounded())
    if days < 14 { return CopyRef(.`duration.days`, ["days": Double(days)]) }
    return CopyRef(.`duration.weeks`, ["weeks": (Double(days) / 7.0).rounded()])
}

public func startPhrase(daysAgo: Int) -> CopyRef {
    if daysAgo <= 0 { return CopyRef(.`sousvide.start.today`) }
    if daysAgo == 1 { return CopyRef(.`sousvide.start.yesterday`) }
    if daysAgo < 7 { return CopyRef(.`sousvide.start.lastWeekday`) }
    if daysAgo < 14 { return CopyRef(.`sousvide.start.lastWeek`) }
    if daysAgo < 60 { return CopyRef(.`sousvide.start.weeksAgo`, ["weeks": (Double(daysAgo) / 7.0).rounded()]) }
    return CopyRef(.`sousvide.start.monthsAgo`, ["months": (Double(daysAgo) / 30.0).rounded()])
}

let weekdayKeys: [CopyKey] = [
    .`weekday.sunday`, .`weekday.monday`, .`weekday.tuesday`, .`weekday.wednesday`,
    .`weekday.thursday`, .`weekday.friday`, .`weekday.saturday`,
]

public func weekdayKey(_ dayOfWeek: Int) -> CopyKey {
    weekdayKeys[((dayOfWeek % 7) + 7) % 7]
}
