import XCTest
import EggTimerApp
import EggTimerCore

/// How long the system is given to deliver the one notification a scenario
/// waits for, past its moment, the host's s.
private let deliverySlackS = 15.0

/// The app's clock face for a span, s (Presentation.swift `clockString`).
private func clockOf(_ s: Double) -> String {
    let total = Int(max(0, s).rounded())
    return String(format: "%d:%02d", total / 60, total % 60)
}

/// A frame of the readout as the debug log has it (`frame`): the moment it
/// was drawn for, its phase, what it drew, and its line's index.
private struct Frame {
    let at: Double
    let phase: String
    let big: String
    let sub: String
    let range: String?
    let i: Int
}

private func frames(_ lines: [Line], from: Int = 0) -> [Frame] {
    lines.dropFirst(from).compactMap { l in
        guard case let .frame(at, phase, big, sub, range) = l.event else { return nil }
        return Frame(at: at, phase: phase, big: big, sub: sub, range: range, i: l.i)
    }
}

/// Whether a heating frame is all of its one moment: the countdown to the
/// plan in force when it was drawn and the time heated under it both read
/// at the moment it was drawn for. What it got wrong, or nil.
private func frameWrong(_ f: Frame, _ lines: [Line], _ start: Double) throws -> String? {
    let plan = try planIn(Array(lines[..<f.i]))
    let big = clockOf(plan.pull - f.at)
    let heated = clockOf(f.at - start)
    if f.big != big { return "at \(plus(f.at, start)) the time \(f.big), not \(big)" }
    // The time heated and the words after it, a no-break space or a space.
    if !f.sub.hasPrefix("\(heated) ") && !f.sub.hasPrefix("\(heated)\u{a0}") {
        return "at \(plus(f.at, start)) \"\(f.sub)\", not \(heated) heated"
    }
    return nil
}

/// The English the catalogue gives a key (copy/en.json), read from the repo.
func english(_ key: String) throws -> String {
    let data = try Data(contentsOf: Env.repo.appendingPathComponent("copy/en.json"))
    guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let messages = o["messages"] as? [String: Any], let entry = messages[key] as? [String: Any],
          let text = entry["text"] as? String else { throw Stop("copy/en.json has no \(key)") }
    return text
}

extension Scenarios {
    /// an egg cup counted down from the out to its opening: the alarm and the card at the opening, the readout counting to it, Done there
    func test_eggcup_opening() {
        scenario { run in
            var over = hotSettings
            over["cooling"] = "eggCup"
            over["doneness"] = 0.22
            try run.started(settingsArg(over))
            let was = try run.toCooling(after: 3)
            guard let out = try storedIn(try run.lines()).cook.events.pulled?.outS else { throw Stop("no out stored") }
            let opening = try was.cooledAt()
            run.check(near(opening, out + 120, exact), String(format: "the opening at +%.3f s from the out, not 120", opening - out))
            let alarm = scheduled(try run.lines())["cook.cool"]
            run.check(near(alarm, opening, exact), "the opening's alarm \(String(describing: alarm)) for \(opening)")
            run.check(try run.lines().contains {
                if case let .activity(_, stage, ends, _, _) = $0.event { stage == "opening" && near(Double(ends), opening, 1) } else { false }
            }, "the card counting to the opening")
            try run.step(opening - 60)
            let phase = try run.lines().last { $0.event.phase != nil }?.event.phase
            let big = try run.find("readout.time").label
            let sub = try run.find("readout.sub").label
            let want = try english("readout.sub.coolingEggCup")
            run.check(phase == "COOLING" && big == "1:00" && sub == want,
                      "a minute before the opening: \(String(describing: phase)), \(big), \(sub)")
            let j = try run.step(opening + 1)
            try run.settled(try run.until("phase DONE at the opening", from: j, phaseIs("DONE")).i)
        }
    }

