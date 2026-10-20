import XCTest
import EggTimerApp
import EggTimerCore

// The sentence's clauses pressed as a finger would (`tapClause`), and their
// panels: where the page scrolls to them, and the corrections made in them
// while a cook runs.

/// A clause pressed: how the page scrolled to its panel (`reveal`), where the
/// panel is once the page has settled, and how far the sentence and the egg
/// beside it moved with the page.
private struct Pressed {
    let scroll: String
    let panel: CGRect
    let sentenceMoved: Double
    let eggMoved: Double
}

extension Run {
    /// Press a clause and wait until the app has settled: what the page did.
    fileprivate func opened(_ clause: String, _ when: String) throws -> Pressed {
        let sentence = frame("sentence")?.minY ?? .nan
        let egg = frame("egg")?.minY ?? .nan
        let from = try lines().count
        try tapClause(clause)
        try tick()
        let scroll = try lines().dropFirst(from).compactMap { l -> String? in
            if case let .reveal(_, scroll) = l.event { scroll } else { nil }
        }.last ?? "no reveal"
        // Where the page's scroll to the panel, animated, has left it.
        guard let panel = stillFrame("panel.\(clause)") else { throw Stop("\(when): the panel never opened") }
        return Pressed(
            scroll: scroll, panel: panel, sentenceMoved: (frame("sentence")?.minY ?? .nan) - sentence,
            eggMoved: (frame("egg")?.minY ?? .nan) - egg
        )
    }
}

