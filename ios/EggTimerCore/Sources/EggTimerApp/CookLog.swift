import EggTimerCore

/// What a cook writes to the debug log (`Screenshots.log`), which the
/// scripted checks read: the phase as it changes, each plan taken, and the
/// record of an egg corrected after the pull or answered before it could
/// be made.
struct CookLog {
    /// The phase last logged.
    private var phase: Phase?

    /// The phase, logged if it changed: whether it did.
    mutating func phase(_ now: Phase) -> Bool {
        guard now != phase else { return false }
        phase = now
        Screenshots.log(.phase(phase: now.rawValue))
        return true
    }

    /// A plan taken (`s`, after `event` stepped `was`): any step but a tick
    /// that decided nothing, which keeps the plan it had. `shown` is the
    /// peak yolk and the level Done shows.
    static func plan(_ s: CookStep, was: CookState, event: CookEvent, shown: (peak: Double?, level: Double?)) {
        guard Screenshots.logging, let next = s.plan else { return }
        if case .tick = event, was.plan != nil, s.effects.isEmpty, s.cook == was.cook { return }
        Screenshots.log(.plan(
            pull: next.deadlines.cookEndS, cooled: next.deadlines.coolEndS, lengthened: guessLengthened(next),
            surface: next.decided != nil, next: next.slowHobAtS, asking: asksIfStillIn(next), overdue: next.overdue
        ))
        Screenshots.log(.verdict(
            kind: "\(next.answer.verdict.kind)", whiteSets: next.solution.whiteSets, cookS: next.cookTimeS
        ))
        Screenshots.log(.shown(peak: shown.peak, level: shown.level, plannedPeak: next.solution.result.peakYolkC))
    }

    /// The cook on screen stepped from `was` to `now` by `event`: its plan
    /// as it ran made again for a correction after the pull, an answer held
    /// for its record, and that record made.
    static func step(was: RunningCook?, now: RunningCook, event: CookEvent) {
        guard Screenshots.logging else { return }
        if let w = was, asRanStale(w), !asRanStale(now) { Screenshots.log(.asRanCorrected) }
        if case .answered = event, answerHeld(now) { Screenshots.log(.answerHeld) }
        if let w = was, answerHeld(w), !answerHeld(now) { Screenshots.log(.answerHeldMade) }
    }

    /// Whether an answer is in the cook's log that its record does not hold
    /// yet: held for the surface, or for the record made again.
    private static func answerHeld(_ cook: RunningCook) -> Bool {
        let answered = cook.log.lastIndex { $0.kind == "answered" } ?? -1
        let logged = cook.log.lastIndex { $0.kind == "logged" } ?? -1
        return answered > logged
    }
}

/// Whether a cook's plan as it ran waits to be made again for a correction
/// after the pull.
func asRanStale(_ cook: RunningCook) -> Bool {
    cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
}
