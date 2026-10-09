import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

/// The app's logic, driven as the screen drives it, on a clock the test
/// moves, with every service a fake (Fakes.swift). One at a time: the
/// services, the clock and the store are the app's globals.
@Suite(.serialized) @MainActor
struct AppTests {
    /// "Eggs in" on the planner's defaults, a cold start or a hot one, and
    /// the cook once its plan is on its pot's surface.
    private func start(_ cook: Cook, _ world: World, _ start: StartChoice = .cold) async {
        let planner = Planner()
        planner.start = start
        await cook.start(
            choices: planner.choices, nudgeS: 0, boilMemory: [:], units: .metric, lang: "en", leanHintS: 0
        )
        await world.settled(cook)
    }

    // MARK: - Cook

    /// Eggs in to Done, through `Cook` alone: each phase as the clock reaches
    /// it, the taps, the events the clock decides, the store, the alarms, the
    /// in-app ring and the card.
    @Test func aCookFromStartToDone() async throws {
        let world = World()
        let cook = Cook()
        defer { cook.cancel() }
        let t0 = world.clock.seconds
        await start(cook, world)

        #expect(cook.phase == .heating)
        #expect(world.stored?.idMs == cook.running?.idMs)
        #expect(world.alarm.scheduled.last?.pullAt == cook.pullAt)
        #expect(world.card.calls.contains(.start(.heating)))

        // Full rolling boil, five minutes in.
        world.clock.set(t0 + 300)
        cook.boil()
        await world.settled(cook)
        #expect(cook.running?.events.boilAtS == t0 + 300)
        #expect(world.stored?.events.boilAtS == t0 + 300)
        #expect(cook.phase == .cooking)

        // The pull, which the system's alarm covers: no ring from the app.
        let pull = try #require(cook.pullAt).timeIntervalSince1970
        world.clock.set(pull + 1)
        await world.ticked(cook)
        #expect(cook.phase == .pull)
        #expect(world.ringer.rung.isEmpty)

        // Out, three seconds into the pull: the cooling is timed from the tap.
        world.clock.set(pull + 3)
        cook.pulledOut()
        await world.settled(cook)
        #expect(cook.running?.events.pulled?.outS == pull + 3)
        #expect(cook.running?.events.pulled?.by == .cook)
        #expect(cook.phase == .cooling)

        // The cooling's end: Done, written by the tick, and the card gone.
        let cooled = try #require(cook.coolDoneAt).timeIntervalSince1970
        world.clock.set(cooled + 1)
        await world.ticked(cook)
        #expect(cook.phase == .done)
        #expect(cook.running?.events.cooledAtS == cooled)
        #expect(world.stored?.events.cooledAtS == cooled)
        #expect(world.card.calls.last == .endAll)
        #expect(cook.unanswered() != nil)
    }

    /// With no notifications allowed, the app rings the pull itself.
    @Test func withoutAlarmsTheAppRingsThePull() async throws {
        let world = World()
        world.alarm.authorized = false
        world.ringer.onScreenSince = world.clock.now
        let cook = Cook()
        defer { cook.cancel() }
        await start(cook, world, .hot)
        #expect(cook.phase == .cooking)
        #expect(world.alarm.scheduled.isEmpty)
        let pull = try #require(cook.pullAt).timeIntervalSince1970
        world.clock.set(pull + 1)
        await world.ticked(cook)
        #expect(world.ringer.rung == [.pull])
    }

