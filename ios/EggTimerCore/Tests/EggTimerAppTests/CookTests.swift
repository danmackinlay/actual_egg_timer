import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

/// A cook from Start to its end, through the model as the screen's buttons
/// drive it, and the cook picked up again by a relaunch: a new `AppModel`
/// on the same store, the first one killed.
extension AppTests {
    /// The app launched again on the store as the last left it: the cook
    /// picked up, and nothing under way.
    func relaunched(_ world: World) async -> AppModel {
        let model = AppModel()
        model.appear()
        await world.quiet(model.cook)
        return model
    }

    /// A cold cook to Done: the boil at 5:00, out 3 s into the pull, each
    /// phase in turn, the alarms the plan's and pending until their moments,
    /// no ring of the app's, the card ended at Done; Jammy, then Start again:
    /// one egg logged with its forecast, marked as made under a debug clock,
    /// and no cook stored.
    @Test func aColdCookToDoneAnsweredAndStartedAgain() async throws {
        let world = World()
        world.clock.alter()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = AppModel()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let start = try #require(model.cook.running).startedAtS
        await tick(at: start + 300, model, world)
        model.boil()
        await world.settled(model.cook)
        await world.ticked(model.cook)
        let pull = try pullS(model.cook)
        #expect(world.alarm.scheduled.last?.pullS == pull)
        #expect(world.alarm.pending == ["cook.pull": pull, "cook.cool": try cooledS(model.cook)])
        await tick(at: pull + 1, model, world)
        world.clock.set(pull + 3)
        model.pulledOut()
        await world.settled(model.cook)
        await world.ticked(model.cook)
        let cooled = try cooledS(model.cook)
        await tick(at: cooled + 1, model, world)
        #expect(model.cook.phase == .done)
        let events = try #require(world.stored).events
        #expect(events.boilAtS == start + 300)
        #expect(events.pulled?.by == .cook)
        #expect(events.pulled.map { abs($0.outS - $0.dueS - 3) <= 1e-6 } == true)
        #expect(events.cooledAtS != nil)
        #expect(world.alarm.delivered == ["cook.pull", "cook.cool"])
        await world.until("the card ended at Done") { world.card.calls.last == .endAll }
        world.clock.set(cooled + 20)
        model.answer(yolk: .jammy, white: nil)
        await world.until("the fold") { !model.planner.learner.draining && model.planner.kept.folded == 1 }
        world.clock.set(cooled + 40)
        model.startAgain()
        await world.settled(model.cook)
        let heating = Phase.heating.rawValue, cooking = Phase.cooking.rawValue, pulling = Phase.pull.rawValue
        #expect(world.phases == [heating, cooking, pulling, Phase.cooling.rawValue, Phase.done.rawValue])
        #expect(world.ringer.rung.isEmpty)
        #expect(world.stored == nil)
        #expect(model.planner.kept.log.count == 1)
        let egg = try #require(model.planner.kept.log.first)
        #expect(egg.yolkWord == .jammy)
        #expect(egg.pulledBy == .cook)
        #expect(egg.forecast != nil)
        #expect(egg.appVersion.hasSuffix(" (debug clock)"))
    }

    /// Cancel while heating: nothing stored or logged, the alarms cancelled
    /// and the card ended; a relaunch is idle, with no card and nothing
    /// pending.
    @Test func cancelWhileHeatingLeavesNothing() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        world.clock.advance(120)
        let cancels = world.alarm.cancels
        model.cancel()
        await world.settled(model.cook)
        #expect(model.cook.running == nil)
        #expect(world.alarm.cancels > cancels)
        #expect(world.alarm.pending.isEmpty)
        #expect(world.stored == nil)
        #expect(model.planner.kept.log.isEmpty)
        await world.until("the card ended") { world.card.calls.last == .endAll }
        model.cook.killed()

