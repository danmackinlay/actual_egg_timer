import Testing
@testable import EggTimerApp
import EggTimerCore

/// The in-app alarm's decision: ring once per deadline, only while the app is
/// on screen, and never when a notification is already holding it.
///
/// Driven the way the app drives it: a tick every quarter second across a whole
/// cook, with the phase from the core's own `phaseAt`, and every deadline that
/// comes back added to `rung`.
struct RingTests {
    // A hot start with a counted cooling: in at 0, out at 400, cooled at 520.
    let pullS = 400.0
    let cooledS = 520.0

    private func phase(_ nowS: Double, cooled: Double?) -> Phase {
        phaseAt(Deadlines(cookEndS: pullS, coolEndS: cooled, provisional: false), nowS: nowS)
    }

    /// Every ring over a cook, in order, with when it happened.
    private func run(
        authorized: Bool?,
        scheduled: Set<RingDeadline>,
        cooled: Double? = 520,
        onScreenSinceS: Double? = 0,
        from: Double = 0,
        to: Double = 700
    ) -> [(RingDeadline, Double)] {
        var rung: Set<RingDeadline> = []
        var rang: [(RingDeadline, Double)] = []
        var now = from
        while now <= to {
            if let d = deadlineToRing(
                phase: phase(now, cooled: cooled), nowS: now, pullS: pullS, cooledS: cooled,
                authorized: authorized, scheduled: scheduled, rung: rung,
                onScreenSinceS: onScreenSinceS
            ) {
                rung.insert(d)
                rang.append((d, now))
            }
            now += 0.25
        }
        return rang
    }

    @Test("Refused: rings once at the pull and once when the cooling ends")
    func refusedRingsOncePerDeadline() {
        let rang = run(authorized: false, scheduled: [])
        #expect(rang.map(\.0) == [.pull, .cooled])
        #expect(rang[0].1 == pullS)
        #expect(rang[1].1 == cooledS)
    }

    @Test("Not yet answered rings, and so does a request that did not take")
    func unknownOrFailedRings() {
        #expect(run(authorized: nil, scheduled: []).map(\.0) == [.pull, .cooled])
        #expect(run(authorized: true, scheduled: []).map(\.0) == [.pull, .cooled])
    }

    @Test("Notifications holding both deadlines: the app rings nothing")
    func workingNotificationsRingNothing() {
        #expect(run(authorized: true, scheduled: [.pull, .cooled]).isEmpty)
    }

    @Test("Only the deadline the notifications missed is rung")
    func partialScheduleRingsTheGap() {
        #expect(run(authorized: true, scheduled: [.pull]).map(\.0) == [.cooled])
        #expect(run(authorized: true, scheduled: [.cooled]).map(\.0) == [.pull])
    }

    @Test("A refusal is not overridden by a stale schedule")
    func refusedWithScheduleStillRings() {
        // Permission taken away in Settings after the requests were added.
        #expect(run(authorized: false, scheduled: [.pull, .cooled]).map(\.0) == [.pull, .cooled])
    }

    @Test("A counter rest has only the pull")
    func counterRestRingsOnlyThePull() {
        #expect(run(authorized: false, scheduled: [], cooled: nil).map(\.0) == [.pull])
    }

    @Test("Never while the app is in the background")
    func backgroundNeverRings() {
        #expect(run(authorized: false, scheduled: [], onScreenSinceS: nil).isEmpty)
    }

    @Test("A deadline that passed before the app came on screen is not rung")
    func openingTheAppIsAnswer() {
        // Opened during PULL: the pull went by unheard; the cooling still rings.
        let rang = run(authorized: false, scheduled: [], onScreenSinceS: 405, from: 405)
        #expect(rang.map(\.0) == [.cooled])
        // Opened after both.
        #expect(run(authorized: false, scheduled: [], onScreenSinceS: 600, from: 600).isEmpty)
    }

    @Test("Nothing rings before its deadline, or outside PULL and DONE")
    func quietPhases() {
        for p in [Phase.idle, .heating, .cooking, .cooling] {
            #expect(deadlineToRing(
                phase: p, nowS: 1000, pullS: pullS, cooledS: cooledS, authorized: false,
                scheduled: [], rung: [], onScreenSinceS: 0
            ) == nil)
        }
        // A phase that says PULL a moment early - the caller's clock and the
        // deadline's disagreeing - still waits for the deadline.
        #expect(deadlineToRing(
            phase: .pull, nowS: pullS - 0.1, pullS: pullS, cooledS: cooledS, authorized: false,
            scheduled: [], rung: [], onScreenSinceS: 0
        ) == nil)
    }

    @Test("Already rung is never rung again")
    func rungIsFinal() {
        #expect(deadlineToRing(
            phase: .pull, nowS: pullS + 1, pullS: pullS, cooledS: cooledS, authorized: false,
            scheduled: [], rung: [.pull], onScreenSinceS: 0
        ) == nil)
        #expect(deadlineToRing(
            phase: .done, nowS: cooledS + 1, pullS: pullS, cooledS: cooledS, authorized: nil,
            scheduled: [], rung: [.cooled], onScreenSinceS: 0
        ) == nil)
    }
}
