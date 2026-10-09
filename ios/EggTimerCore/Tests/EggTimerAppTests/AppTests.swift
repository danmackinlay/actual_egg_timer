import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

/// The app's logic, driven as the screen drives it, on a clock the test
/// moves, with every service a fake (Fakes.swift): the cook as core's
/// `step` runs it, and what the app does with each step. One at a time:
/// the services, the clock and the store are the app's globals.
@Suite(.serialized) @MainActor
struct AppTests {
    /// "Eggs in" on the planner's defaults, a cold start or a hot one, and
    /// the cook once its plan is on its pot's surface.
    private func start(_ cook: Cook, _ planner: Planner, _ world: World, _ start: StartChoice = .cold) async {
        planner.start = start
        await cook.start(
            choices: planner.choices, nudgeS: 0, boilMemory: [:], units: .metric, lang: "en", leanHintS: 0
        )
        await world.settled(cook)
    }

    private func pullS(_ cook: Cook) throws -> Double { try #require(cook.plan).deadlines.cookEndS }
    private func cooledS(_ cook: Cook) throws -> Double { try #require(cook.plan?.deadlines.coolEndS) }

    // MARK: - A cook

    /// Eggs in to Done and Start again: each phase as the clock reaches it,
    /// the taps, the events the clock decides, the store, the alarms, the
    /// in-app ring, the card, and the unanswered egg logged as it ends.
    @Test func aCookFromStartToDone() async throws {
        let world = World()
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        let t0 = world.clock.seconds
        await start(cook, planner, world)

        #expect(cook.phase == .heating)
        #expect(world.stored?.idMs == cook.running?.idMs)
        #expect(world.alarm.scheduled.last?.pullAt?.timeIntervalSince1970 == (try pullS(cook)))
        #expect(world.card.calls.contains(.start(.heating)))

        // Full rolling boil, five minutes in.
        world.clock.set(t0 + 300)
        cook.boil()
        await world.settled(cook)
        #expect(cook.running?.events.boilAtS == t0 + 300)
        #expect(world.stored?.events.boilAtS == t0 + 300)
        #expect(cook.phase == .cooking)
        #expect(world.alarm.scheduled.last?.pullAt?.timeIntervalSince1970 == (try pullS(cook)))

        // The pull, which the system's alarm covers: no ring from the app.
        world.clock.set(try pullS(cook) + 1)
        await world.ticked(cook)
        #expect(cook.phase == .pull)
        #expect(cook.running?.events.rangAtS != nil)
        #expect(world.ringer.rung.isEmpty)

        // Out, three seconds into the pull: the cooling is timed from the tap.
        let pull = try pullS(cook)
        world.clock.set(pull + 3)
        cook.pulledOut()
        await world.settled(cook)
        #expect(cook.running?.events.pulled?.outS == pull + 3)
        #expect(cook.running?.events.pulled?.by == .cook)
        #expect(cook.phase == .cooling)

        // The cooling's end: Done, written by the tick, and the card gone.
        let cooled = try cooledS(cook)
        world.clock.set(cooled + 1)
        await world.ticked(cook)
        #expect(cook.phase == .done)
        #expect(cook.running?.events.cooledAtS == cooled)
        #expect(world.stored?.events.cooledAtS == cooled)
        #expect(world.card.calls.last == .endAll)

        // Start again: the pan remembered, the egg logged unanswered, then
        // forgotten.
        cook.end()
        await world.settled(cook)
        #expect(cook.running == nil)
        #expect(world.stored == nil)
        #expect(planner.kept.log.count == 1)
        #expect(planner.kept.log.first?.yolkWord == nil)
        #expect(planner.hasBoilMemory)
        await world.until("the planner to fold it") { !planner.learner.draining }
    }

    /// With no notifications allowed, the app rings the pull itself, once.
    @Test func withoutAlarmsTheAppRingsThePull() async throws {
        let world = World()
        world.alarm.authorized = false
        world.ringer.onScreenSince = world.clock.now
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world, .hot)
        #expect(cook.phase == .cooking)
        #expect(world.alarm.scheduled.isEmpty)
        world.clock.set(try pullS(cook) + 1)
        await world.ticked(cook)
        #expect(world.ringer.rung == [.pull])
        world.clock.advance(2)
        await world.ticked(cook)
        #expect(world.ringer.rung == [.pull])
    }

    /// A relaunch: a new `Cook` picks the stored one back up, writes the pull
    /// the clock assumed while the app was away, and sets the alarms and the
    /// card again.
    @Test func aRelaunchRestoresTheStoredCook() async throws {
        let world = World()
        let planner = Planner()
        let first = Cook(planner: planner)
        await start(first, planner, world)
        world.clock.advance(300)
        first.boil()
        await world.settled(first)
        let stored = try #require(world.stored)
        #expect(stored.events.boilAtS != nil)
        let pull = try pullS(first)
        // The app killed mid-cook: its ticker stops, the store keeps the cook.
        first.killed()

        // Back a minute after the pull's grace ran out, egg still unanswered.
        world.clock.set(pull + pullGraceSeconds + 60)
        let scheduled = world.alarm.scheduled.count
        let calls = world.card.calls.count
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        cook.restore()
        #expect(cook.running?.idMs == stored.idMs)
        #expect(cook.running?.choices == stored.choices)
        // The pull the clock assumed, at the grace's end, written at once.
        #expect(cook.running?.events.pulled?.by == .timeout)
        #expect(cook.running?.events.pulled?.outS == pull + pullGraceSeconds)
        #expect(world.stored?.events.pulled?.by == .timeout)
        #expect(cook.phase == .cooling)
        #expect(world.log.events.contains(.restore(phase: Phase.cooling.rawValue, eventsWritten: true)))
        // Nothing rung for a pull that passed while the app was away.
        #expect(world.ringer.rung.isEmpty)
        await world.until("the alarms and the card set again") { world.log.events.contains(.restored) }
        #expect(world.alarm.scheduled.count > scheduled)
        #expect(world.alarm.scheduled.last?.pullAt == nil)
        #expect(world.card.calls.dropFirst(calls).contains(.start(.cooling)))
        await world.settled(cook)
    }

    /// A relaunch past the cook's two hours: ended as Start again ends it,
    /// its alarms cancelled and its card gone, nothing stored, nothing logged
    /// for an egg never cooked through.
    @Test func aRelaunchTooOldEndsTheCook() async throws {
        let world = World()
        let planner = Planner()
        let first = Cook(planner: planner)
        await start(first, planner, world)
        first.killed()
        world.clock.advance(3 * 3600)
        let cancels = world.alarm.cancels
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        cook.restore()
        #expect(cook.running == nil)
        #expect(world.log.events.contains(.restoreTooOld))
        #expect(world.alarm.cancels > cancels)
        #expect(world.stored == nil)
        #expect(planner.kept.log.isEmpty)
        await world.until("the card ended") { world.card.calls.last == .endAll }
    }

    /// A correction mid-cook: a hot start corrected to a cold one heats
    /// again, pulls later, and the alarm follows; the cook as stored says so.
    @Test func aCorrectionPlansTheCookAgain() async throws {
        let world = World()
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world, .hot)
        let pull0 = try pullS(cook)
        world.clock.advance(60)
        var choices = try #require(cook.running).choices
        choices.startMode = .cold
        cook.correct(choices: choices, startedAtS: nil)
        await world.settled(cook)
        #expect(cook.phase == .heating)
        #expect(try pullS(cook) > pull0 + 60)
        #expect(world.stored?.choices.startMode == .cold)
        #expect(world.stored?.correctedAtS == world.clock.seconds)
        #expect(world.alarm.scheduled.last?.pullAt?.timeIntervalSince1970 == (try pullS(cook)))
        // Changed back: the first plan exactly.
        choices.startMode = .hot
        cook.correct(choices: choices, startedAtS: nil)
        await world.settled(cook)
        #expect(try pullS(cook) == pull0)
    }

