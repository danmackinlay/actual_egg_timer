import XCTest
import EggTimerApp
import EggTimerCore

// The screen's layout at the largest text size, in 1750, where the most
// wraps: read from where its parts are as XCUITest finds them, each a moment
// the app has settled at, idle and in every phase.

/// The parts of the screen whose place is read: the action's row of buttons
/// (its top), the slider (its heading's top), the sentence and the egg.
private enum Part: String, CaseIterable {
    case action, slider, sentence, egg
}

/// The parts under the action, which its buttons coming and going never move.
private let below: [Part] = [.slider, .sentence, .egg]

/// The main button's identifiers, one a phase (PhaseActions).
private let mains = ["action.eggsIn", "action.boil", "action.out", "action.startAgain"]

private typealias Layout = [Part: Double]

/// The largest text size, in 1750, where the action's row stacks.
private let largest = [
    "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL", "-uiLanguage", "en-x-1750",
]

/// A clause pressed: how the page scrolled to its panel (`reveal`), and
/// where the panel is once the page has settled.
private struct Pressed {
    let scroll: String
    let panel: CGRect
}

extension Run {
    /// Where each part of the screen sits now, pt from the window's top.
    fileprivate func layout() -> Layout {
        var out: Layout = [:]
        out[.action] = (mains + ["action.cancel"]).compactMap { self.frame($0).map { Double($0.minY) } }.min()
        out[.slider] = frame("doneness.heading").map { Double($0.minY) }
        out[.sentence] = frame("sentence").map { Double($0.minY) }
        out[.egg] = frame("egg").map { Double($0.minY) }
        return out
    }

    /// The layout once the app has caught up with the moment it stands at
    /// and drawn the screen.
    fileprivate func stillLayout() throws -> Layout {
        try tick()
        return layout()
    }

    /// Press a clause and wait until the app has settled: what the page did.
    fileprivate func opened(_ clause: String) throws -> Pressed {
        let from = try lines().count
        try tapClause(clause)
        try tick()
        let scroll = try lines().dropFirst(from).compactMap { l -> String? in
            if case let .reveal(_, scroll) = l.event { scroll } else { nil }
        }.last ?? "no reveal"
        // Where the page's scroll to the panel, animated, has left it.
        guard let panel = stillFrame("panel.\(clause)") else { throw Stop("the \(clause)'s panel never opened") }
        return Pressed(scroll: scroll, panel: panel)
    }
}

/// A number that may be none, as a message's arithmetic takes it.
private func num(_ x: Double?) -> Double { x ?? .nan }

extension Scenarios {
    /// at the largest text size, in 1750, where the action's row stacks: one layout from idle to Done, the action above the slider and nothing below it moving in any phase
    func test_one_layout_largest() {
        scenario { run in
            let actionAbove = { (l: Layout, when: String) in
                run.check(num(l[.action]) < num(l[.slider]),
                          "\(when): the action not above the slider: action \(num(l[.action])), slider \(num(l[.slider]))")
            }
            // What is under the action as far under its top as at idle.
            var moved: [String] = []
            try run.idle(largest)
            let before = try run.stillLayout()
            let still = { (l: Layout, when: String) in
                for part in below {
                    let was = num(before[part]) - num(before[.action])
                    let now = num(l[part]) - num(l[.action])
                    if !near(now, was, 2) { moved.append("\(part.rawValue) \(was) -> \(now) pt under the action, \(when)") }
                }
            }
            for part in Part.allCases { run.check(before[part] != nil, "idle: no \(part.rawValue)") }
            actionAbove(before, "idle")
            // Start a second on.
            var i = try run.step(run.t0 + 1)
            try run.tap("action.eggsIn")
            let heating = try run.until("phase HEATING", from: i, phaseIs("HEATING"))
            try run.settled(heating.i)
            still(try run.stillLayout(), "heating")
            // Boiled at 5:00 from the start, out 3 s into the pull, and on to
            // Done: the slider, the sentence and the egg never anywhere else.
            run.t0 += 1
            let plan = try run.boiled()
            still(try run.stillLayout(), "cooking")
            i = try run.step(plan.pull + 1)
            try run.settled(try run.until("phase PULL", from: i, phaseIs("PULL")).i)
            still(try run.stillLayout(), "at the pull")
            i = try run.step(plan.pull + 3)
            try run.tap("action.out")
            let cooling = try run.until("phase COOLING", from: i, phaseIs("COOLING"))
            try run.settled(cooling.i)
            still(try run.stillLayout(), "cooling")
            i = try run.step(try planIn(try run.lines()).cooledAt() + 1)
            try run.settled(try run.until("phase DONE", from: i, phaseIs("DONE")).i)
            let done = try run.stillLayout()
            still(done, "at Done")
            for part in Part.allCases { run.check(done[part] != nil, "Done: no \(part.rawValue)") }
            actionAbove(done, "Done")
            run.check(moved.isEmpty, "moved under the action: \(moved.prefix(6).joined(separator: "; "))")
            let phases = try run.lines().compactMap(\.event.phase).filter { $0 != "IDLE" }
            run.check(phases == ["HEATING", "COOKING", "PULL", "COOLING", "DONE"], "phases \(phases)")
            run.note("action \(num(before[.action])), slider \(num(before[.slider])), sentence \(num(before[.sentence])), egg \(num(before[.egg])) pt, idle to Done")
        }
    }

