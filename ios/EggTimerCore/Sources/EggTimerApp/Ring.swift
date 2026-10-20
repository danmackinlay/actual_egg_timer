import EggTimerCore

// When the iOS app sounds an alarm itself: at each deadline that comes while
// it is on screen, whether or not a notification holds it.
//
// The alarm is a pair of local notifications (`App/Alarm.swift`), and a
// notification's sound, time-sensitive or not, is muted by silent mode. So on
// screen the app rings itself (`Ringer.swift`, through silent mode), and the
// notification come in the foreground is presented without its sound, so
// that one deadline never rings twice. With notifications refused, unanswered
// or not taken, the screen says "keep the app open", and this is what makes
// that advice true. In the background the notification is all there is.
//
// The app's own, not core's: the web app has no notifications, so it rings at
// every deadline and has nothing to decide, and there is nothing for the two
// apps to agree on. Pure, and takes the clock, as `phaseAt` does, so that
// `swift test` drives it (RingTests).

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
///   - rung: the deadlines already rung for this cook.
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
    return deadline
}
