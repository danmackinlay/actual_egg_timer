import XCTest
import EggTimerApp
import EggTimerCore

extension Scenarios {
    /// alarms refused: killed before the pull; relaunched past it: the pull not rung, out at the grace's end, the cooling’s end rung on screen by the app
    func test_asleep() {
        scenario { run in
            // Refused, so the app rings itself, and no alarm of the system's
            // is held: one sounding would crash a simulator's SpringBoard,
            // and what one does while the app is gone only a phone shows.
            let refused = ["-noAlarmPrompt", "YES"]
            try run.started(refused)
            let was = try run.boiled()
            run.terminate()
            let after = try run.relaunched(at: was.pull + 60, refused)
            let written: Bool = if case let .restore(phase, eventsWritten) = after.restore.event {
                phase == "COOLING" && eventsWritten
            } else { false }
            run.check(written, "\(after.restore.event)")
            let cook = lastStored(after.lines)??.cook
            let plan = try planIn(after.lines)
            run.check(cook?.events.pulled?.by == .timeout, "pulled by \(String(describing: cook?.events.pulled?.by))")
            run.check(near(cook?.events.pulled?.outS, plan.pull + 20, exact), "out at the grace's end")
            run.check(pending(after.lines) == [], "pending \(String(describing: pending(after.lines)))")
            let i = try run.step(try plan.cooledAt() + 1)
            try run.settled(try run.until("phase DONE", from: i, phaseIs("DONE")).i)
            // The pull came while the app was away, and nobody heard it; the
            // cooling's end comes on screen, and the app rings it.
            let rung = try run.sinceLaunch().compactMap(\.event.ring)
            run.check(rung == ["cooled"], "rung \(rung), not the cooling's end alone")
        }
    }

    /// a change in hand when the app leaves the screen is committed; two changes are two commits
    func test_change_kept_on_hide() {
        scenario { run in
            let settings = StoreRegistry.settings.key
            try run.started(settingsArg(hotSettings))
            var i = try run.step(run.t0 + 30)
            // The slider dragged to 0.3; the change stays in hand on the
            // frozen clock, which never reaches its settle.
            let slider = try run.find("doneness")
            slider.adjust(toNormalizedSliderPosition: 0.3)
            try run.until("the change in hand", from: i) { $0 == .edit(group: "level") }
            // Another app over it, as the app switcher or a call would.
            XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
            let c = try run.until("committed on leaving", from: i, timeoutS: 15) {
                $0 == .editCommitted(fields: ["level"], start: nil)
            }
            let stored = try run.until("the cook stored", from: c.i) { ($0.stored ?? nil) != nil }
            let level = (stored.event.stored ?? nil)?.cook.choices.level ?? .nan
            run.check(near(level, 0.3, 0.03), "stored at \(level), not near 0.3")
            // The next cook's setting, written to the store as the app says;
            // then in its file, which the system writes when it will, so
            // waited for in full.
            try run.until("the setting written", from: c.i) { if case .wrote(settings, _, _) = $0 { true } else { false } }
            run.terminate()
            let doneness = { (p: [String: Any]) in (p[settings] as? [String: Any])?["doneness"] as? Double }
            let prefs = try run.prefs { doneness($0) == level }
            run.check(doneness(prefs) == level, "the setting in the file: \(String(describing: doneness(prefs))) for \(level)")
            let r = try run.relaunched(at: run.t0 + 40)
            run.check(lastStored(r.lines)??.cook.choices.level == level, "relaunched with the change")
            // The egg's size chosen in its clause's choice, then the start's
            // clause pressed, which commits it, and the water's − there: two
            // commits, the second at its settle.
            i = try run.step(run.t0 + 50)
            try run.tapClause("egg")
            try run.tap("mass.size")
            // The menu's choices, a list over the page: the fourth size.
            let size = run.app.collectionViews.firstMatch.buttons.element(boundBy: 3)
            guard size.waitForExistence(timeout: Env.waitS) else { throw Stop("the size's menu never opened") }
            size.tap()
            try run.tapClause("start")
            try run.press("waterLitres.stepper", up: false)
            let first = try run.until("the first change committed", from: i) {
                if case .editCommitted = $0 { true } else { false }
            }
            // The second settles on the cook's clock, which stands until it
            // is stepped.
            try run.step(run.t0 + 52)
            let second = try run.until("the second change committed", from: first.i + 1) {
                if case .editCommitted = $0 { true } else { false }
            }
            run.check(first.event == .editCommitted(fields: ["mass"], start: nil)
                && second.event == .editCommitted(fields: ["waterLitres"], start: nil),
                      "two commits: \(first.event), \(second.event)")
            run.note("the slider let go and the app left: committed, stored and written; size then water: two commits")
        }
    }
}
