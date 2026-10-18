import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// Corrections while a cook runs, made as the controls make them: a value
/// changed on the planner is a change in hand (`InHand`), committed after its
/// settle on the cook's clock, on release, or when a button moves the cook on.
extension AppTests {
    /// `change` made so that its settle ends, and the cook is corrected, at
    /// `s`, epoch s (to the last bit or so): the cook as planned again.
    func correct(at s: Double, _ model: AppModel, _ world: World, _ change: () -> Void) async {
        let from = s - handSettleS
        world.clock.set(from)
        change()
        #expect(model.inHand.pending)
        // The settle's own sum, so the clock reaches its end exactly.
        world.clock.set(from + handSettleS)
        await world.until("the change committed") { !model.inHand.pending }
        await world.settled(model.cook)
    }

    /// The clock set to `s`, and the cook caught up with it.
    func tick(at s: Double, _ model: AppModel, _ world: World) async {
        world.clock.set(s)
        await world.ticked(model.cook)
    }

    /// Boiling corrected to cold, as the owner needed: Heating again, the pull
    /// later, its alarm and the card following in place, the next cook's
    /// setting written; a relaunch plans the same pull.
    @Test func boilingCorrectedToCold() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let pull0 = try pullS(model.cook)
        await correct(at: t0 + 60, model, world) { model.planner.start = .cold }
        let cook = try #require(model.cook.running)
        let pull = try pullS(model.cook)
        #expect(model.cook.phase == .heating)
        #expect(cook.choices.startMode == .cold)
        #expect(abs(try #require(cook.correctedAtS) - (t0 + 60)) <= 1e-6)
        #expect(pull > pull0 + 60)
        #expect(world.alarm.pending["cook.pull"] == pull)
        await world.until("the card updated") { world.card.calls.last?.updated?.ends == pull }
        #expect(world.card.calls.last?.updated?.stage == .heating)
        #expect(SettingsStore.read(classes: model.planner.sizeClasses).startMode == .cold)
        await kill(model, world)

