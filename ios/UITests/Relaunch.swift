import XCTest
import EggTimerApp
import EggTimerCore

extension Scenarios {
    /// relaunched while heating, then while cooking: the same deadlines, alarms and card, the boil kept to the bit
    func test_relaunch_heating_cooking() {
        scenario { run in
            let start = try run.started().cook.startedAtS
            try run.step(start + 120)
            var was = try planIn(try run.lines())
            run.terminate()
            var r = try run.relaunched(at: start + 120)
            run.check(r.restore.event.restoredPhase == "HEATING", "\(r.restore.event)")
            let deadlines = { (now: Plan, was: Plan) in
                run.check(
                    near(now.pull, was.pull, replan) && near(now.cooled, was.cooled, replan),
                    "deadlines \(now.pull), \(String(describing: now.cooled)) for \(was.pull), \(String(describing: was.cooled))"
                )
            }
            deadlines(r.plan, was)
            run.check(near(scheduled(r.lines)["cook.pull"], try planIn(r.lines).pull, exact), "the pull scheduled again, at the plan’s time")
            run.check(pending(r.lines) == ["cook.cool", "cook.pull"], "pending \(String(describing: pending(r.lines)))")
            run.check(r.lines.contains {
                if case let .activity(what, stage, _, _, _) = $0.event { what == "start" && stage == "heating" } else { false }
            }, "the card again")
            was = try run.boiled()
            let boil = try storedIn(try run.lines()).cook.events.boilAtS
            run.check(boil == start + 300, "boiled at \(plus(boil, start))")
            try run.step(start + 360)
            run.terminate()
            r = try run.relaunched(at: start + 360)
            run.check(r.restore.event.restoredPhase == "COOKING", "\(r.restore.event)")
            deadlines(r.plan, was)
            run.check(lastStored(r.lines)??.cook.events.boilAtS == boil, "the boil kept to the bit")
            run.check(pending(r.lines) == ["cook.cool", "cook.pull"], "pending \(String(describing: pending(r.lines)))")
        }
    }

    /// into the pull on screen, its notification pending: rung by the app; killed 4 s in, relaunched 14 s in: not rung again, out after
    func test_relaunch_pull() {
        scenario { run in
            try run.started()
            let was = try run.boiled()
            run.terminate()
            // Again half a minute before the pull, and on into it.
            let r = try run.relaunched(at: was.pull - 30)
            run.check(r.restore.event.restoredPhase == "COOKING", "\(r.restore.event)")
            var i = try run.step(was.pull + 1)
            try run.until("phase PULL", from: i, phaseIs("PULL"))
            try run.step(was.pull + 4)
            // On screen the app rings, though a notification holds the pull:
            // silent mode mutes a notification's sound, not the app's ring.
            let rung = try run.sinceLaunch().compactMap(\.event.ring)
            run.check(rung == ["pull"], "rung \(rung), not the pull once")
            run.terminate()
            let again = try run.relaunched(at: was.pull + 14)
            run.check(again.restore.event.restoredPhase == "PULL", "\(again.restore.event)")
            let plan = try planIn(again.lines)
            run.check(near(plan.pull, was.pull, replan), "the pull \(plan.pull) for \(was.pull)")
            i = try run.step(plan.pull + 15)
            try run.tap("action.out")
            try run.until("phase COOLING", from: i, phaseIs("COOLING"))
            let after = try run.sinceLaunch()
            let out = try storedIn(after).cook.events.pulled
            run.check(out?.by == .cook, "pulled by \(String(describing: out?.by))")
            let into = (out?.outS ?? .nan) - (out?.dueS ?? .nan)
            run.check(near(into, 15, exact), "out \(into) s into the pull")
            run.check(!after.contains { $0.event.ring == "pull" }, "the pull not rung again")
            run.note(String(format: "relaunched %.3f s into the pull", was.pull + 14 - plan.pull))
        }
    }

