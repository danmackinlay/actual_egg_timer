import Testing
@testable import EggTimerApp
import EggTimerCore

/// The in-app alarm's decision: ring once per deadline, only while the app is
/// on screen, whether or not a notification holds the deadline.
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
                phase: phase(now, cooled: cooled), nowS: now, pullS: pullS, cooledS: cooled, rung: rung,
                onScreenSinceS: onScreenSinceS
            ) {
                rung.insert(d)
                rang.append((d, now))
            }
            now += 0.25
        }
        return rang
    }

    @Test("On screen, rings once at the pull and once when the cooling ends, notifications or not: silent mode mutes theirs")
    func onScreenRingsOncePerDeadline() {
        let rang = run()
        #expect(rang.map(\.0) == [.pull, .cooled])
        #expect(rang[0].1 == pullS)
        #expect(rang[1].1 == cooledS)
    }

    @Test("A counter rest has only the pull")
    func counterRestRingsOnlyThePull() {
        #expect(run(cooled: nil).map(\.0) == [.pull])
    }

    @Test("Never while the app is in the background")
    func backgroundNeverRings() {
        #expect(run(onScreenSinceS: nil).isEmpty)
    }

    @Test("A deadline that passed before the app came on screen is not rung")
    func openingTheAppIsAnswer() {
        // Opened during PULL: the pull went by unheard; the cooling still rings.
        let rang = run(onScreenSinceS: 405, from: 405)
        #expect(rang.map(\.0) == [.cooled])
        // Opened after both.
        #expect(run(onScreenSinceS: 600, from: 600).isEmpty)
    }

    @Test("Nothing rings before its deadline, or outside PULL and DONE")
    func quietPhases() {
        for p in [Phase.idle, .heating, .cooking, .cooling] {
            #expect(deadlineToRing(
                phase: p, nowS: 1000, pullS: pullS, cooledS: cooledS, rung: [],
                onScreenSinceS: 0
            ) == nil)
        }
        // A phase that says PULL a moment early - the caller's clock and the
        // deadline's disagreeing - still waits for the deadline.
        #expect(deadlineToRing(
            phase: .pull, nowS: pullS - 0.1, pullS: pullS, cooledS: cooledS, rung: [],
            onScreenSinceS: 0
        ) == nil)
    }

    @Test("Already rung is never rung again")
    func rungIsFinal() {
        #expect(deadlineToRing(
            phase: .pull, nowS: pullS + 1, pullS: pullS, cooledS: cooledS, rung: [.pull],
            onScreenSinceS: 0
        ) == nil)
        #expect(deadlineToRing(
            phase: .done, nowS: cooledS + 1, pullS: pullS, cooledS: cooledS, rung: [.cooled],
            onScreenSinceS: 0
        ) == nil)
    }
}
