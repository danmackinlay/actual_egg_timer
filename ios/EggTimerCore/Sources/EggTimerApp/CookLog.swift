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

    /// A plan taken (`now`, the cook on screen after `event` stepped `was`,
    /// with `effects`): any step but a tick that decided nothing, which keeps
    /// the plan it had.
    static func plan(_ now: CookState, effects: [CooksEffect], was: CookState, event: CookEvent) {
        guard DebugLog.logging, now.cook != nil, let next = now.plan else { return }
        if case .tick = event, was.plan != nil, effects.isEmpty, now.cook == was.cook { return }
        DebugLog.log(.plan(
            pull: next.deadlines.cookEndS, cooled: next.deadlines.coolEndS, lengthened: guessLengthened(next),
            surface: next.decided != nil, next: next.slowHobAtS, asking: asksIfStillIn(next), overdue: next.overdue
        ))
    }
}