    /// relaunched while cooling: the same end, one alarm left, the card again; at Done: Done again, nothing pending, no card, nothing rung
    func test_relaunch_cooling_done() {
        scenario { run in
            try run.started()
            try run.boiled()
            let was = try run.toCooling(after: 3)
            guard let out = try storedIn(try run.lines()).cook.events.pulled?.outS else { throw Stop("no out stored") }
            let at = out + 60
            try run.step(at)
            run.terminate()
            var r = try run.relaunched(at: at)
            run.check(r.restore.event.restoredPhase == "COOLING", "\(r.restore.event)")
            run.check(near(r.plan.cooled, was.cooled, replan), "the cooling's end \(String(describing: r.plan.cooled)) for \(String(describing: was.cooled))")
            run.check(pending(r.lines) == ["cook.cool"], "pending \(String(describing: pending(r.lines)))")
            run.check(r.lines.contains {
                if case let .activity(what, stage, _, _, _) = $0.event { what == "start" && stage == "cooling" } else { false }
            }, "the card again")
            let cooled = try was.cooledAt()
            let i = try run.step(cooled + 1)
            try run.settled(try run.until("phase DONE", from: i, phaseIs("DONE")).i)
            try run.step(cooled + 30)
            run.terminate()
            r = try run.relaunched(at: cooled + 30)
            run.check(r.restore.event.restoredPhase == "DONE", "\(r.restore.event)")
            run.check(near(r.plan.cooled, was.cooled, replan), "the cooling's end \(String(describing: r.plan.cooled)) for \(String(describing: was.cooled))")
            run.check(pending(r.lines) == [], "pending \(String(describing: pending(r.lines)))")
            run.check(!r.lines.contains {
                if case let .activity(what, _, _, _, _) = $0.event { what == "start" } else { false }
            }, "no card started")
            // A minute on at Done, and four ticks there, each caught up with:
            // nothing rings.
            try run.step(cooled + 90)
            for _ in 1..<4 { try run.tick() }
            run.check(!(try run.sinceLaunch()).contains { $0.event.ring != nil }, "nothing rung again")
        }
    }

    /// the notifications as the system holds them: a cold cook's two pending at its plan's moments; relaunched past the guess, the pending pull moved to it; cancelled, none at the next launch
    func test_alarms() {
        scenario { run in
            let start = try run.started().cook.startedAtS
            let plan = try planIn(try run.lines())
            let at = scheduled(try run.lines())
            run.check(near(at["cook.pull"], plan.pull, exact) && near(at["cook.cool"], plan.cooled, exact),
                      "alarms \(at) for the plan \(plan.pull), \(String(describing: plan.cooled))")
            let first = pending(try run.lines())
            run.check(first == ["cook.cool", "cook.pull"], "pending \(String(describing: first))")
            run.terminate()
            let r = try run.relaunched(at: start + 652)
            let was = at["cook.pull"] ?? .nan
            run.check(r.restore.event.restoredPhase == "HEATING" && r.plan.lengthened && r.plan.pull > was + 30,
                      "\(r.restore.event): the pull at \(plus(r.plan.pull, start)) for \(plus(was, start))")
            run.check(near(scheduled(r.lines)["cook.pull"], try planIn(r.lines).pull, exact), "the pending pull is the restored plan's")
            run.check(pending(r.lines) == ["cook.cool", "cook.pull"], "pending \(String(describing: pending(r.lines)))")
            let i = try run.step(start + 660)
            try run.tap("action.cancel")
            try run.until("the alarms cancelled", from: i) { $0 == .alarmsCancelled }
            try run.until("the cook cleared", from: i) { $0 == .stored(value: nil) }
            run.terminate()
            try run.launch()
            // The launch's own read-back, three seconds on (AppModel.appear).
            try run.until("the alarms read back", from: run.launched) { if case .delivered = $0 { true } else { false } }
            let next = pending(try run.sinceLaunch())
            run.check(next == [], "pending at the next launch \(String(describing: next))")
        }
    }
}