    /// killed before the pull, its notification delivered; relaunched past it: the pull not rung, the cooling’s end rung on screen
    func test_asleep() {
        scenario { run in
            try run.started()
            let was = try run.boiled()
            run.terminate()
            // The one span on the system's clock, and the one wait for the
            // system: launched 20 s of cook before the pull at ×1, so the
            // restore schedules the pull at most 20 s ahead; killed; the
            // notification left to the system, with `deliverySlackS` for it
            // to arrive.
            let lead = 20.0
            let r = try run.relaunched(at: was.pull - lead, speed: 1)
            let seen = Date()
            run.check(r.restore.event.restoredPhase == "COOKING", "\(r.restore.event)")
            run.check(scheduled(r.lines)["cook.pull"] != nil, "the pull scheduled")
            run.terminate()
            pause(max(0, lead + deliverySlackS - Date().timeIntervalSince(seen)))
            let after = try run.relaunched(at: was.pull + 60)
            let written: Bool = if case let .restore(phase, eventsWritten) = after.restore.event {
                phase == "COOLING" && eventsWritten
            } else { false }
            run.check(written, "\(after.restore.event)")
            let cook = lastStored(after.lines)??.cook
            let plan = try planIn(after.lines)
            run.check(cook?.events.pulled?.by == .timeout, "pulled by \(String(describing: cook?.events.pulled?.by))")
            run.check(near(cook?.events.pulled?.outS, plan.pull + 20, exact), "out at the grace's end")
            run.check(delivered(after.lines) == ["cook.pull"], "delivered \(String(describing: delivered(after.lines)))")
            run.check(pending(after.lines) == ["cook.cool"], "pending \(String(describing: pending(after.lines)))")
            let i = try run.step(try plan.cooledAt() + 1)
            try run.settled(try run.until("phase DONE", from: i, phaseIs("DONE")).i)
            // The pull came while the app was away, and its notification
            // rang; the cooling's end comes on screen, and the app rings it too.
            let rung = try run.sinceLaunch().compactMap(\.event.ring)
            run.check(rung == ["cooled"], "rung \(rung), not the cooling's end alone")
        }
    }

    /// relaunched three hours on: ended, its alarms and card gone (2.2)
    func test_too_old() {
        scenario { run in
            try run.started()
            run.terminate()
            try run.launch([], LaunchOptions(at: run.t0 + 3 * 3600))
            let restore = try run.until("the restore", from: run.launched) { $0.isRestore }
            // The launch's own read-back, three seconds on (AppModel.appear).
            try run.until("the launch’s read-back", from: restore.i) { if case .delivered = $0 { true } else { false } }
            let lines = try run.sinceLaunch()
            run.check(lines.contains { $0.event == .restoreTooOld }, "dropped as too old")
            run.check(lines.contains { $0.event == .alarmsCancelled }, "its alarms cancelled")
            run.check(pending(lines) == [], "pending \(String(describing: pending(lines)))")
            run.check(!lines.contains {
                if case let .activitySeen(when, _, _, _) = $0.event { when == "launch+3s" } else { false }
            }, "its card ended")
            run.check(!lines.contains { $0.event.phase != nil }, "idle")
            let prefs = try run.prefs { $0[StoreRegistry.cook.key] == nil }
            run.check(prefs[StoreRegistry.cook.key] == nil, "nothing stored")
        }
    }