extension Scenarios {
    /// UI.md 5: a clause pressed scrolls just far enough to show its panel: the egg's at idle, under the fold, up to its foot at the screen's, and the start's pressed from it; the egg's again from that, on screen, scrolls nothing; the sentence moves only with the page; a panel a launch argument opens scrolls nothing; at the largest text size the start's, taller than the screen, comes up with its head at the top
    func test_panel_in_view() {
        scenario { run in
            let px = { (r: CGRect) in
                let s = run.screen()
                return "\(r.minY)-\(r.maxY) on a screen \(s.top)-\(s.foot)"
            }
            // Below the fold, a panel that fits comes up just far enough: its
            // foot at the screen's.
            let upToFoot = { (p: Pressed, when: String) in
                let s = run.screen()
                run.check(p.scroll == "bottom", "\(when): scrolled \(p.scroll), not to its foot")
                run.check(near(p.panel.maxY, s.foot, 2) && p.panel.minY >= s.top,
                          "\(when): not scrolled just far enough: \(px(p.panel))")
            }
            try run.idle()
            let egg = try run.opened("egg", "the egg's")
            upToFoot(egg, "the egg's")
            // Only the page moved: the sentence with the egg beside it.
            run.check(egg.sentenceMoved < -0.5 && near(egg.sentenceMoved, egg.eggMoved, 0.5),
                      "the sentence moved \(egg.sentenceMoved) pt, the page \(egg.eggMoved): something moved on the page")
            // Another clause pressed from it is opened too.
            let start = try run.opened("start", "the start's from the egg's")
            upToFoot(start, "the start's from the egg's")
            // The egg's again, shorter, where the start's was: on screen, so
            // no scroll of its own (the page grown shorter may still take
            // some back).
            let again = try run.opened("egg", "the egg's again")
            let s = run.screen()
            run.check(again.scroll == "none", "the egg's again, on screen, scrolled \(again.scroll)")
            run.check(again.panel.minY >= s.top && again.panel.maxY <= s.foot + 0.5,
                      "the egg's again not on screen: \(px(again.panel))")
            run.terminate()

            // Opened by a launch argument: no scroll, the panel left under
            // the fold.
            try run.idle(["-uiScreen", "clause-start"])
            try run.tick()
            run.check(!(try run.sinceLaunch()).contains { if case .reveal = $0.event { true } else { false } },
                      "a panel a launch argument opened was scrolled to")
            guard let own = run.frame("panel.start") else { throw Stop("the launch argument's panel never opened") }
            run.check(own.maxY > s.foot + 0.5, "opened by a launch argument, the panel on screen: \(px(own))")
            run.terminate()

            // Taller than the screen: its head at the top.
            try run.idle(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
            let tall = try run.opened("start", "the start's at the largest text size")
            let t = run.screen()
            run.check(tall.panel.height > t.foot - t.top, "at the largest text size the start's panel fits the screen: \(px(tall.panel))")
            run.check(tall.scroll == "top" && near(tall.panel.minY, t.top, 2), "taller than the screen, scrolled \(tall.scroll): \(px(tall.panel))")
            run.note("the egg's -> \(px(egg.panel)); the start's -> \(px(start.panel)); the egg's again \(px(again.panel)); a launch argument's \(px(own)); the largest text's -> \(px(tall.panel))")
        }
    }

    /// the cold tap's temperature while a cold cook heats: one commit of the tap's group, a later pull, and the record's pan at it
    func test_tap_water_mid_cook() {
        scenario { run in
            try run.started()
            let pull0 = try planIn(try run.lines()).pull
            let i = try run.step(run.t0 + 60)
            try run.tapClause("start")
            let field = try run.find("tapWater.field")
            try run.reveal(field)
            field.tap()
            field.typeText("8")
            // The change settles on the cook's clock, which stands until it is
            // stepped.
            try run.step(run.t0 + 62)
            let c = try run.until("the tap committed", from: i) { if case .editCommitted = $0 { true } else { false } }
            run.check(c.event == .editCommitted(fields: ["tapWater"], start: nil), "one commit, of the tap: \(c.event)")
            try run.until("the cook stored with the tap", from: c.i) { ($0.stored ?? nil)?.cook.choices.tapWaterC == 8 }
            try run.settled(c.i)
            let pull1 = try planIn(try run.lines()).pull
            run.check(pull1 > pull0, String(format: "a colder pan, a later pull: %.1f s", pull1 - pull0))
            let done = try run.toDone()
            try run.step(try done.cooledAt() + 5)
            let from = try run.lines().count
            try run.tap("answer.yolk.jammy")
            let logged = try run.until("the egg logged", from: from) { if case let .log(count, _, _) = $0 { count >= 1 } else { false } }
            guard case let .log(_, _, last) = logged.event else { throw Stop("no log") }
            struct Record: Decodable { struct Setup: Decodable { let panStart_C: Double? }; let setup: Setup? }
            let pan = last?.decoded(as: Record.self)?.setup?.panStart_C
            run.check(pan == 8, "the record's pan: \(String(describing: pan))")
            run.note(String(format: "tap 15 assumed → 8 at +60 s: the pull %.1f s later; recorded panStart_C %@", pull1 - pull0, pan.map { "\($0)" } ?? "none"))
        }
    }

    /// the start's panel opened mid-cook by a real tap and scrolled to: the water in the pan pressed, the heat turned off after the boil, the room that brings pressed; each one commit, the cook stored with all three
    func test_start_panel_mid_cook() {
        scenario { run in
            let cook = try run.started()
            let water0 = cook.cook.choices.waterLitres
            let pull0 = try planIn(try run.lines()).pull
            // Heating, a minute in: the start's choice opened by its clause.
            var i = try run.step(run.t0 + 60)
            try run.tapClause("start")
            try run.press("waterLitres.stepper")
            try run.step(run.t0 + 62)
            let water = try run.until("the water committed", from: i) { if case .editCommitted = $0 { true } else { false } }
            run.check(water.event == .editCommitted(fields: ["waterLitres"], start: nil), "one commit, of the water: \(water.event)")
            try run.settled(water.i)
            let pull1 = try planIn(try run.lines()).pull
            // The heat off after the boil, and the room it cools toward.
            i = try run.step(run.t0 + 70)
            let heat = try run.find("afterBoil.choice")
            try run.reveal(heat)
            heat.buttons.element(boundBy: 1).tap()
            try run.step(run.t0 + 72)
            let off = try run.until("the heat committed", from: i) { if case .editCommitted = $0 { true } else { false } }
            run.check(off.event == .editCommitted(fields: ["afterBoil"], start: nil), "one commit, of the heat: \(off.event)")
            try run.settled(off.i)
            i = try run.step(run.t0 + 80)
            try run.press("room.stepper")
            try run.step(run.t0 + 82)
            let room = try run.until("the room committed", from: i) { if case .editCommitted = $0 { true } else { false } }
            run.check(room.event == .editCommitted(fields: ["room"], start: nil), "one commit, of the room: \(room.event)")
            try run.settled(room.i)
            let stored = try storedIn(try run.lines()).cook.choices
            run.check(stored.waterLitres > water0, "the water stored: \(stored.waterLitres) for \(water0)")
            run.check(stored.afterBoil == .off, "the heat stored: \(stored.afterBoil)")
            run.check(stored.roomC != nil, "the room stored: \(String(describing: stored.roomC))")
            run.note(String(format: "water %.1f → %.1f L: the pull %.1f s later; heat off; room %@", water0,
                            stored.waterLitres, pull1 - pull0, stored.roomC.map { "\($0) °C" } ?? "none"))
        }
    }
}
