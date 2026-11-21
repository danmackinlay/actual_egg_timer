import EggTimerCore

// When the iOS app sounds an alarm itself: at each deadline that comes while
// it is on screen and no alarm of the system's holds.
//
// The alarms are AlarmKit's (`App/Alarm.swift`), which sound through silent
// mode and any Focus, and alert over the app when it is on screen too. So the
// app rings only a deadline the system holds no alarm for, and one deadline
// never rings twice. With alarms refused, unanswered or not set, the screen
// says "keep the app open", and this is what makes that advice true. In the
// background the system's alarm is all there is.
//
// The app's own, not core's: the web app has no alarms of the system's, so it rings at
// every deadline and has nothing to decide, and there is nothing for the two
// apps to agree on. Pure, and takes the clock, as `phaseAt` does, so that
// `swift test` drives it (RingTests).

/// Which deadline the app should ring for at this instant, or nil.
///
/// The caller (`CookAlarms.ring`) asks when core's step says a deadline
/// rings, which it says once, so it passes no `rung`.
///
/// - Parameters:
///   - phase: the cook's phase now, with the cook's tap out of PULL applied.
///   - nowS: the time, s.
///   - pullS: the pull deadline, s.
///   - cooledS: the end of the counted cooling, s; nil when the egg rests on
///     the counter and there is no cooling to count.
///   - rung: the deadlines already rung for this cook.
///   - held: the deadlines the system holds an alarm for, read back at the
///     deadline, scheduled or sounding: the system rings those.
///   - onScreenSinceS: when the app last came on screen, s; nil while it is in
///     the background. A deadline that passed before that is not rung: the
///     cook who opens the app is looking at the screen that says it, and a
///     sound nobody could have heard in time is not an alarm.
func deadlineToRing(
    phase: Phase,
    nowS: Double,
    pullS: Double,
    cooledS: Double?,
    rung: Set<RingDeadline>,
    held: Set<RingDeadline>,
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

    guard nowS >= atS, atS >= onScreenSinceS, !rung.contains(deadline), !held.contains(deadline) else { return nil }
    return deadline
}
