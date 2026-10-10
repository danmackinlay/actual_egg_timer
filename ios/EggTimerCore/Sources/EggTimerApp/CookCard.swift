import Foundation
import EggTimerCore
import EggTimerShared

/// A cook's card on the Lock Screen (`Services.card`, a Live Activity), as
/// the cook hands it on: started once the alarms are asked for, pushed only
/// when what it shows changes, ended at Done, once, and when the cook leaves
/// the screen. The calls reach the card in the order made. Its dates are the
/// system's (`AppClock.real`), so the system counts it down on its own.
@MainActor
final class CookCard {
    /// What the card was last given, and whether it has been ended at Done.
    private var pushed: CookActivity.ContentState?
    private var finished = false
    /// The cook a start was asked for, until it leaves the screen.
    private var startedFor: Double?
    /// The last call; each waits for it.
    private var calls: Task<Void, Never>?

    /// The card for `cook`, as it stands at `now`: none for a cook already
    /// Done.
    func start(_ cook: RunningCook, _ plan: CookPlan, atS now: Double) async {
        guard phaseAt(plan.deadlines, nowS: now) != .done, let s = Self.state(cook, plan, atS: now) else { return }
        Self.log("start", s)
        startedFor = cook.idMs
        await call { await $0.start(CookActivity(lang: cook.lang), state: s) }.value
        guard startedFor == cook.idMs else { return }
        pushed = s
    }

    /// What the card shows of `cook` at `now`, pushed if it changed; at
    /// Done, the card ended, once.
    func push(_ cook: RunningCook?, _ plan: CookPlan?, atS now: Double) {
        guard let cook, let plan else { return }
        if phaseAt(plan.deadlines, nowS: now) == .done {
            guard !finished else { return }
            finished = true
            Screenshots.log(.activityEnd)
            endAll()
            return
        }
        guard let s = Self.state(cook, plan, atS: now), s != pushed else { return }
        pushed = s
        Self.log("update", s)
        call { await $0.update(s) }
    }

    func endAll() { call { await $0.endAll() } }

    /// Every card ended to go at its own end: an earlier build's.
    func endAtTheirEnds() { call { await $0.endAtTheirEnds() } }

    /// The cook gone from the screen: its card ended, and the next cook's
    /// started afresh.
    func reset() {
        pushed = nil
        finished = false
        startedFor = nil
        endAll()
    }

    /// A call to the card, made once every earlier one has been.
    @discardableResult
    private func call(_ f: @escaping @Sendable (any LockScreenCard) async -> Void) -> Task<Void, Never> {
        let card = Services.card
        let previous = calls
        let next = Task {
            await previous?.value
            await f(card)
        }
        calls = next
        return next
    }

    /// What the Lock Screen shows, its dates on the system's clock.
    private static func state(_ cook: RunningCook, _ plan: CookPlan, atS now: Double) -> CookActivity.ContentState? {
        guard var s = cardState(cook, plan, atS: now) else { return nil }
        s.began = AppClock.real(s.began)
        s.ends = AppClock.real(s.ends)
        return s
    }

    /// The card's state in cook time.
    private static func cardState(
        _ running: RunningCook, _ plan: CookPlan, atS now: Double
    ) -> CookActivity.ContentState? {
        let at = { (s: Double) in Date(timeIntervalSince1970: s) }
        let d = plan.deadlines
        let cook = description(running, plan)
        let phase = phaseAt(d, nowS: now)
        // While the plan asks whether the eggs are still in the water: the
        // pull, "now", until it is answered or the cook is too old.
        if asksIfStillIn(plan), phase != .idle {
            return .init(stage: .pull, began: at(d.cookEndS), ends: at(plan.tooOldAtS), provisional: false, cook: cook)
        }
        switch phase {
        case .idle, .done:
            return nil
        case .heating where guessLengthened(plan):
            // The time heated, counting up to when the guess gives out.
            return .init(
                stage: .heating, began: at(running.startedAtS), ends: at(plan.tooOldAtS), provisional: true,
                countsUp: true, cook: cook
            )
        case .heating:
            return .init(stage: .heating, began: at(running.startedAtS), ends: at(d.cookEndS), provisional: true, cook: cook)
        case .cooking:
            return .init(stage: .cooking, began: at(running.startedAtS), ends: at(d.cookEndS), provisional: false, cook: cook)
        case .pull:
            return .init(
                stage: .pull, began: at(d.cookEndS), ends: at(d.cookEndS + pullGraceSeconds), provisional: false, cook: cook
            )
        case .cooling:
            let from = running.events.pulled?.outS ?? d.cookEndS + pullGraceSeconds
            return .init(stage: .cooling, began: at(from), ends: at(d.coolEndS ?? from), provisional: false, cook: cook)
        }
    }

    /// The card's description of this cook, as it ran once the egg is out.
    private static func description(_ cook: RunningCook, _ plan: CookPlan) -> CookActivity.Description {
        let ran = asRanShown(cook, plan: plan)
        return CookActivity.Description(
            doneness: tr(anchorNear(ran?.level ?? plan.answer.level).key, in: cook.lang),
            peakYolk: showIn(cook.units, .temperature, ran?.peakYolkC ?? plan.solution.result.peakYolkC),
            eggMass: showIn(cook.units, .mass, plan.egg.massKg * 1000),
            cooling: cook.choices.cooling.rawValue
        )
    }

    /// A card pushed, to the debug log.
    private static func log(_ what: String, _ s: CookActivity.ContentState) {
        Screenshots.log(.activity(
            what: what, stage: s.stage.rawValue, ends: Int(AppClock.fromReal(s.ends).timeIntervalSince1970.rounded()),
            up: s.countsUp, cook: [s.cook.doneness, s.cook.peakYolk, s.cook.eggMass, s.cook.cooling]
        ))
    }
}