    /// A relaunch: a new `Cook` picks the stored one back up, writes the pull
    /// the clock assumed while the app was away, and sets the alarms and the
    /// card again.
    @Test func aRelaunchRestoresTheStoredCook() async throws {
        let world = World()
        let first = Cook()
        await start(first, world)
        world.clock.advance(300)
        first.boil()
        await world.settled(first)
        let stored = try #require(world.stored)
        #expect(stored.events.boilAtS != nil)
        let pull = try #require(first.pullAt).timeIntervalSince1970
        // The app killed mid-cook: its ticker stops and the store keeps the
        // cook (what the system holds is the fakes', set again below).
        first.cancel(keepStored: true)
        #expect(world.stored?.idMs == stored.idMs)

        // Back a minute after the pull's grace ran out, egg still unanswered.
        world.clock.set(pull + pullGraceSeconds + 60)
        let scheduled = world.alarm.scheduled.count
        let calls = world.card.calls.count
        let cook = Cook()
        defer { cook.cancel() }
        #expect(cook.restoreIfNeeded() == nil)
        #expect(cook.running?.idMs == stored.idMs)
        #expect(cook.running?.choices == stored.choices)
        // The pull the clock assumed, at the grace's end, written at once.
        #expect(cook.running?.events.pulled?.by == .timeout)
        #expect(world.stored?.events.pulled?.by == .timeout)
        #expect(cook.phase == .cooling)
        #expect(world.log.events.contains(.restore(phase: Phase.cooling.rawValue, eventsWritten: true)))
        await world.until("the alarms and the card set again") { world.log.events.contains(.restored) }
        #expect(world.alarm.scheduled.count > scheduled)
        #expect(world.card.calls.dropFirst(calls).contains(.start(.cooling)))
        await world.settled(cook)
    }

    // MARK: - The model

    /// Start again at Done with the egg never answered: it is logged, and
    /// written down, before the stored cook is cleared; then it is final.
    @Test func startAgainLogsTheUnansweredEggBeforeClearing() async throws {
        let world = World()
        let model = AppModel()
        model.appear()
        model.planner.start = .hot
        await world.until("the planner's answer") { model.planner.solution != nil && model.planner.task == nil }
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        let cooled = try #require(model.cook.coolDoneAt).timeIntervalSince1970
        world.clock.set(cooled + 5)
        await world.ticked(model.cook)
        #expect(model.cook.phase == .done)
        #expect(model.planner.kept.log.isEmpty)

        let writes = world.store.writes.count
        let finals = world.sharing.finals
        model.startAgain()
        defer { model.cancel() }

        #expect(model.cook.running == nil)
        #expect(model.planner.kept.log.count == 1)
        let egg = try #require(model.planner.kept.log.first)
        #expect(egg.yolkWord == nil)
        #expect(egg.white == nil)
        // In the store: the log written, then the cook removed.
        let after = world.store.writes.dropFirst(writes).map(\.key)
        let logged = try #require(after.firstIndex(of: "calibration.v5"))
        let cleared = try #require(after.firstIndex(of: "cookInProgress.v3"))
        #expect(logged < cleared)
        #expect(world.store.data(forKey: "cookInProgress.v3") == nil)
        #expect(world.sharing.finals > finals)
        await world.until("the planner to fold it") { !model.planner.draining }
    }

    // MARK: - Stores

    /// Under a newer build's mark this build writes nothing at all, and
    /// still times the egg.
    @Test func aNewerMarkWritesNothing() async throws {
        let world = World(store: MemoryStore([Stores.markKey: "9.0.0", Stores.buildKey: "1"]))
        #expect(Stores.readOnly)
        let cook = Cook()
        defer { cook.cancel() }
        await start(cook, world)
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
            "cookInProgress.v3", "calibration.v5", "boilMemory", "doneness", "start", "newestVersion",
            "newestBuild", "languageState", "alarmSound",
        ]
        let standard = UserDefaults.standard
        let before = keys.map { standard.object(forKey: $0).map { "\($0)" } }

        let world = World()
        let model = AppModel()
        model.appear()
        await world.until("the planner's answer") { model.planner.solution != nil && model.planner.task == nil }
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        model.boil()
        await world.settled(model.cook)
        let cooled = try #require(model.cook.coolDoneAt).timeIntervalSince1970
        world.clock.set(cooled + 5)
        await world.ticked(model.cook)
        model.startAgain()
        await world.until("the planner to fold it") { !model.planner.draining }

        let set = world.store.writes.filter { !$0.removed }.map(\.key)
        let wrote = world.log.events.compactMap { e -> String? in
            if case .wrote(let key, _, _) = e { return key }
            return nil
        }
        #expect(!set.isEmpty)
        #expect(set == wrote)
        #expect(Set(world.store.writes.map(\.key)).isSuperset(of: ["cookInProgress.v3", "calibration.v5"]))
        #expect(keys.map { standard.object(forKey: $0).map { "\($0)" } } == before)
    }
}
