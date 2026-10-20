import EggTimerCore

/// What a cook writes to the debug log (`DebugLog.log`), which the
/// scripted checks read: the phase as it changes, and each plan taken.
struct CookLog {
    /// The phase last logged.
    private var phase: Phase?

    /// The phase, logged if it changed: whether it did.
    mutating func phase(_ now: Phase) -> Bool {
        guard now != phase else { return false }
        phase = now
        DebugLog.log(.phase(phase: now.rawValue))
        return true
    }

    /// A plan taken (`s`, after `event` stepped `was`): any step but a tick
    /// that decided nothing, which keeps the plan it had.
    static func plan(_ s: CookStep, was: CookState, event: CookEvent) {
        guard DebugLog.logging, let next = s.plan else { return }
        if case .tick = event, was.plan != nil, s.effects.isEmpty, s.cook == was.cook { return }
        DebugLog.log(.plan(
            pull: next.deadlines.cookEndS, cooled: next.deadlines.coolEndS, lengthened: guessLengthened(next),
            surface: next.decided != nil, next: next.slowHobAtS, asking: asksIfStillIn(next), overdue: next.overdue
        ))
    }
}

/// Whether a cook's plan as it ran waits to be made again for a correction
/// after the pull.
func asRanStale(_ cook: RunningCook) -> Bool {
    cook.events.pulled != nil && cook.asRan != nil && !asRanCurrent(cook)
}
