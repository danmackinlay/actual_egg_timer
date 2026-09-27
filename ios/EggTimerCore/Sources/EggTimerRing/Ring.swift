import EggTimerCore

/// When the iOS app sounds an alarm itself, because the system will not.
///
/// The alarm is a pair of local notifications (`App/Alarm.swift`). When
/// permission is refused, not yet given, or the request did not take, the app
/// says "keep the app open" - and this is what makes that advice true: while
/// the app is on screen it rings at each deadline itself. When a notification
/// IS holding the deadline it rings nothing, because the notification's own
/// sound is already presented in the foreground and a second one would double
/// it.
///
/// It lives in the package rather than in the app so it can be tested
/// headlessly, as `phaseAt` is. It is not a transliteration: the web app has no
/// notifications, so it rings at every deadline (`src/ui/app.ts`, `onTick`)
/// and has nothing to decide.

/// A moment the cook is told about. The probe moment (E4) is not a third one:
/// it is the end of the counted cooling, and only its words differ.
public enum RingDeadline: String, Sendable, Hashable, CaseIterable {
    /// Out of the water, now.
    case pull
    /// The counted cooling is over - or, with a probe, the moment to read it.
    case cooled
}

/// Which deadline the app should ring for at this instant, or nil.
///
/// Pure, and takes the clock, like `phaseAt`. The caller asks on every tick and
/// rings for what comes back, then adds it to `rung`: a deadline rings once.
///
/// - Parameters:
///   - phase: the cook's phase now, with the cook's tap out of PULL applied.
///   - nowS: the time, s.
///   - pullS: the pull deadline, s.
///   - cooledS: the end of the counted cooling, s; nil when the egg rests on
///     the counter and there is no cooling to count.
///   - authorized: whether notifications are allowed; nil while that is not
///     known - the question is on screen, or was never answered.
///   - scheduled: the deadlines whose notification the system said it was
///     holding, read back rather than assumed. A notification that has been
///     delivered is no longer pending, so the caller keeps a past deadline in
///     here once it has been seen.
///   - rung: the deadlines already rung for this cook.
///   - onScreenSinceS: when the app last came on screen, s; nil while it is in
///     the background. A deadline that passed before that is not rung: the
///     cook who opens the app is looking at the screen that says it, and a
///     sound nobody could have heard in time is not an alarm.
public func deadlineToRing(
    phase: Phase,
    nowS: Double,
    pullS: Double,
    cooledS: Double?,
    authorized: Bool?,
    scheduled: Set<RingDeadline>,
    rung: Set<RingDeadline>,
    onScreenSinceS: Double?
) -> RingDeadline? {
    guard let onScreenSinceS else { return nil }

    let deadline: RingDeadline
    let atS: Double
    switch phase {
    case .pull:
        deadline = .pull
        atS = pullS
    case .done:
        // A counter rest ends at the pull, and has no moment of its own.
        guard let cooledS else { return nil }
        deadline = .cooled
        atS = cooledS
    case .idle, .heating, .cooking, .cooling:
        return nil
    }

    guard nowS >= atS, atS >= onScreenSinceS, !rung.contains(deadline) else { return nil }
    // The notification has it, and presents its own sound in the foreground.
    if authorized == true && scheduled.contains(deadline) { return nil }
    return deadline
}
