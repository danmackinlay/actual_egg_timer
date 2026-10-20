import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

/// The app's logic, driven as the screen drives it, on a clock the test
/// moves, with every service a fake (Fakes.swift): the cook as core's
/// `step` runs it, and what the app does with each step. One at a time:
/// the services, the clock and the store are the app's globals, and each
/// test ends only once the planners it made are idle (`LeftIdle`). The suite
/// goes on in CookTests.swift, CorrectionTests.swift and ScreenTests.swift,
/// each check a device need not make that `npm run ios:e2e` once made, in
/// SharingTests.swift, and in WordsSweepTests.swift, every words object over
/// the choices and the phases.
@Suite(.serialized, .leftIdle) @MainActor
struct AppTests {
    /// "Eggs in" on the planner's defaults, a cold start or a hot one, and
    /// the cook once its plan is on its pot's surface.
    func start(_ cook: Cook, _ planner: Planner, _ world: World, _ start: StartChoice = .cold) async {
        planner.start = start
        await cook.start(
            choices: planner.choices, nudgeS: 0, boilMemory: [:], units: .metric, lang: "en", leanHintS: 0
        )
        await world.settled(cook)
    }

    func pullS(_ cook: Cook) throws -> Double { try #require(cook.plan).deadlines.cookEndS }
    func cooledS(_ cook: Cook) throws -> Double { try #require(cook.plan?.deadlines.coolEndS) }

    // MARK: - A cook

    /// Eggs in to Done and Start again: each phase as the clock reaches it,
    /// the taps, the events the clock decides, the store, the alarms, the
    /// in-app ring, the card, and the unanswered egg logged as it ends.
    @Test func aCookFromStartToDone() async throws {
        let world = World()
        let planner = world.planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        let t0 = world.clock.seconds
        await start(cook, planner, world)

        #expect(cook.phase == .heating)
        #expect(world.stored?.idMs == cook.running?.idMs)
        #expect(world.alarm.scheduled.last?.pullS == (try pullS(cook)))
        // Pending with the system, by id, at the plan's moments; the card
        // counting down to the pull.
        #expect(world.alarm.pending == ["cook.pull": try pullS(cook), "cook.cool": try cooledS(cook)])
        #expect(world.card.calls.contains { $0.started == .heating })
        #expect(world.card.last?.ends == (try pullS(cook)))

        // Rolling boil, five minutes in.
        world.clock.set(t0 + 300)
        cook.boil()
        await world.settled(cook)
        #expect(cook.running?.events.boilAtS == t0 + 300)
        #expect(world.stored?.events.boilAtS == t0 + 300)
        #expect(cook.phase == .cooking)
        #expect(world.alarm.scheduled.last?.pullS == (try pullS(cook)))

        // The pull, with the app not on screen: the notification's alone,
        // no ring from the app.
        world.clock.set(try pullS(cook) + 1)
        await world.ticked(cook)
        #expect(cook.phase == .pull)
        #expect(cook.running?.events.rangAtS != nil)
        #expect(world.ringer.rung.isEmpty)
        #expect(world.alarm.delivered == ["cook.pull"])
        #expect(world.alarm.pending.keys.sorted() == ["cook.cool"])

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
        await world.learned(planner)
    }

    /// With no notifications allowed, the app rings the pull itself, once.
    @Test func withoutAlarmsTheAppRingsThePull() async throws {
        let world = World()
        world.alarm.authorized = false
        world.ringer.onScreenSinceS = world.clock.seconds
        let planner = world.planner()
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

    /// With the pull's notification pending and the app on screen, the app
    /// rings the pull itself as well, once: silent mode mutes the
    /// notification's sound, which is presented on screen without it.
    @Test func onScreenTheAppRingsThePullItsNotificationHolds() async throws {
        let world = World()
        world.ringer.onScreenSinceS = world.clock.seconds
        let planner = world.planner()
        let cook = Cook(planner: planner)
        defer { cook.killed() }
        await start(cook, planner, world, .hot)
        #expect(world.alarm.pending["cook.pull"] == (try pullS(cook)))
        world.clock.set(try pullS(cook) + 1)
        await world.ticked(cook)
        #expect(world.alarm.delivered == ["cook.pull"])
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
        let planner = world.planner()
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
        #expect(world.alarm.scheduled.last?.pullS == nil)
        #expect(world.card.calls.dropFirst(calls).contains { $0.started == .cooling })
        await world.settled(cook)
    }

    /// A relaunch past the cook's two hours: ended as Start again ends it,
    /// its alarms cancelled and its card gone, nothing stored, nothing logged
    /// for an egg never cooked through.
    @Test func aRelaunchTooOldEndsTheCook() async throws {
        let world = World()
        let planner = world.planner()
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
        let planner = world.planner()
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
        #expect(world.alarm.scheduled.last?.pullS == (try pullS(cook)))
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
        world.ringer.onScreenSinceS = world.clock.seconds
        let planner = world.planner()
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
        let planner = world.planner()
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

    /// "Eggs in" through the model, a hot start unless said, the controls
    /// set by `setting` first, once the screen has its answer: the cook once
    /// its plan is on its pot's surface.
    func started(
        _ model: AppModel, _ world: World, _ start: StartChoice = .hot, setting: (Planner) -> Void = { _ in }
    ) async {
        model.appear()
        model.planner.start = start
        setting(model.planner)
        await world.until("the planner's answer") { model.planner.solution != nil && !model.planner.solver.busy }
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
    }

    /// The app killed once its folds and its solve have landed in the
    /// store, so a relaunch reads what it wrote, not what it was writing.
    func kill(_ model: AppModel, _ world: World) async {
        await world.learned(model.planner)
        model.cook.killed()
    }

    /// Start a hot cook through the model, and take it to Done.
    func toDone(_ model: AppModel, _ world: World) async throws {
        await started(model, world)
        world.clock.set(try cooledS(model.cook) + 5)
        await world.ticked(model.cook)
        #expect(model.cook.phase == .done)
    }

    /// Start again at Done with the egg never answered: it is logged, and
    /// written down, before the stored cook is cleared; then it is final.
    @Test func startAgainLogsTheUnansweredEggBeforeClearing() async throws {
        let world = World()
        let model = world.model()
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
        #expect(egg.forecast != nil)
        #expect(egg.setup.startMode == .hot)
        #expect(world.phases.last == Phase.done.rawValue && !world.phases.contains(Phase.heating.rawValue))
        // In the store: the log written, then the cook removed.
        let after = world.store.writes.dropFirst(writes).map(\.key)
        let logged = try #require(after.firstIndex(of: "calibration.v5"))
        let cleared = try #require(after.lastIndex(of: Cook.savedKey))
        #expect(logged < cleared)
        #expect(world.store.data(forKey: Cook.savedKey) == nil)
        #expect(world.sharing.finals > finals)
        await world.learned(model.planner)
    }

    /// The answers at Done: the first logs the egg and folds it; the second
    /// replaces it, both answers kept, and folds it again; the egg is open
    /// to sharing until Start again.
    @Test func answersAtDoneLogTheEggOnce() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        try await toDone(model, world)
        model.answer(yolk: .jammy, white: nil)
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(model.planner.kept.log.count == 1)
        #expect(model.planner.kept.log.first?.yolkWord == .jammy)
        #expect(model.cook.answers?.yolkWord == .jammy)
        #expect(model.cook.eggOpen(atS: world.clock.seconds))
        // Answered again about the yolk: the first word stands.
        model.answer(yolk: .hard, white: .firm)
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(model.planner.kept.log.count == 1)
        #expect(model.planner.kept.log.first?.yolkWord == .jammy)
        #expect(model.planner.kept.log.first?.white == .firm)
        #expect(answered(try #require(world.stored)))
        model.startAgain()
        await world.settled(model.cook)
        #expect(model.planner.kept.log.count == 1)
        #expect(!model.cook.eggOpen(atS: world.clock.seconds))
    }

    /// A tap's change is committed once it has settled on the cook's clock,
    /// not before; a − or + held past `handHeldS` commits on release.
    @Test func aTapSettlesOnTheCooksClock() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let water = model.planner.settings.waterLitres
        model.planner.settings.waterLitres = water + 1
        #expect(model.inHand.pending)
        world.clock.advance(handSettleS - 0.1)
        // The clock short of the settle: nothing, however long the Mac waits.
        try await Task.sleep(for: .milliseconds(50))
        #expect(model.inHand.pending)
        #expect(model.cook.running?.choices.waterLitres == water)
        world.clock.advance(0.2)
        await world.until("the settle") { !model.inHand.pending }
        await world.settled(model.cook)
        #expect(model.cook.running?.choices.waterLitres == water + 1)
        let eggs = model.planner.settings.eggCount
        model.inHand.fingerDown(.eggCount)
        model.planner.settings.eggCount = eggs + 1
        world.clock.advance(handHeldS + 0.1)
        model.inHand.fingerUp()
        #expect(!model.inHand.pending)
        await world.settled(model.cook)
        #expect(model.cook.running?.choices.eggCount == Double(eggs + 1))
    }

    // MARK: - How a cook ends

    /// The cook on screen's choices with a heavier egg: a correction.
    func heavier(_ model: AppModel) throws -> CookChoices {
        var choices = try #require(model.cook.running).choices
        choices.massKg += 0.008
        choices.massFrom = .scale
        choices.sizeTable = nil
        return choices
    }

    /// The egg answered about at Done, logged and folded: its record.
    func answeredAtDone(_ model: AppModel, _ world: World) async throws -> EggRecord {
        try await toDone(model, world)
        model.answer(yolk: .jammy, white: nil)
        await world.settled(model.cook)
        await world.learned(model.planner)
        return try #require(model.planner.kept.log.last)
    }

    /// The calibration before the egg on screen held back (`HeldBefore`),
    /// and its cook corrected after the pull: the correction planned, its
    /// record not made again.
    func correctedHeld(_ model: AppModel, _ world: World) async throws -> HeldBefore {
        let held = HeldBefore(model.planner.learner)
        model.cook.learned = held
        model.correct(try heavier(model), startedAtS: nil)
        await world.until("the correction planned, its record held") {
            held.asked > 0 && model.cook.running?.correctedAtS != nil && model.cook.plan?.decided != nil
        }
        return held
    }

    /// Jammy at Done, a larger egg chosen, and Start again pressed while the
    /// change settles: committed by Start again, the egg logged as
    /// corrected, Jammy kept, and only then the cook forgotten and the egg
    /// final.
    @Test func aCorrectionAtDoneThenStartAgainLogsTheCorrectedEgg() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let finals = world.sharing.finals
        model.planner.chooseSize(model.planner.settings.sizeIndex + 1)
        #expect(model.inHand.pending)
        model.startAgain()
        #expect(!model.inHand.pending)
        await world.settled(model.cook)
        await world.learned(model.planner)
        #expect(model.cook.running == nil)
        let egg = try #require(model.planner.kept.log.last)
        #expect(model.planner.kept.log.count == 1)
        #expect(egg.egg.massG != first.egg.massG)
        #expect(egg.yolkWord == .jammy)
        #expect(world.stored == nil)
        #expect(world.sharing.finals > finals)
    }

    /// An answer given while the egg's record cannot be made yet - a
    /// correction after the pull not planned as it ran - is held with the
    /// cook; Start again logs the egg with it, and folds it.
    @Test func anAnswerHeldAtStartAgainIsLoggedWithIt() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        try await toDone(model, world)
        let held = try await correctedHeld(model, world)
        model.answer(yolk: .jammy, white: .tender)
        await world.until("the answer kept") { model.cook.answers?.white == .tender }
        #expect(model.planner.kept.log.isEmpty)
        #expect(model.cook.answers?.yolkWord == .jammy)
        // Start again, and the record made again lands after it.
        model.startAgain()
        held.release()
        await world.settled(model.cook)
        await world.learned(model.planner)
        let egg = try #require(model.planner.kept.log.last)
        #expect(model.planner.kept.log.count == 1)
        #expect(egg.yolkWord == .jammy)
        #expect(egg.white == .tender)
        #expect(egg.forecast != nil)
        #expect(world.stored == nil)
    }