    /// A correction that makes the egg overdue rings at once, though a
    /// notification was holding the pull it moved.
    @Test func anOverdueCorrectionRings() async throws {
        let world = World()
        world.ringer.onScreenSince = world.clock.now
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world, .hot)
        world.clock.set(try pullS(cook) - 60)
        var choices = try #require(cook.running).choices
        choices.massKg = 0.03
        choices.massFrom = .scale
        choices.sizeTable = nil
        cook.correct(choices: choices, startedAtS: nil)
        await world.settled(cook)
        #expect(cook.phase == .pull)
        #expect(world.ringer.rung == [.pull])
    }

    /// "Still in the water?": the grace ran out, so the clock assumed the
    /// pull; a correction to cold water would cook them longer, so the plan
    /// asks, and nothing past the question is timed. Yes: the assumed pull
    /// dropped and the cook timed again.
    @Test func theStillInQuestion() async throws {
        let world = World()
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world, .hot)
        let pull = try pullS(cook)
        world.clock.set(pull + pullGraceSeconds + 5)
        await world.ticked(cook)
        #expect(cook.running?.events.pulled?.by == .timeout)
        #expect(cook.phase == .cooling)
        var choices = try #require(cook.running).choices
        choices.startMode = .cold
        let cancels = world.alarm.cancels
        cook.correct(choices: choices, startedAtS: nil)
        await world.settled(cook)
        #expect(cook.plan.map(asksIfStillIn) == true)
        #expect(cook.readout(atS: world.clock.seconds)?.asking == true)
        #expect(world.alarm.cancels > cancels)
        cook.stillIn()
        await world.settled(cook)
        #expect(cook.running?.events.pulled == nil)
        #expect(cook.plan.map(asksIfStillIn) == false)
        #expect(world.stored?.events.pulled == nil)
    }

    // MARK: - The model

    /// Start a hot cook through the model, and take it to Done.
    private func toDone(_ model: AppModel, _ world: World) async throws {
        model.appear()
        model.planner.start = .hot
        await world.until("the planner's answer") { model.planner.solution != nil && !model.planner.solver.busy }
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        world.clock.set(try cooledS(model.cook) + 5)
        await world.ticked(model.cook)
        #expect(model.cook.phase == .done)
    }

    /// Start again at Done with the egg never answered: it is logged, and
    /// written down, before the stored cook is cleared; then it is final.
    @Test func startAgainLogsTheUnansweredEggBeforeClearing() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        try await toDone(model, world)
        #expect(model.planner.kept.log.isEmpty)

        let writes = world.store.writes.count
        let finals = world.sharing.finals
        model.startAgain()
        await world.settled(model.cook)

        #expect(model.cook.running == nil)
        #expect(model.planner.kept.log.count == 1)
        let egg = try #require(model.planner.kept.log.first)
        #expect(egg.yolkWord == nil)
        #expect(egg.white == nil)
        // In the store: the log written, then the cook removed.
        let after = world.store.writes.dropFirst(writes).map(\.key)
        let logged = try #require(after.firstIndex(of: "calibration.v5"))
        let cleared = try #require(after.lastIndex(of: Cook.savedKey))
        #expect(logged < cleared)
        #expect(world.store.data(forKey: Cook.savedKey) == nil)
        #expect(world.sharing.finals > finals)
        await world.until("the planner to fold it") { !model.planner.learner.draining }
    }

    /// The answers at Done: the first logs the egg and folds it; the second
    /// replaces it, both answers kept, and folds it again; the egg is open
    /// to sharing until Start again.
    @Test func answersAtDoneLogTheEggOnce() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        try await toDone(model, world)
        model.answer(yolk: .jammy, white: nil)
        await world.settled(model.cook)
        await world.until("the fold") { !model.planner.learner.draining && model.planner.kept.folded == 1 }
        #expect(model.planner.kept.log.count == 1)
        #expect(model.planner.kept.log.first?.yolkWord == .jammy)
        #expect(model.cook.answers?.yolkWord == .jammy)
        #expect(model.cook.eggOpen(atS: world.clock.seconds))
        // Answered again about the yolk: the first word stands.
        model.answer(yolk: .hard, white: .firm)
        await world.settled(model.cook)
        await world.until("the fold again") { !model.planner.learner.draining && model.planner.kept.folded == 1 }
        #expect(model.planner.kept.log.count == 1)
        #expect(model.planner.kept.log.first?.yolkWord == .jammy)
        #expect(model.planner.kept.log.first?.white == .firm)
        #expect(answered(try #require(world.stored)))
        model.startAgain()
        await world.settled(model.cook)
        #expect(model.planner.kept.log.count == 1)
        #expect(!model.cook.eggOpen(atS: world.clock.seconds))
    }

    // MARK: - Stores

    /// The settings are one value, read by core's `readSettings`: a control
    /// changed while idle writes it whole, and the next launch reads it back;
    /// the keys of before are swept.
    @Test func theSettingsAreOneValue() async throws {
        let world = World(store: MemoryStore(["doneness": 0.7, "start": "hot"]))
        #expect(world.store.object(forKey: "doneness") == nil)
        let planner = Planner()
        planner.load()
        #expect(planner.settings.doneness == Defaults.doneness)
        planner.settings.waterLitres = 3
        planner.start = .hot
        let data = try #require(world.store.data(forKey: SettingsStore.key))
        let stored = readSettings(try JSONSerialization.jsonObject(with: data), classes: planner.sizeClasses)
        #expect(stored.waterLitres == 3)
        #expect(stored.startMode == .hot)
        let again = Planner()
        again.load()
        #expect(again.settings.waterLitres == 3)
        #expect(again.start == .hot)
        await world.until("the solves") { !planner.solver.busy && !again.solver.busy }
    }

    /// Under a newer build's mark this build writes nothing at all, and
    /// still times the egg.
    @Test func aNewerMarkWritesNothing() async throws {
        let world = World(store: MemoryStore([Stores.markKey: "9.0.0", Stores.buildKey: "1"]))
        #expect(Stores.readOnly)
        let planner = Planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world)
        #expect(cook.phase == .heating)
        world.clock.advance(300)
        cook.boil()
        await world.settled(cook)
        #expect(cook.running?.events.boilAtS != nil)
        Stores.set("x", forKey: "doneness")
        Stores.remove(Stores.markKey)
        #expect(world.store.writes.isEmpty)
        #expect(world.store.values.count == 2)
        #expect(world.store.string(forKey: Stores.markKey) == "9.0.0")
    }

    /// The lint's runtime twin (test/iosStores.test.ts): a whole cook, ended
    /// by Start again, writes only to the store it was given and only through
    /// `Stores`, each write the one `Stores` logged; UserDefaults itself is
    /// never touched.
    @Test func everyWriteGoesThroughStores() async throws {
        let keys = [
            Cook.savedKey, "calibration.v5", "boilMemory", SettingsStore.key, "newestVersion",
            "newestBuild", "languageState", "alarmSound",
        ]
        let standard = UserDefaults.standard
        let before = keys.map { standard.object(forKey: $0).map { "\($0)" } }

        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        model.appear()
        await world.until("the planner's answer") { model.planner.solution != nil && !model.planner.solver.busy }
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        model.boil()
        await world.settled(model.cook)
        world.clock.set(try cooledS(model.cook) + 5)
        await world.ticked(model.cook)
        model.startAgain()
        await world.settled(model.cook)
        await world.until("the planner to fold it") { !model.planner.learner.draining }

        let set = world.store.writes.filter { !$0.removed }.map(\.key)
        let wrote = world.log.events.compactMap { e -> String? in
            if case .wrote(let key, _, _) = e { return key }
            return nil
        }
        #expect(!set.isEmpty)
        #expect(set == wrote)
        #expect(Set(world.store.writes.map(\.key)).isSuperset(of: [Cook.savedKey, "calibration.v5"]))
        #expect(keys.map { standard.object(forKey: $0).map { "\($0)" } } == before)
    }
}
