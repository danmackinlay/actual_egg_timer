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
        #expect(world.alarm.scheduled.last?.pullS == (try pullS(cook)))
        #expect(world.card.calls.contains(.start(.heating)))

        // Full rolling boil, five minutes in.
        world.clock.set(t0 + 300)
        cook.boil()
        await world.settled(cook)
        #expect(cook.running?.events.boilAtS == t0 + 300)
        #expect(world.stored?.events.boilAtS == t0 + 300)
        #expect(cook.phase == .cooking)
        #expect(world.alarm.scheduled.last?.pullS == (try pullS(cook)))

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
        world.ringer.onScreenSinceS = world.clock.seconds
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
        #expect(world.alarm.scheduled.last?.pullS == nil)
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

    // MARK: - How a cook ends

    /// The cook on screen's choices with a heavier egg: a correction.
    private func heavier(_ model: AppModel) throws -> CookChoices {
        var choices = try #require(model.cook.running).choices
        choices.massKg += 0.008
        choices.massFrom = .scale
        choices.sizeTable = nil
        return choices
    }

    /// The egg answered about at Done, logged and folded: its record.
    private func answeredAtDone(_ model: AppModel, _ world: World) async throws -> EggRecord {
        try await toDone(model, world)
        model.answer(yolk: .jammy, white: nil)
        await world.settled(model.cook)
        await world.until("the fold") { !model.planner.learner.draining && model.planner.kept.folded == 1 }
        return try #require(model.planner.kept.log.last)
    }

    /// The test hooks for a record never made again, off whatever happens.
    private func hooksOff() {
        Screenshots.holdAsRan = false
        Screenshots.failRemake = false
    }

    /// Jammy at Done, the egg corrected, and Start again pressed at once:
    /// the egg logged as corrected, Jammy kept, and only then the cook
    /// forgotten and the egg final.
    @Test func aCorrectionAtDoneThenStartAgainLogsTheCorrectedEgg() async throws {
        let world = World()
        let model = AppModel()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let finals = world.sharing.finals
        model.correct(try heavier(model), startedAtS: nil)
        model.startAgain()
        await world.settled(model.cook)
        await world.until("the fold") { !model.planner.learner.draining }
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
        let model = AppModel()
        defer {
            model.cook.killed()
            hooksOff()
        }
        try await toDone(model, world)
        Screenshots.holdAsRan = true
        model.correct(try heavier(model), startedAtS: nil)
        await world.settled(model.cook)
        model.answer(yolk: .jammy, white: .tender)
        await world.settled(model.cook)
        #expect(model.planner.kept.log.isEmpty)
        #expect(model.cook.answers?.yolkWord == .jammy)
        #expect(world.log.events.contains(.answerHeld))
        model.startAgain()
        await world.settled(model.cook)
        await world.until("the fold") { !model.planner.learner.draining && model.planner.kept.folded == 1 }
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
        let model = AppModel()
        defer {
            model.cook.killed()
            hooksOff()
        }
        let first = try await answeredAtDone(model, world)
        Screenshots.holdAsRan = true
        Screenshots.failRemake = true
        model.correct(try heavier(model), startedAtS: nil)
        await world.settled(model.cook)
        let finals = world.sharing.finals
        model.startAgain()
        await world.settled(model.cook)
        #expect(world.log.events.contains(.asRanNotRemade))
        #expect(model.cook.running == nil)
        let stored = try #require(world.stored)
        #expect(endedAtS(stored) != nil)
        #expect(model.planner.kept.log.last?.egg.massG == first.egg.massG)
        #expect(world.sharing.finals == finals)
        #expect(model.cook.eggOpen(atS: world.clock.seconds))
        model.cook.killed()

        hooksOff()
        world.clock.advance(60)
        let again = AppModel()
        defer { again.cook.killed() }
        again.appear()
        await world.settled(again.cook)
        await world.until("the fold") { !again.planner.learner.draining }
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
        let model = AppModel()
        defer { model.cook.killed() }
        try await toDone(model, world)
        model.startAgain()
        await world.settled(model.cook)
        model.cook.killed()
        world.clock.advance(60)
        let again = AppModel()
        defer { again.cook.killed() }
        again.appear()
        await world.settled(again.cook)
        #expect(again.cook.running == nil)
        #expect(again.cook.phase == .idle)
        #expect(again.planner.kept.log.count == 1)
        await world.until("the fold") { !again.planner.learner.draining }
    }

    // MARK: - Stores

    /// The settings are one value, read by core's `readSettings`: a control
    /// changed while idle writes it whole, in its format, and the next launch
    /// reads it back; the keys of before are swept, and settings in no format
    /// are not read.
    @Test func theSettingsAreOneValue() async throws {
        let unformatted = try JSONSerialization.data(withJSONObject: ["waterLitres": 5])
        let world = World(store: MemoryStore(["doneness": 0.7, "start": "hot", SettingsStore.key: unformatted]))
        #expect(world.store.object(forKey: "doneness") == nil)
        let planner = Planner()
        planner.load()
        #expect(planner.settings.doneness == Defaults.doneness)
        #expect(planner.settings.waterLitres == AppSettings.defaults.waterLitres)
        planner.settings.waterLitres = 3
        planner.start = .hot
        let data = try #require(world.store.data(forKey: SettingsStore.key))
        let raw = try JSONSerialization.jsonObject(with: data)
        #expect(inFormat(StoreRegistry.settings, raw) != nil)
        let stored = readSettings(raw, classes: planner.sizeClasses)
        #expect(stored.waterLitres == 3)
        #expect(stored.startMode == .hot)
        let again = Planner()
        again.load()
        #expect(again.settings.waterLitres == 3)
        #expect(again.start == .hot)
        await world.until("the solves") { !planner.solver.busy && !again.solver.busy }
    }

    /// The table of stored cooks both apps are held to (fixtures/stores.json,
    /// from core's `readStoredCook`), each row's text put where this app
    /// keeps its cook and read as a relaunch reads it: the same rows taken,
    /// the same cooks, and the same refused, as the web's store
    /// (test/store.test.ts).
    @Test func theStoredCookTableReadsAsTheWebReadsIt() throws {
        let url = World.copyFolder.deletingLastPathComponent().appendingPathComponent("fixtures/stores.json")
        let fixture = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let rows = try #require(fixture["cooks"] as? [[String: Any]])
        #expect(rows.count > 20)
        for row in rows {
            let about = row["about"] as? String ?? ""
            let world = World(store: MemoryStore([Cook.savedKey: Data((row["text"] as? String ?? "").utf8)]))
            let read = world.store.data(forKey: Cook.savedKey).flatMap(Cook.readStored)
            guard let want = row["read"] as? [String: Any] else {
                #expect(read == nil, "\(about): read")
                continue
            }
            let got = try #require(read, "\(about): refused")
            let cook = try #require(want["cook"] as? [String: Any])
            #expect(got.cook.idMs == (cook["id_ms"] as? NSNumber)?.doubleValue, "\(about)")
            #expect(got.cook.log.count == (cook["log"] as? [Any])?.count, "\(about)")
            #expect(got.answers.rawValue == want["answers"] as? String, "\(about)")
            let hint = try #require((want["leanHint_s"] as? NSNumber)?.doubleValue)
            #expect(abs(got.leanHintS - hint) <= 1e-12 * max(1, abs(hint)), "\(about)")
        }
    }

    /// At launch every key an earlier build wrote is swept, and every key
    /// this build keeps, and any key not the app's, stays.
    @Test func anEarlierBuildsKeysAreSweptAndThisBuildsKept() {
        var values: [String: Any] = ["AppleLanguages": ["en"]]
        for key in Stores.retiredKeys { values[key] = Data("an earlier build's".utf8) }
        for store in StoreRegistry.all { if let key = store.ios { values[key] = Data("this build's".utf8) } }
        values[Stores.markKey] = "0.4.0"
        let world = World(store: MemoryStore(values))
        #expect(!Stores.readOnly)
        let kept = Set(StoreRegistry.all.compactMap(\.ios))
        #expect(!Stores.sweptKeys.isEmpty)
        for key in Stores.retiredKeys { #expect(world.store.object(forKey: key) == nil, "\(key) swept") }
        for key in kept { #expect(world.store.object(forKey: key) != nil, "\(key) kept") }
        #expect(world.store.object(forKey: "AppleLanguages") != nil)
        #expect(Set(Stores.retiredKeys).isDisjoint(with: kept), "no key both retired and kept")
        #expect(Stores.takeRetiredCook(), "an earlier build's cook among them")
    }

    /// A build that finds a newer build's mark sweeps nothing.
    @Test func aReadOnlyBuildSweepsNothing() {
        var values: [String: Any] = [Stores.markKey: "9.0.0", Stores.buildKey: "1"]
        for key in Stores.retiredKeys { values[key] = Data("an earlier build's".utf8) }
        let world = World(store: MemoryStore(values))
        #expect(Stores.readOnly)
        #expect(world.store.writes.isEmpty)
        #expect(world.store.values.count == values.count)
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
        let keys = StoreRegistry.all.compactMap(\.ios)
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
        // Every key written is in the table of stores.
        #expect(Set(world.store.writes.map(\.key)).isSubset(of: Set(keys)))
        #expect(keys.map { standard.object(forKey: $0).map { "\($0)" } } == before)
    }
}