    /// Start again on an answered egg corrected after the pull whose record
    /// cannot be made again: the cook stays stored and the egg is not final
    /// (sharing holds it back). A relaunch within the hour does not bring it
    /// back on screen: it makes the record, logs the corrected egg, and only
    /// then forgets the cook and sends the egg.
    @Test func aFailedRemakeLeavesTheCookStoredNotFinal() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        // Never released: the app is killed before the record lands.
        _ = try await correctedHeld(model, world)
        let finals = world.sharing.finals
        model.startAgain()
        await world.until("the cook off the screen, stored ended") {
            model.cook.running == nil && world.stored.map { endedAtS($0) != nil } == true
        }
        #expect(model.planner.kept.log.last?.egg.massG == first.egg.massG)
        #expect(world.sharing.finals == finals)
        #expect(model.cook.eggOpen(atS: world.clock.seconds))
        await kill(model, world)

        world.clock.advance(60)
        let again = world.model()
        defer { again.cook.killed() }
        again.appear()
        await world.settled(again.cook)
        await world.learned(again.planner)
        #expect(again.cook.running == nil)
        #expect(again.cook.phase == .idle)
        let egg = try #require(again.planner.kept.log.last)
        #expect(again.planner.kept.log.count == 1)
        #expect(egg.egg.massG != first.egg.massG)
        #expect(egg.yolkWord == .jammy)
        #expect(world.stored == nil)
        #expect(world.sharing.finals > finals)
    }

    /// A cook dismissed with Start again stays dismissed: a relaunch within
    /// the egg's hour opens idle, with the egg logged once.
    @Test func aCookDismissedWithStartAgainStaysDismissed() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        try await toDone(model, world)
        model.startAgain()
        await world.settled(model.cook)
        await kill(model, world)
        world.clock.advance(60)
        let again = world.model()
        defer { again.cook.killed() }
        again.appear()
        await world.settled(again.cook)
        #expect(again.cook.running == nil)
        #expect(again.cook.phase == .idle)
        #expect(again.planner.kept.log.count == 1)
        await world.learned(again.planner)
    }

    // MARK: - Stores

    /// The settings are one value, read by `readSettings`: a control
    /// changed while idle writes it whole, in its format, and the next launch
    /// reads it back; the keys of before are swept, and settings in no format
    /// are not read.
    @Test func theSettingsAreOneValue() async throws {
        let unformatted = try JSONSerialization.data(withJSONObject: ["waterLitres": 5])
        let world = World(store: MemoryStore(["doneness": 0.7, "start": "hot", SettingsStore.key: unformatted]))
        #expect(world.store.object(forKey: "doneness") == nil)
        let planner = world.planner()
        planner.load()
        #expect(planner.settings.doneness == Defaults.doneness)
        #expect(planner.settings.waterLitres == AppSettings.defaults.waterLitres)
        planner.settings.waterLitres = 3
        planner.start = .hot
        let data = try #require(world.store.data(forKey: SettingsStore.key))
        let stored = readSettings(data, classes: planner.sizeClasses)
        #expect(stored.waterLitres == 3)
        #expect(stored.startMode == .hot)
        let again = world.planner()
        again.load()
        #expect(again.settings.waterLitres == 3)
        #expect(again.start == .hot)
        await world.until("the solves") { !planner.solver.busy && !again.solver.busy }
    }

    /// At launch, in a real suite of UserDefaults, every key the table does
    /// not list is swept and every key it lists stays. Only the suite's own
    /// keys are read: a key in the standard domain, where the system keeps
    /// the language the cook chose for the app, stays, and one the suite
    /// only reads through from another domain is never asked to go.
    @Test func theSweepTakesOnlyTheSuitesOwnKeys() throws {
        let name = "\(Stores.suite).test"
        let standard = UserDefaults.standard
        let raw = try #require(UserDefaults(suiteName: name))
        let (was, output) = (Stores.store, DebugLog.output)
        defer {
            (Stores.store, DebugLog.output) = (was, output)
            standard.removePersistentDomain(forName: name)
            standard.removeObject(forKey: "aet.standard")
        }
        standard.removePersistentDomain(forName: name)
        standard.set("the system's", forKey: "aet.standard")
        raw.register(defaults: ["aet.registered": "read through"])
        for key in ["cookInProgress", "calibration.v4"] { raw.set(Data("an earlier build's".utf8), forKey: key) }
        for store in StoreRegistry.all { raw.set(Data("this build's".utf8), forKey: store.key) }
        let suite = Suite(name)
        let kept = Set(StoreRegistry.all.map(\.key))
        #expect(Set(suite.keys) == kept.union(["cookInProgress", "calibration.v4"]))

        let log = EventLog()
        DebugLog.output = { event, _ in log.add(event) }
        Stores.store = suite
        Stores.sweep()
        let swept = log.events.compactMap { e -> String? in
            if case .swept(let key) = e { return key }
            return nil
        }
        #expect(swept == ["calibration.v4", "cookInProgress"])
        #expect(Set(suite.keys) == kept)
        #expect(standard.string(forKey: "aet.standard") == "the system's")
        #expect(suite.string(forKey: "aet.standard") == nil, "the standard domain is not the suite's")
        #expect(suite.string(forKey: "aet.registered") == "read through")
    }

    /// A whole cook, ended by Start again, writes only to the store it was
    /// given and only through `Stores`, each write the one `Stores` logged;
    /// neither the standard domain nor the app's suite is touched.
    @Test func everyWriteGoesThroughStores() async throws {
        let keys = StoreRegistry.all.map(\.key)
        let standard = UserDefaults.standard
        let before = standard.dictionaryRepresentation() as NSDictionary
        let suiteBefore = standard.persistentDomain(forName: Stores.suite) as NSDictionary?

        let world = World()
        let model = world.model()
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
        await world.learned(model.planner)

        let set = world.store.writes.filter { !$0.removed }.map(\.key)
        let wrote = world.log.events.compactMap { e -> String? in
            if case .wrote(let key, _, _) = e { return key }
            return nil
        }
        #expect(!set.isEmpty)
        #expect(set == wrote)
        #expect(Set(world.store.writes.map(\.key)).isSuperset(of: [Cook.savedKey, "calibration.v5"]))
        // Every key written is in the table of stores.
        #expect(Set(world.store.writes.map(\.key)).isSubset(of: Set(keys)))
        #expect(before.isEqual(to: standard.dictionaryRepresentation()))
        #expect(suiteBefore == standard.persistentDomain(forName: Stores.suite) as NSDictionary?)
    }
}
