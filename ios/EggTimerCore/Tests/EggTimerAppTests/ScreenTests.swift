import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

/// What the egg screen says and draws, read from the functions its views
/// call (Readings.swift, Sentence.swift), as a cook moves through it.
extension AppTests {
    /// The idle screen with its time decided on its pot's surface and its
    /// odds, the solve done.
    func decided(_ model: AppModel, _ world: World) async {
        await world.until("the idle time decided, with its odds") {
            !model.planner.solver.busy && model.planner.decision != nil && model.planner.oddsProfile != nil
        }
    }

    /// Words as read: a measure's no-break space as a space.
    func asRead(_ s: String) -> String {
        s.replacingOccurrences(of: "\u{00A0}", with: " ").replacingOccurrences(of: "\u{202F}", with: " ")
    }

    /// The egg in cross-section: idle, the egg aimed for, softer and firmer
    /// yolks for softer and firmer levels; at the start, the egg in the
    /// water from raw; cooling, still live; at Done, the egg as it ran.
    @Test func theEggAimedForInTheWaterAndAsItRan() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        model.appear()
        model.planner.start = .hot
        let cache = SectionCache()
        let now = { world.clock.seconds }
        var aimed: [Double] = []
        for level in [0.1, 0.95, 0.41] {
            model.planner.settings.doneness = level
            await world.until("the solve") { !model.planner.solver.busy && model.planner.solution != nil }
            let s = model.section(phase: .idle, nowS: now(), cache: cache)
            #expect(s.reading == .aim)
            aimed.append(try #require(yolkSet(s.view)))
        }
        #expect(aimed[0] < aimed[2] && aimed[2] < aimed[1])
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        let live = model.section(phase: model.cook.phase, nowS: now(), cache: cache)
        #expect(live.reading == .live)
        #expect(try #require(yolkSet(live.view)) < 0.01)
        let pull = try pullS(model.cook)
        await tick(at: pull + 1, model, world)
        world.clock.set(pull + 2)
        model.pulledOut()
        await world.settled(model.cook)
        #expect(model.section(phase: model.cook.phase, nowS: now(), cache: cache).reading == .live)
        await tick(at: try cooledS(model.cook) + 1, model, world)
        #expect(model.section(phase: .done, nowS: now(), cache: cache).reading == .ran)
    }

    /// The sentence never says when the eggs went in, idle, heating, cooking
    /// or corrected to the heat off: the same words until the heat goes
    /// off, then the standing method's. The start's panel says when.
    @Test func theSentenceNeverSaysWhenTheEggsWentIn() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        model.appear()
        await decided(model, world)
        let said = { SentenceWords(model.planner).plain }
        let idle = said()
        #expect(idle.contains(tr("setup.start.cold")))
        model.eggsIn()
        await world.until("the cook to start") { model.cook.running != nil && !model.starting }
        await world.settled(model.cook)
        let heating = said()
        let start = try #require(model.cook.running).startedAtS
        world.clock.set(start + 300)
        model.boil()
        await world.settled(model.cook)
        let cooking = said()
        model.edits.touchedElsewhere()
        #expect(model.edits.shownStart == start)
        await correct(at: start + 320, model, world) { model.planner.heatOff = true }
        let off = said()
        for line in [idle, heating, cooking, off] {
            #expect(line.range(of: #"\d:\d\d"#, options: .regularExpression) == nil, "\(line)")
        }
        #expect(heating == idle && cooking == idle)
        #expect(off.contains(tr("setup.start.coldStanding")))
    }

    /// A bowl of water, its water, four eggs and its temperature: in the
    /// sentence, the cook's choices, the cooling counted in the bowl, the
    /// card's cooling and the record.
    @Test func aBowlOfWaterAllTheWayToTheRecord() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        await started(model, world) { p in
            p.settings.unitsChosen = .metric
            p.settings.cooling = .bowl
            p.settings.bowlLitres = 1
            p.settings.bowlWaterC = 12
            p.settings.eggCount = 4
        }
        let choices = try #require(model.cook.running).choices
        #expect(choices.cooling == .bowl && choices.bowlLitres == 1 && choices.bowlWaterC == 12)
        #expect(choices.eggCount == 4)
        let said = asRead(SentenceWords(model.planner).plain)
        #expect(said.hasPrefix("4 × ") && said.hasSuffix("then into a bowl with 1 L of water at 12 °C."), "\(said)")
        let pull = try pullS(model.cook)
        await tick(at: pull + 1, model, world)
        world.clock.set(pull + 2)
        model.pulledOut()
        await world.settled(model.cook)
        let counted = try cooledS(model.cook) - (pull + 2)
        #expect(counted > 120 && counted < 600)
        await world.until("the card at the cooling") { world.card.last?.stage == .cooling }
        #expect(world.card.last?.cook.last == "bowl")
        await tick(at: try cooledS(model.cook) + 1, model, world)
        model.startAgain()
        await world.settled(model.cook)
        await world.learned(model.planner)
        let setup = try #require(model.planner.kept.log.last).setup
        #expect(setup.cooling == .bowl && setup.bowlLitres == 1 && setup.coolingWaterC == 12 && setup.eggCount == 4)
    }

    /// The bracket under the slider, idle at levels where "Most likely"
    /// shows under the certainty word and where it does not: its heavy
    /// stretch a word's whole band, inside the bracket, the word asked's
    /// around the thumb unless "Most likely" names another.
    @Test func theBracketsHeavyStretchIsTheMostLikelyWordsBand() async throws {
        let world = World()
        let model = world.model()
        defer { model.cook.killed() }
        model.appear()
        var seen: [Bool] = []
        for level in [0.5, 0.6, 0.8, 0.9] {
            model.planner.settings.doneness = level
            await decided(model, world)
            let words = try #require(SliderReading(model, phase: .idle).words)
            let b = BracketLevels(words)
            let likely = ReadoutWords(model, phase: .idle, nowS: world.clock.seconds).likelyShown
            let word = (0..<donenessAnchors.count).first {
                abs(wordBandLow($0) - b.likelyLow) <= 1e-9 && abs(wordBandHigh($0) - b.likelyHigh) <= 1e-9
            }
            #expect(word != nil, "at \(level) the band \(b.likelyLow)-\(b.likelyHigh) is no word's")
            #expect(b.low <= b.likelyLow && b.likelyHigh <= b.high)
            if likely {
                #expect(word != askedWord(level))
            } else {
                #expect(word == askedWord(level) && b.likelyLow <= level && level <= b.likelyHigh)
            }
            seen.append(likely)
        }
        #expect(seen.contains(true) && seen.contains(false), "\(seen)")
    }
}