    /// at the largest text size, in 1750, idle: "Most likely" comes and goes under the certainty word without moving the slider (UI.md 8); the start's panel, taller than the screen, comes up with its head at the top (UI.md 5)
    func test_idle_largest() {
        scenario { run in
            // The level dragged from one where "Most likely" shows under the
            // certainty word to one where it does not and back, a word asked
            // very certain to a ballpark: the slider never moves (UI.md
            // section 8, "Nothing jumps"). On a fresh install 0.5 and 0.8 show
            // it, 0.6 and 0.9 do not. Where the bracket's heavy stretch lies
            // is the app's tests' (ScreenTests).
            try run.idle(largest + settingsArg(["doneness": 0.6]))
            // Scrolled to where a finger can reach the slider, below the
            // fold; from there the page stays put.
            let slider = try run.find("doneness")
            try run.reveal(slider)
            let first = try run.stillLayout()
            var seen: [(level: Double, value: String, likely: Bool, slider: Double?)] = []
            for level in [0.5, 0.6, 0.8, 0.9] {
                let from = try run.lines().count
                slider.adjust(toNormalizedSliderPosition: level)
                try run.until("decided at \(level)", from: from) {
                    if case let .answer(_, decided, odds) = $0 { decided && odds } else { false }
                }
                let l = try run.stillLayout()
                seen.append((level, slider.value as? String ?? "?", run.element("readout.likely").exists, l[.slider]))
            }
            run.check(seen.contains { $0.likely } && seen.contains { !$0.likely },
                      "\"Most likely\" never came and went: \(seen.map { "\($0.level) \($0.likely)" }.joined(separator: ", "))")
            for s in seen {
                run.check(near(s.slider, first[.slider], 0.5),
                          "the slider moved at \(s.level) (likely \(s.likely)): \(num(first[.slider])) -> \(num(s.slider))")
            }

            // The start's panel, taller than the screen: pressed, the page
            // scrolls to its head, at the top.
            let tall = try run.opened("start")
            let t = run.screen()
            let px = "\(tall.panel.minY)-\(tall.panel.maxY) on a screen \(t.top)-\(t.foot)"
            run.check(tall.panel.height > t.foot - t.top, "the start's panel fits the screen: \(px)")
            run.check(tall.scroll == "top" && near(tall.panel.minY, t.top, 2), "taller than the screen, scrolled \(tall.scroll): \(px)")
            run.note("slider \(num(first[.slider])) pt; " + seen.map {
                "\($0.level) (\($0.value)) \($0.likely ? "likely" : "-") \(num($0.slider))"
            }.joined(separator: ", ") + "; the start's panel -> \(px)")
        }
    }
}
