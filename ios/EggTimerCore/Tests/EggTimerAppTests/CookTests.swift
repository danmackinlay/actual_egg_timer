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
        let model = world.model()
        model.appear()
        await world.quiet(model.cook)
        return model
    }

    /// A cold cook to Done: the boil at 5:00, out 3 s into the pull, each
    /// phase in turn, the alarms the plan's and pending until their moments,
    /// the app's own ring at each deadline as well, since it is on screen and
    /// silent mode mutes a notification's sound, the card ended at Done;
    /// Jammy, then Start again:
    /// one egg logged with its forecast, marked as made under a debug clock,
    /// and no cook stored.
    @Test func aColdCookToDoneAnsweredAndStartedAgain() async throws {
        let world = World()
        world.clock.alter()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
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
        await world.learned(model.planner)
        world.clock.set(cooled + 40)
        model.startAgain()
        await world.settled(model.cook)
        let heating = Phase.heating.rawValue, cooking = Phase.cooking.rawValue, pulling = Phase.pull.rawValue
        #expect(world.phases == [heating, cooking, pulling, Phase.cooling.rawValue, Phase.done.rawValue])
        #expect(world.ringer.rung == [.pull, .cooled])
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
        let model = world.model()
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
        await kill(model, world)

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
        let model = world.model()
        defer { model.cook.killed() }
        try await toDone(model, world)
        let cooled = try cooledS(model.cook)
        await kill(model, world)

        world.clock.set(cooled + 3540)
        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.phase == .done)
        #expect(again.cook.running != nil)
        world.clock.set(cooled + 3601)
        again.answer(yolk: .runny, white: nil)
        await world.settled(again.cook)
        await world.learned(again.planner)
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
        let model = world.model()
        defer { model.cook.killed() }
        _ = try await answeredAtDone(model, world)
        let peak = try #require(model.cook.shownPeakYolkC)
        let note = SliderReading(model, phase: .done).note(model.planner)
        #expect(!note.isEmpty)
        await kill(model, world)

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
        let model = world.model()
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
        await kill(model, world)

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
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let start = try #require(model.cook.running).startedAtS
        let was = try #require(world.alarm.pending["cook.pull"])
        await kill(model, world)

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
        let model = world.model()
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

    /// Keys no build reads, an earlier build's cook among them, with its
    /// alarms pending: swept at launch, the app idle, its alarms not
    /// cancelled.
    @Test func anEarlierBuildsCookIsSweptAndItsAlarmsLeft() async throws {
        let old = ["cookInProgress", "cookInProgress.v2", "calibration.v4", "share.v1", "probeAsked"]
        let world = World(store: MemoryStore(Dictionary(uniqueKeysWithValues: old.map { ($0, Data("{}".utf8)) })))
        let swept = world.log.events.compactMap { e -> String? in
            if case .swept(let key) = e { key } else { nil }
        }
        #expect(Set(swept) == Set(old))
        #expect(world.store.keys.isEmpty)
        let now = world.clock.seconds
        world.alarm.schedule(pullS: now + 600, cooledS: now + 900, probe: false, cooling: .ice)
        let model = world.model()
        defer { model.cook.killed() }
        model.appear()
        await world.quiet(model.cook)
        #expect(model.cook.running == nil)
        #expect(model.cook.phase == .idle)
        #expect(world.alarm.cancels == 0)
        #expect(Set(world.alarm.pending.keys) == ["cook.pull", "cook.cool"])
        await world.until("the solves") { !model.planner.solver.busy }
    }

    /// An egg cup counted down from the out to its opening, two minutes on:
    /// the cooling's alarm and the card at the opening, the readout counting
    /// to it under the egg cup's line, and Done there.
    @Test func anEggCupCountsDownToItsOpening() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world) { $0.settings.cooling = .eggCup }
        let pull = try pullS(model.cook)
        await tick(at: pull + 1, model, world)
        world.clock.set(pull + 3)
        model.pulledOut()
        await world.settled(model.cook)
        await world.ticked(model.cook)
        let out = try #require(model.cook.running?.events.pulled?.outS)
        let opening = try cooledS(model.cook)
        #expect(abs(opening - (out + Constants.eggCupOpenedS)) <= 1e-6)
        #expect(world.alarm.pending["cook.cool"] == opening)
        await world.until("the card counting to the opening") { world.card.last?.stage == .opening }
        #expect(world.card.last.map { abs($0.ends - opening) <= 1 } == true)
        await tick(at: opening - 60, model, world)
        #expect(model.cook.phase == .cooling)
        let words = ReadoutWords(model, phase: model.cook.phase, nowS: opening - 60)
        #expect(words.big == "1:00")
        #expect(words.sub.string == tr(.`readout.sub.coolingEggCup`).string)
        await tick(at: opening + 1, model, world)
        #expect(model.cook.phase == .done)
    }

    /// An answered egg corrected at Done, killed before its record was made
    /// again, relaunched past its hour: the corrected egg logged, Jammy
    /// kept, and the cook forgotten.
    @Test func correctedAtDoneKilledThenRelaunchedTooOld() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let cooled = try cooledS(model.cook)
        _ = try await correctedHeld(model, world)
        #expect(world.stored?.correctedAtS != nil)
        #expect(model.planner.kept.log.last?.egg.massG == first.egg.massG)
        await kill(model, world)

        world.clock.set(cooled + 3700)
        let again = world.model()
        defer { again.cook.killed() }
        again.appear()
        #expect(world.log.events.contains(.restoreTooOld))
        await world.until("the corrected egg logged, the cook forgotten") {
            world.stored == nil && again.planner.kept.log.last?.egg.massG != first.egg.massG
        }
        await world.learned(again.planner)
        #expect(again.planner.kept.log.count == 1)
        #expect(again.planner.kept.log.last?.yolkWord == .jammy)
    }

    /// The plans of the cooks ended and waiting on their records.
    func endingPlans(_ cook: Cook) -> [CookPlan?] { cook.cooks.ending.map(\.plan) }

    /// The egg answered about at Done, corrected, and Start again pressed
    /// at once: the cook ended, waiting on its corrected pot's surface and
    /// the calibration before its egg, both held back.
    func endedWaiting(_ model: AppModel, _ world: World) async throws -> (EggRecord, HeldGrids, HeldBefore) {
        let first = try await answeredAtDone(model, world)
        let corrected = try heavier(model)
        let grids = HeldGrids(World.grids) { $0.egg.massKg == corrected.massKg }
        Services.grids = grids
        let held = HeldBefore(model.planner.learner)
        model.cook.learned = held
        model.correct(corrected, startedAtS: nil)
        await world.until("the correction taken, its record held") {
            held.asked > 0 && model.cook.running?.correctedAtS != nil
        }
        model.startAgain()
        await world.until("the cook ended, waiting") { model.cook.running == nil && endingPlans(model.cook).count == 1 }
        return (first, grids, held)
    }

    /// The next cook in, while one ended waits off the screen.
    func nextCook(_ model: AppModel, _ world: World) async throws -> Double {
        await world.until("the planner's answer") { model.planner.solution != nil && !model.planner.solver.busy }
        model.eggsIn()
        await world.until("the next cook") { model.cook.running != nil && !model.starting }
        return try #require(model.cook.running).idMs
    }

    /// An ended cook stepped while another is stored writes only over its
    /// own copy: its pot's surface landing after the next cook is in leaves
    /// the next cook stored, and so does its egg logged again and the ended
    /// cook forgotten; a relaunch picks the next cook back up.
    @Test func anEndedCookWritesOnlyOverItsOwnStoredCopy() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let (first, grids, held) = try await endedWaiting(model, world)
        let next = try await nextCook(model, world)
        await world.until("the next cook stored") { world.stored?.idMs == next }
        grids.release()
        await world.until("the ended cook's surface landed") { endingPlans(model.cook).first??.decided != nil }
        #expect(world.stored?.idMs == next, "the ended cook written over the next one's copy")
        held.release()
        await world.until("the ended cook logged and forgotten") { endingPlans(model.cook).isEmpty }
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(model.planner.kept.log.first?.egg.massG != first.egg.massG, "logged again, corrected")
        #expect(world.stored?.idMs == next, "the next cook's copy forgotten with the ended one")
        await kill(model, world)

        let again = await relaunched(world)
        defer { again.cook.killed() }
        #expect(again.cook.running?.idMs == next)
    }

    /// Jammy at Done, then a correction a second past the egg's hour: the
    /// clock ends the cook first, its egg final as it was logged; the
    /// correction is not taken, and nothing is logged again.
    @Test func aCorrectionPastTheHourIsNotTaken() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let tooOld = try #require(model.cook.plan).tooOldAtS
        let corrected = try heavier(model)
        world.clock.set(tooOld + 1)
        model.correct(corrected, startedAtS: nil)
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(model.cook.running == nil)
        #expect(world.stored == nil)
        #expect(model.planner.kept.log.count == 1)
        #expect(model.planner.kept.log.last?.egg.massG == first.egg.massG)
    }

    /// An ended cook waiting to log its egg again, and the next cook's egg
    /// answered at Done: both open, and sharing holds both back; once the
    /// first is logged again, only the next.
    @Test func twoEggsOpenAreBothHeldBack() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let (_, grids, held) = try await endedWaiting(model, world)
        grids.release()
        _ = try await nextCook(model, world)
        world.clock.set(try cooledS(model.cook) + 5)
        await world.until("Done") { model.cook.phase == .done }
        model.answer(yolk: .runny, white: nil)
        await world.until("the next egg logged") { model.planner.kept.log.count == 2 }
        let host = try #require(world.sharing.host)
        #expect(host.finalCount() == 0)
        held.release()
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(endingPlans(model.cook).isEmpty)
        #expect(host.finalCount() == 1)
    }
}