        world.clock.set(t0 + 90)
        let again = world.model()
        defer { again.cook.killed() }
        again.appear()
        await world.settled(again.cook)
        #expect(again.cook.phase == .heating)
        let relaunchedPull = try pullS(again.cook)
        #expect(abs(relaunchedPull - pull) <= 1, "relaunched \(relaunchedPull - pull) s off")
    }

    /// Cold corrected to boiling after Rolling boil was pressed: the press
    /// kept, the pull sooner.
    @Test func coldCorrectedToBoilingAfterThePress() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        world.clock.advance(300)
        model.boil()
        await world.settled(model.cook)
        let press = try #require(model.cook.running?.events.boilAtS)
        let was = try pullS(model.cook)
        await correct(at: press + 60, model, world) { model.planner.start = .hot }
        #expect(model.cook.running?.events.boilAtS == press)
        #expect(model.cook.running?.choices.startMode == .hot)
        #expect(try pullS(model.cook) < was)
    }

    /// A heavier egg pulls later and a lighter sooner, each only once its
    /// settle is over, the alarm and the card following; back to the first
    /// size, the first plan exactly.
    @Test func heavierPullsLaterLighterSooner() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let pull0 = try pullS(model.cook)
        let size = model.planner.settings.sizeIndex
        let writes = world.store.writes.count
        world.clock.set(t0 + 30)
        model.planner.chooseSize(size + 1)
        #expect(model.inHand.pending)
        #expect(!world.store.writes.dropFirst(writes).contains { $0.key == Cook.savedKey })
        world.clock.advance(handSettleS)
        await world.until("the change committed") { !model.inHand.pending }
        await world.settled(model.cook)
        let heavier = try pullS(model.cook)
        #expect(heavier > pull0)
        #expect(world.alarm.pending["cook.pull"] == heavier)
        await correct(at: t0 + 40, model, world) { model.planner.chooseSize(size - 1) }
        #expect(try pullS(model.cook) < pull0)
        await correct(at: t0 + 50, model, world) { model.planner.chooseSize(size) }
        #expect(model.cook.plan?.decided != nil)
        #expect(abs(try pullS(model.cook) - pull0) <= 1e-6)
        await world.until("the card back at the pull") { world.card.last.map { abs($0.ends - pull0) <= 1 } == true }
    }

    /// A correction that makes the egg overdue rings at once; changed back
    /// within the grace, the cook is cooking again, the ring undone and the
    /// pull's alarm set again.
    @Test func overdueRingsAndBackUndoesIt() async throws {
        let world = World()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let pull0 = try pullS(model.cook)
        let size = model.planner.settings.sizeIndex
        await correct(at: pull0 - 40, model, world) { model.planner.chooseSize(0) }
        #expect(model.cook.plan?.overdue == true)
        #expect(abs(try pullS(model.cook) - (pull0 - 40)) <= 1e-3)
        #expect(model.cook.phase == .pull)
        #expect(world.ringer.rung == [.pull])
        await correct(at: pull0 - 35, model, world) { model.planner.chooseSize(size) }
        await world.ticked(model.cook)
        #expect(model.cook.phase == .cooking)
        #expect(model.cook.running?.events.rangAtS == nil)
        #expect(model.cook.running?.events.pulled == nil)
        #expect(world.stored?.events.rangAtS == nil)
        #expect(abs(try pullS(model.cook) - pull0) <= 1)
        #expect(world.alarm.pending["cook.pull"] == (try pullS(model.cook)))
    }

    /// The slider dragged through an overdue level rings nothing and commits
    /// nothing while it is held, the egg drawn as aimed; released at the
    /// level it had, nothing; released runny, corrected and rung.
    @Test func aDragThroughAnOverdueLevelRingsNothingBeforeRelease() async throws {
        let world = World()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let pull0 = try pullS(model.cook)
        let level = try #require(model.cook.running).choices.level
        let cache = SectionCache()
        world.clock.set(pull0 - 60)
        model.inHand.fingerDown(.level)
        for l in [0.3, 0.1, 0.0] { model.planner.settings.doneness = l }
        world.clock.advance(handPreviewS)
        await world.until("the aim drawn") { model.aimView != nil }
        #expect(model.section(phase: model.cook.phase, nowS: world.clock.seconds, cache: cache).reading == .aim)
        #expect(world.ringer.rung.isEmpty)
        #expect(model.cook.running?.correctedAtS == nil)
        for l in [0.2, level] { model.planner.settings.doneness = l }
        world.clock.advance(1)
        let writes = world.store.writes.count
        model.inHand.fingerUp()
        await world.settled(model.cook)
        #expect(!model.inHand.pending)
        #expect(!world.store.writes.dropFirst(writes).contains { $0.key == Cook.savedKey })
        #expect(world.ringer.rung.isEmpty)
        world.clock.set(pull0 - 50)
        model.inHand.fingerDown(.level)
        model.planner.settings.doneness = 0
        world.clock.advance(1)
        model.inHand.fingerUp()
        await world.settled(model.cook)
        #expect(try #require(model.cook.running).choices.level < 0.1)
        #expect(world.ringer.rung == [.pull])
    }

    /// A level set without a finger down (VoiceOver's adjust, a key): it
    /// settles, the cook is corrected, and the slider stays where it was
    /// set as the aimed-for egg goes, before the pull as after a commit.
    @Test func aLevelSetWithoutAFingerStaysOnTheSliderOnceCommitted() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let pull0 = try pullS(model.cook)
        await correct(at: pull0 - 120, model, world) { model.planner.settings.doneness = 0.62 }
        await world.until("the aim gone") { model.aimView == nil && model.inHand.aim == nil }
        await world.settled(model.cook)
        #expect(try #require(model.cook.running).choices.level == 0.62)
        #expect(model.planner.settings.doneness == 0.62)
    }

    /// When the eggs went in, corrected a minute at a time: stopped with its
    /// reason at now, at the press of Rolling boil and two hours before
    /// Start, each said to VoiceOver; the start's panel shows the start.
    @Test func theStartCorrectedAMinuteAtATime() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let cook = try #require(model.cook.running)
        let t0 = cook.startedAtS
        #expect(model.inHand.shownStart == t0)
        await correct(at: t0 + 150 + handSettleS, model, world) {
            for _ in 0..<3 { model.inHand.stepStart(up: true) }
            #expect(model.inHand.startLimit?.kind == .now)
        }
        let moved = try #require(model.cook.running).startedAtS
        #expect(abs(moved - (t0 + 150)) <= 1e-6)
        #expect(model.inHand.shownStart == moved)
        let press = t0 + 390
        world.clock.set(press)
        model.boil()
        await world.settled(model.cook)
        await correct(at: press + 60 + handSettleS, model, world) {
            for _ in 0..<5 { model.inHand.stepStart(up: true) }
            #expect(model.inHand.startLimit?.kind == .boil)
        }
        #expect(model.cook.running?.startedAtS == press)
        await correct(at: press + 70 + handSettleS, model, world) {
            for _ in 0..<140 { model.inHand.stepStart(up: false) }
            #expect(model.inHand.startLimit?.kind == .earliest)
        }
        #expect(model.cook.running?.startedAtS == cook.idMs / 1000 - 7200)
        let said = world.announced.all
        #expect(said.count >= 3)
        #expect(said.first == tr(.`controls.startedAt.latestNow`))
    }

    /// A change in hand, then the start's − with no finger down first (as
    /// VoiceOver adjusts it): the change in hand is committed alone, as it
    /// was, and the start is in hand in its turn, committed after its own
    /// settle - two corrections, as another control's change makes.
    @Test func theStartAfterAnotherChangeIsCommittedInItsTurn() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world, .cold)
        let t0 = try #require(model.cook.running).startedAtS
        let eggs = model.planner.settings.eggCount
        world.clock.set(t0 + 30)
        model.planner.settings.eggCount = eggs + 1
        #expect(model.inHand.pending)
        #expect(model.inHand.stepStart(up: false))
        await world.settled(model.cook)
        #expect(model.cook.running?.choices.eggCount == Double(eggs + 1), "the change in hand committed")
        #expect(model.cook.running?.startedAtS == t0, "without the start's")
        #expect(model.inHand.pending, "which is in hand in its turn")
        #expect(model.inHand.shownStart == t0 - 60)
        world.clock.advance(handSettleS)
        await world.until("the start committed") { !model.inHand.pending }
        await world.settled(model.cook)
        #expect(model.cook.running?.startedAtS == t0 - 60)
        #expect(model.cook.running?.choices.eggCount == Double(eggs + 1))
    }

    /// Settings' water while a cook runs corrects the cook and the next
    /// cook's, and writes nothing else; the pull brings the egg's page back.
    @Test func waterChangedInSettingsCorrectsTheCookAndTheNext() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let pull0 = try pullS(model.cook)
        var want = SettingsStore.read(classes: model.planner.sizeClasses)
        await correct(at: t0 + 20, model, world) { model.planner.settings.waterLitres = 1 }
        #expect(model.cook.running?.choices.waterLitres == 1)
        #expect(try pullS(model.cook) != pull0)
        want.waterLitres = 1
        #expect(SettingsStore.read(classes: model.planner.sizeClasses) == want)
        await tick(at: try pullS(model.cook) + 1, model, world)
        #expect(bringsEggBack(model.cook.phase))
    }

    /// A larger egg at Done makes the record again on the calibration before
    /// this egg: the answer and the time that ran kept, a new forecast; back
    /// to the first size, the first record to the bit, and Done showing the
    /// cook as it ran.
    @Test func aCorrectionAtDoneMakesTheRecordAgainAndBackGivesTheFirst() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let peak0 = try #require(model.cook.shownPeakYolkC)
        let size = model.planner.settings.sizeIndex
        let done = world.clock.seconds
        await correct(at: done + 5, model, world) { model.planner.chooseSize(size + 1) }
        await world.until("the record made again") {
            model.planner.kept.log.last?.egg.massG != first.egg.massG
        }
        await world.learned(model.planner)
        let heavier = try #require(model.planner.kept.log.last)
        #expect(model.planner.kept.log.count == 1)
        #expect(heavier.yolkWord == first.yolkWord)
        #expect(heavier.recommendedS == first.recommendedS)
        #expect(heavier.forecast != first.forecast)
        await correct(at: done + 15, model, world) { model.planner.chooseSize(size) }
        await world.until("the first record again") {
            model.planner.kept.log.last == first
        }
        await world.learned(model.planner)
        #expect(abs(try #require(model.cook.shownPeakYolkC) - peak0) < 0.01)
    }

    /// After the pull the slider only previews: the egg aimed for while it
    /// is held, then the egg as it ran again; the cook not corrected, the
    /// record as it was, the slider back at the cook's level.
    @Test func afterThePullTheSliderOnlyPreviews() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let first = try await answeredAtDone(model, world)
        let stored0 = try #require(world.stored)
        let cache = SectionCache()
        world.clock.advance(5)
        model.inHand.fingerDown(.level)
        for l in [0.6, 0.9] { model.planner.settings.doneness = l }
        world.clock.advance(handPreviewS)
        await world.until("the aim drawn") { model.aimView != nil }
        #expect(model.section(phase: .done, nowS: world.clock.seconds, cache: cache).reading == .aim)
        world.clock.advance(2)
        model.inHand.fingerUp()
        await world.settled(model.cook)
        world.clock.advance(handSettleS)
        await world.until("the aim gone") { model.aimView == nil }
        #expect(model.section(phase: .done, nowS: world.clock.seconds, cache: cache).reading == .ran)
        let stored = try #require(world.stored)
        #expect(stored.correctedAtS == stored0.correctedAtS)
        #expect(stored.choices.level == stored0.choices.level)
        #expect(model.planner.kept.log == [first])
        #expect(model.planner.settings.doneness == stored0.choices.level)
    }

    /// A probe reading saved at Done while a larger egg settles: the change
    /// committed and the cook corrected first, so the reading is scored on
    /// the egg the controls say, and the record logged with it is the
    /// corrected egg's.
    @Test func aProbeSavedWhileAChangeSettlesIsScoredOnTheCorrectedCook() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        try await toDone(model, world)
        // To the hundredth the record keeps.
        let peak = (try #require(model.cook.shownPeakYolkC) * 100).rounded() / 100
        let mass0 = try #require(model.cook.running).choices.massKg
        world.clock.advance(5)
        model.planner.chooseSize(model.planner.settings.sizeIndex + 1)
        #expect(model.inHand.pending)
        let saved = await model.saveProbe(readingC: peak)
        #expect(!model.inHand.pending, "committed by the save")
        let mass = try #require(model.cook.running).choices.massKg
        #expect(mass > mass0, "the cook corrected before the reading was scored")
        #expect(saved == .taken(peak))
        await world.settled(model.cook)
        await world.learned(model.planner)
        let record = try #require(model.planner.kept.log.last)
        #expect(record.probe?.centreC == peak)
        #expect(abs(record.egg.massG - mass * 1000) < 0.01, "the corrected egg's record")
    }

    /// A hot cook whose pull's grace ran out unanswered, so the clock
    /// assumed the eggs came out, corrected to cold 30 s after the pull: the
    /// plan asks whether they are still in the water. The pull.
    func askedStillIn(_ model: AppModel, _ world: World) async throws -> Double {
        await started(model, world)
        let pull = try pullS(model.cook)
        await tick(at: pull + 25, model, world)
        let pulled = try #require(model.cook.running?.events.pulled)
        #expect(pulled.by == .timeout && !pulled.confirmed)
        await correct(at: pull + 30, model, world) { model.planner.start = .cold }
        #expect(model.cook.plan.map(asksIfStillIn) == true)
        return pull
    }

    /// "Still in the water?" while it asks: nothing scheduled, the card at
    /// the pull, no caveat about the white, nothing past the question as
    /// the cooling's end passes; yes, and the cook is timed again.
    @Test func stillInTheWaterYes() async throws {
        let world = World()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
        defer { model.cook.killed() }
        let pull = try await askedStillIn(model, world)
        #expect(world.alarm.pending.isEmpty)
        #expect(world.card.last?.stage == .pull)
        let words = ReadoutWords(model, phase: model.cook.phase, nowS: world.clock.seconds)
        #expect(words.asking)
        #expect(!words.whiteRunny)
        let seen = world.log.events.count
        await tick(at: pull + 640, model, world)
        #expect(!world.log.events.dropFirst(seen).contains(.phase(phase: Phase.done.rawValue)))
        #expect(world.ringer.rung.isEmpty)
        #expect(world.stored?.events.cooledAtS == nil)
        world.clock.set(pull + 700)
        model.stillIn()
        await world.quiet(model.cook)
        #expect([Phase.heating, .pull].contains(model.cook.phase))
        #expect(model.cook.running?.events.pulled == nil)
        #expect(world.stored?.events.pulled == nil)
        #expect(model.cook.plan.map(asksIfStillIn) == false)
    }

    /// "Still in the water?" answered no: the pull the clock assumed stands,
    /// confirmed, and the record is made again for cold water.
    @Test func stillInTheWaterNo() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let pull = try await askedStillIn(model, world)
        world.clock.set(pull + 40)
        model.stillOut()
        await world.settled(model.cook)
        let cook = try #require(world.stored)
        #expect(cook.events.pulled?.by == .timeout)
        #expect(cook.events.pulled?.confirmed == true)
        #expect(cook.choices.startMode == .cold)
        #expect(cook.asRan?.correctedAtS == cook.correctedAtS)
        #expect(model.cook.plan.map(asksIfStillIn) == false)
    }

    /// Corrected to cold and left heating: on the guess at first, then the
    /// slow hob lengthens it and the time heated counts up, on the clock
    /// and on the card.
    @Test func leftHeatingTheSlowHobCountsUp() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        await correct(at: t0 + 300, model, world) { model.planner.start = .cold }
        #expect(model.cook.phase == .heating)
        #expect(model.cook.plan.map(guessLengthened) == false)
        world.clock.set(t0 + 16 * 60)
        await world.until("the slow hob lengthened") { model.cook.plan.map(guessLengthened) == true }
        await world.ticked(model.cook)
        #expect(ReadoutWords(model, phase: .heating, nowS: t0 + 16 * 60).big == "16:00")
        await world.until("the card counting up") { world.card.last?.up == true }
        #expect(world.card.last?.stage == .heating)
    }

    /// A correction the white never sets in gets the longest time the pan
    /// can give, and the slot says so.
    @Test func aCorrectionTheWhiteNeverSetsInIsSaidInTheSlot() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let planner = model.planner
        await correct(at: t0 + 20, model, world) { planner.heatOff = true }
        await correct(at: t0 + 30, model, world) { planner.chooseSize(0) }
        await correct(at: t0 + 40, model, world) { planner.settings.eggCount = 1 }
        await correct(at: t0 + 50, model, world) { planner.settings.waterLitres = 0.5 }
        #expect(model.runningWarning == tr(.`refusal.whiteNeverSets`))
    }

    /// On the counter, Done at the out, Jammy, then the cooling corrected to
    /// ice: still Done, nothing rung, no cooling alarm or card brought back,
    /// and the record an ice bath until the correction.
    @Test func aCoolingChangeAtDoneStaysDone() async throws {
        let world = World()
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world) { $0.settings.cooling = .counter }
        let pull0 = try pullS(model.cook)
        await tick(at: pull0 + 1, model, world)
        world.clock.set(pull0 + 2)
        model.pulledOut()
        await world.settled(model.cook)
        await world.ticked(model.cook)
        #expect(model.cook.phase == .done)
        world.clock.set(pull0 + 60)
        model.answer(yolk: .jammy, white: nil)
        await world.learned(model.planner)
        let (scheduled, calls, seen) = (world.alarm.scheduled.count, world.card.calls.count, world.log.events.count)
        await correct(at: pull0 + 70, model, world) { model.planner.settings.cooling = .ice }
        let cook = try #require(model.cook.running)
        #expect(cook.choices.cooling == .ice)
        #expect(cook.events.cooledAtS != nil)
        for s in [71.0, 100, 200, 400] { #expect(model.cook.phase(atS: pull0 + s) == .done) }
        await tick(at: pull0 + 400, model, world)
        #expect(!world.log.events.dropFirst(seen).contains(.phase(phase: Phase.cooling.rawValue)))
        #expect(world.ringer.rung.isEmpty)
        #expect(!world.alarm.scheduled.dropFirst(scheduled).contains { $0.cooledS != nil })
        #expect(!world.card.calls.dropFirst(calls).contains { $0.shown != nil })
        await world.until("the record made again") {
            model.planner.kept.log.last?.setup.cooling == .ice
        }
        await world.learned(model.planner)
        let egg = try #require(model.planner.kept.log.last)
        #expect(egg.yolkWord == .jammy)
        #expect(egg.cooledS <= 68 + 1e-6)
    }

    /// A pull the clock assumed, Jammy at Done, then corrected to cold
    /// water: the pull confirmed, nothing asked, still Done.
    @Test func anAnsweredAssumedPullStands() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        await tick(at: try pullS(model.cook) + pullGraceSeconds + 1, model, world)
        #expect(model.cook.phase == .cooling)
        let cooled = try cooledS(model.cook)
        await tick(at: cooled + 1, model, world)
        world.clock.set(cooled + 5)
        model.answer(yolk: .jammy, white: nil)
        await world.learned(model.planner)
        await correct(at: cooled + 10, model, world) { model.planner.start = .cold }
        #expect(model.cook.plan.map(asksIfStillIn) == false)
        let pulled = try #require(model.cook.running?.events.pulled)
        #expect(pulled.by == .timeout && pulled.confirmed)
        #expect(model.cook.phase == .done)
    }

    /// A lighter egg 15 s into the pull keeps the pull that rang and its
    /// grace: nothing rings again, and the cooling starts at the grace's
    /// first end. With no notifications, so the app rings every deadline.
    @Test func aCorrectionInTheGraceKeepsThePullThatRang() async throws {
        let world = World()
        world.alarm.authorized = false
        world.ringer.onScreenSinceS = world.clock.seconds
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let pull0 = try pullS(model.cook)
        await tick(at: pull0 + 1, model, world)
        #expect(model.cook.phase == .pull)
        #expect(world.ringer.rung == [.pull])
        await correct(at: pull0 + 15, model, world) {
            model.planner.chooseSize(model.planner.settings.sizeIndex - 1)
        }
        #expect(abs(try pullS(model.cook) - pull0) <= 1e-3)
        await world.ticked(model.cook)
        #expect(world.ringer.rung == [.pull])
        await tick(at: pull0 + pullGraceSeconds + 1, model, world)
        #expect(model.cook.phase == .cooling)
        let pulled = try #require(model.cook.running?.events.pulled)
        #expect(abs(pulled.dueS - pull0) <= 1e-3)
        #expect(abs(pulled.outS - (pull0 + pullGraceSeconds)) <= 1e-3)
        #expect(world.ringer.rung == [.pull])
    }

    /// Once cooking, the time range the certainty line opens is when to
    /// take the eggs out, as times of day; corrected to cold and left under
    /// a lengthening slow hob, it moves with the guess.
    @Test func onceCookingTheRangeIsWhenToTakeTheEggsOut() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let lead = { (key: CopyKey) in
            tr(key, ["low": .text("\u{1}"), "high": .text("\u{1}")]).components(separatedBy: "\u{1}")[0]
        }
        let out = lead(.`certainty.timeOut`)
        #expect(out != lead(.`certainty.time`))
        let range = { ReadoutWords(model, phase: model.cook.phase, nowS: world.clock.seconds).range ?? "" }
        await tick(at: t0 + 299, model, world)
        #expect(range().hasPrefix(out))
        await correct(at: t0 + 300, model, world) { model.planner.start = .cold }
        world.clock.set(t0 + 16 * 60)
        await world.until("the slow hob lengthened") { model.cook.plan.map(guessLengthened) == true }
        await world.ticked(model.cook)
        let a = range()
        let next = model.cook.plan?.slowHobAtS
        world.clock.set(t0 + 20 * 60)
        await world.until("planned again") { model.cook.plan?.slowHobAtS != next }
        await world.ticked(model.cook)
        let b = range()
        #expect(a.hasPrefix(out) && b.hasPrefix(out))
        #expect(a != b)
    }
    /// A size, then a weight: both the egg's mass, one group, so one commit
    /// a settle after the weight.
    @Test func aSizeThenAWeightIsOneCommit() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let log = model.cook.running?.log.count ?? 0
        world.clock.set(t0 + 30)
        model.planner.chooseSize(model.planner.settings.sizeIndex + 1)
        world.clock.set(t0 + 31)
        model.planner.weigh(70)
        #expect(model.cook.running?.log.count == log, "nothing committed between")
        world.clock.set(t0 + 31 + handSettleS)
        await world.until("the change committed") { !model.inHand.pending }
        await world.settled(model.cook)
        let cook = try #require(model.cook.running)
        #expect(cook.log.count == log + 1, "one correction")
        #expect(abs(cook.choices.massKg - 0.070) <= 1e-9)
    }

    /// The thermometer switched on mid-cook: another control, so the change in
    /// hand is committed at once, and the switch written for the next cook.
    @Test func theThermometerMidCookCommitsAndIsWritten() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let count = model.planner.settings.eggCount
        world.clock.set(t0 + 30)
        model.planner.settings.eggCount = count + 1
        #expect(model.inHand.pending)
        model.planner.setProbe(!model.planner.settings.probe)
        #expect(!model.inHand.pending, "committed at the switch")
        await world.settled(model.cook)
        #expect(model.cook.running?.choices.eggCount == Double(count + 1))
        #expect(SettingsStore.read(classes: model.planner.sizeClasses).probe == model.planner.settings.probe)
    }

    /// A tap on the egg turns it over to how hot and back (`DECISIONS.md` 52):
    /// written at once, idle or mid-cook, and mid-cook a way of looking, not a
    /// correction: nothing goes in hand, a change already in hand stays there,
    /// and the cook's choices are not written as the settings.
    @Test func turningTheEggIsWrittenAndPutsNothingInHand() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        let classes = model.planner.sizeClasses
        #expect(model.planner.settings.eggView == .set, "how set, fresh")
        model.planner.turnEgg()
        #expect(model.planner.settings.eggView == .heat)
        #expect(SettingsStore.read(classes: classes).eggView == .heat, "written idle")
        await started(model, world)
        let t0 = try #require(model.cook.running).startedAtS
        let stored = SettingsStore.read(classes: classes)
        world.clock.set(t0 + 30)
        model.planner.settings.eggCount = stored.eggCount + 1
        #expect(model.inHand.pending)
        model.planner.turnEgg()
        #expect(model.planner.settings.eggView == .set)
        #expect(model.inHand.pending, "the change in hand is still in hand")
        let written = SettingsStore.read(classes: classes)
        #expect(written.eggView == .set, "written mid-cook")
        #expect(written.eggCount == stored.eggCount, "the count in hand not written by the turn")
        model.planner.turnEgg()
        #expect(SettingsStore.read(classes: classes).eggView == .heat)
    }
}