    /// the keys no build reads, 0.3's log and an earlier build's cook among them, are deleted at launch; its alarms left
    func test_sweep() {
        scenario { run in
            let cook = StoreRegistry.cook.key
            try run.started()
            run.terminate()
            _ = try run.prefs { ($0[cook] as? [String: Any])?["cook"] != nil }
            // What 0.3 and 0.4 wrote: this build's cook stands in for theirs,
            // under their key, with the same alarm ids pending (a day out, on
            // a frozen clock: still pending however long the plist takes).
            let old = [
                "calibration.v4": "{\"v\":4,\"log\":[]}", "calibration.v4.unread": "[]", "cookInProgress.v2": "{}",
                "cookInProgress.unread": "[]", "share.v1": "{}", "probeAsked": "1", "coldStart": "1",
                "newestVersion": "0.5.0", "newestBuild": "3",
            ]
            try run.editPlist(rename: (cook, "cookInProgress"), old)
            let keys = Array(old.keys) + ["cookInProgress"]
            try run.launch()
            let swept = try run.until("the old cook swept", from: run.launched) {
                if case .swept("cookInProgress") = $0 { true } else { false }
            }
            try run.until("the alarms read back", from: swept.i) { if case .delivered = $0 { true } else { false } }
            let lines = try run.sinceLaunch()
            let sweptKeys = Set(lines.compactMap { l -> String? in if case .swept(let k) = l.event { k } else { nil } })
            run.check(keys.allSatisfy { sweptKeys.contains($0) }, "each swept: \(keys.filter { !sweptKeys.contains($0) })")
            run.check(!lines.contains { $0.event == .alarmsCancelled }, "its alarms not cancelled")
            run.check(pending(lines) == ["cook.cool", "cook.pull"], "pending \(String(describing: pending(lines)))")
            run.check(!lines.contains {
                ["HEATING", "COOKING", "PULL", "COOLING", "DONE"].contains($0.event.restoredPhase ?? "")
            }, "idle")
            let prefs = try run.prefs { p in keys.allSatisfy { p[$0] == nil } }
            run.check(keys.allSatisfy { prefs[$0] == nil }, "gone: \(keys.filter { prefs[$0] != nil })")
            let calibration = prefs[StoreRegistry.calibration.key] as? [String: Any]
            run.check((calibration?["v"] as? Int) == StoreRegistry.calibration.format, "this build's log kept")
            run.note("\(keys.count) swept, the old cook's alarms left")
        }
    }

    /// each frame of the readout reads one moment, the TimelineView's: stepped across a second, and run fast
    func test_one_moment() {
        scenario { run in
            let stored = try run.started()
            let start = stored.cook.startedAtS
            run.check(stored.cook.choices.startMode == .cold, "a cold start: \(stored.cook.choices.startMode)")
            // Frozen either side of where each line's second turns: the time
            // heated at 100.5 s, and the countdown where the pull is a half
            // second off.
            let pull = try planIn(try run.lines()).pull
            let turn = pull - (pull - start - 200).rounded(.down) - 0.5
            for at in [start + 100.499, start + 100.501, turn - 0.001, turn + 0.001] {
                let i = try run.step(at)
                let f = try run.until("a frame at \(plus(at, start))", from: i) {
                    if case let .frame(drawn, _, _, _, _) = $0 { String(format: "%.3f", drawn) == String(format: "%.3f", at) } else { false }
                }
                let lines = try run.lines()
                guard let frame = frames(lines, from: f.i).first else { throw Stop("no frame") }
                run.check(frame.phase == "HEATING", "\(f.event)")
                let wrong = try frameWrong(frame, lines, start)
                run.check(wrong == nil, wrong ?? "")
            }
            // Running at ×60 from launch, so the screen redraws ten times a
            // second, each frame six seconds of cook time on: a frame that
            // read the clock again while it was drawn would be off by
            // whatever the draw took, times sixty.
            run.terminate()
            let r = try run.relaunched(at: start + 120, speed: 60)
            let from = r.restore.i
            let end = Date().addingTimeInterval(Env.waitS)
            while frames(try run.lines(), from: from).filter({ $0.phase == "HEATING" }).count < 20, Date() < end {
                pause(0.1)
            }
            let lines = try run.lines()
            run.terminate()
            let lengthened = { (f: Frame) in (try? planIn(Array(lines[..<f.i])))?.lengthened ?? true }
            let ran = frames(lines, from: from).filter {
                $0.phase == "HEATING" && !lengthened($0)
            }
            run.check(ran.count >= 20, "\(ran.count) frames heating at ×60")
            let wrong = try ran.compactMap { try frameWrong($0, lines, start) }
            run.check(wrong.isEmpty, "\(wrong.count) of \(ran.count) frames not of one moment: \(wrong.prefix(3).joined(separator: "; "))")
            let ranges = Set(ran.map { $0.range ?? "none" })
            run.note(String(format: "%d frames at ×60, %@ to %@; ranges %@", ran.count, plus(ran.first?.at, start),
                            plus(ran.last?.at, start), ranges.sorted().joined(separator: " / ")))
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