        let calls = world.card.calls.count
        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.phase == .idle)
        #expect(!world.card.calls.dropFirst(calls).contains { $0.shown != nil })
        #expect(world.alarm.pending.isEmpty)
    }

    /// Done, relaunched a minute short of the egg's hour: still open; at the
    /// hour it ends, and an answer a second past it is not taken: the egg
    /// logged unanswered, with its forecast.
    @Test func doneRelaunchedNearTheHourEndsAtIt() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        try await toDone(model, world)
        let cooled = try cooledS(model.cook)
        model.cook.killed()

        world.clock.set(cooled + 3540)
        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.phase == .done)
        #expect(again.cook.running != nil)
        world.clock.set(cooled + 3601)
        again.answer(yolk: .runny, white: nil)
        await world.settled(again.cook)
        await world.until("the fold") { !again.planner.learner.draining }
        #expect(again.cook.running == nil)
        #expect(world.stored == nil)
        #expect(again.planner.kept.log.count == 1)
        let egg = try #require(again.planner.kept.log.first)
        #expect(egg.yolkWord == nil)
        #expect(egg.forecast != nil)
    }

    /// Answered at Done, relaunched: Done again on its pot's surface, the
    /// peak yolk and the texture note as the cook ran, not as the posterior
    /// that learned from it would plan it.
    @Test func answeredAtDoneARelaunchShowsTheCookAsItRan() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        _ = try await answeredAtDone(model, world)
        let peak = try #require(model.cook.shownPeakYolkC)
        let note = SliderReading(model, phase: .done).note(model.planner)
        #expect(!note.isEmpty)
        model.cook.killed()

        world.clock.advance(55)
        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.phase == .done)
        #expect(again.cook.plan?.decided != nil)
        #expect(abs(try #require(again.cook.shownPeakYolkC) - peak) < 0.01)
        #expect(SliderReading(again, phase: .done).note(again.planner) == note)
    }

    /// Never boiled: frozen on the moment the guess gives out, nothing is
    /// planned again; past it the guess lengthens, creeping on from 1,000 s;
    /// the card counts up to two hours; relaunched short of them, still
    /// heating, and ended at them.
    @Test func neverBoiledTheGuessLengthensToTwoHours() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let start = try #require(model.cook.running).startedAtS
        let first = try #require(model.cook.plan?.slowHobAtS)
        world.clock.set(first)
        let before = world.plans
        for _ in 0..<4 { await world.ticked(model.cook) }
        #expect(world.plans == before)
        world.clock.set(first + 0.001)
        await world.until("the guess lengthened") { model.cook.plan.map(guessLengthened) == true }
        await world.quiet(model.cook)
        let from = world.plans
        await tick(at: start + 1000, model, world)
        var plan = try #require(model.cook.plan)
        while let next = plan.slowHobAtS, next <= start + 1100 {
            world.clock.set(next + 0.001)
            await world.until("planned again") { model.cook.plan?.slowHobAtS != next }
            await world.quiet(model.cook)
            plan = try #require(model.cook.plan)
            try #require((plan.slowHobAtS ?? .infinity) > next, "the slow hob stuck at \(next - start)")
        }
        let creeping = world.plans - from
        #expect(creeping >= 5 && creeping <= 15)
        let card = try #require(world.card.last)
        #expect(card.stage == .heating && card.up)
        #expect(abs(card.ends - (start + 7200)) <= 1)
        model.cook.killed()

        world.clock.set(start + 7150)
        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.phase == .heating)
        let cancels = world.alarm.cancels
        world.clock.set(start + 7201)
        await world.until("ended at two hours") { again.cook.running == nil }
        await world.quiet(again.cook)
        #expect(world.alarm.cancels > cancels)
        #expect(world.stored == nil)
    }

    /// Relaunched while heating past the guess: the pull lengthened, and the
    /// pending pull moved to it.
    @Test func relaunchedPastTheGuessThePendingPullMoves() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let start = try #require(model.cook.running).startedAtS
        let was = try #require(world.alarm.pending["cook.pull"])
        model.cook.killed()

        world.clock.set(start + 652)
        let again = await relaunched(world)
        defer { again.cook.killed() }
        await world.until("the alarms set again") { world.log.events.contains(.restored) }
        #expect(again.cook.phase == .heating)
        #expect(again.cook.plan.map(guessLengthened) == true)
        let pull = try pullS(again.cook)
        #expect(pull > was + 30)
        #expect(world.alarm.pending == ["cook.pull": pull, "cook.cool": try cooledS(again.cook)])
    }

    /// A cook and a results log this build cannot read: the cook dropped,
    /// its alarms cancelled and its card ended, the log written again empty,
    /// and nothing kept aside.
    @Test func whatThisBuildCannotReadIsDropped() async throws {
        let format = try #require(StoreRegistry.cook.format)
        let world = World(store: MemoryStore([
            Cook.savedKey: Data(#"{"v":\#(format),"cook":{"id_ms":1}}"#.utf8),
            "calibration.v5": Data("{damaged".utf8),
        ]))
        let model = AppModel()
        defer { model.cook.killed() }
        model.appear()
        await world.settled(model.cook)
        #expect(model.cook.running == nil)
        #expect(world.store.data(forKey: Cook.savedKey) == nil)
        #expect(world.alarm.cancels > 0)
        await world.until("the card ended") { world.card.calls.contains(.endAll) }
        let log = try #require(world.store.data(forKey: "calibration.v5"))
        let read = try #require(try JSONSerialization.jsonObject(with: log) as? [String: Any])
        #expect(read["v"] as? Int == 5)
        #expect((read["log"] as? [Any])?.isEmpty == true)
        #expect(!world.store.values.keys.contains { $0.hasSuffix(".unread") })
        await world.until("the solves") { !model.planner.solver.busy }
    }

    /// An answered egg corrected at Done, killed before its record was made
    /// again, relaunched past its hour: the corrected egg logged, Jammy
    /// kept, and the cook forgotten.
    @Test func correctedAtDoneKilledThenRelaunchedTooOld() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let cooled = try cooledS(model.cook)
        _ = try await correctedHeld(model, world)
        #expect(world.stored?.correctedAtS != nil)
        #expect(model.planner.kept.log.last?.egg.massG == first.egg.massG)
        model.cook.killed()

        world.clock.set(cooled + 3700)
        let again = AppModel()
        defer { again.cook.killed() }
        again.appear()
        #expect(world.log.events.contains(.restoreTooOld))
        await world.until("the corrected egg logged, the cook forgotten") {
            world.stored == nil && !again.planner.learner.draining
                && again.planner.kept.log.last?.egg.massG != first.egg.massG
        }
        #expect(again.planner.kept.log.count == 1)
        #expect(again.planner.kept.log.last?.yolkWord == .jammy)
    }
}
