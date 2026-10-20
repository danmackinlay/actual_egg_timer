import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// Every words object the egg screen draws, built over the choices a cook can
/// make and the phases a cook passes through. `tr` stops a debug build on
/// arguments that are not exactly its key's, which crashes this test as it
/// stopped the app when sous-vide was chosen; and nothing drawn may show a
/// placeholder raw, which is what a missing argument looks like in either
/// build.
///
/// Pruned to the choices that change which keys are drawn, so it runs in
/// seconds:
/// - the setup, every start, origin, cooling (with its water's temperature
///   given and not), heat kept or off, metric and Imperial, one egg and
///   four, in English and in the English of 1750: the full product, without
///   waiting for a solve, since a choice changes the keys before the answer
///   comes;
/// - a cook to Done for each cooling, the four of start and heat among them,
///   the probe asked for in one, each in its own units, count and language:
///   which keys a phase draws is the phase's, its start and heat, and its
///   cooling, and never the product of the cooling with the start;
/// - the sous-vide words at every duration and start phrase, the warning
///   line at every verdict and cooling, the texture note across its bands.
///
/// en-US cannot be chosen here: its overlay comes from the phone's preferred
/// languages (`catalogueChain`). It draws the same keys, and `npm test` holds
/// every language to the English placeholders. The views' own words
/// (ios/App) are not reached here: `npm test` reads each literal call
/// (tools/copyArgs.ts), and `everyKeyAViewDrawsTakesWhatItIsGiven` the
/// keys they compute.
extension AppTests {
    static let placeholder = #/\{[A-Za-z][A-Za-z0-9_]*\}/#

    /// No placeholder shown raw, and no key in place of its words.
    func expectDrawn(_ words: [String], _ at: String, sourceLocation: SourceLocation = #_sourceLocation) {
        for w in words {
            #expect(w.firstMatch(of: Self.placeholder) == nil, "\(at): \(w)", sourceLocation: sourceLocation)
            #expect(CopyKey(rawValue: w) == nil, "\(at): a key shown, \(w)", sourceLocation: sourceLocation)
        }
    }

    /// What the egg screen says at the moment, in words: the sentence and its
    /// clauses' panels, the readout and what its certainty opens, the phase's
    /// hint as the view renders it, the slot, the level's name, the card.
    func drawn(_ model: AppModel, _ world: World) -> [String] {
        let planner = model.planner
        let sentence = SentenceWords(planner)
        var out = [sentence.plain, planner.label, planner.warning]
        for t in sentence.texts.values { out += [t.text, t.label, t.value] }
        let phase = model.cook.phase
        let readout = ReadoutWords(model, phase: phase, nowS: world.clock.seconds)
        out += [readout.big, readout.sub] + readout.opened
        if let range = readout.range { out.append(range) }
        // The hint as PhaseActions renders it: idle, the core's key with the
        // time; running, the readout's line with its numbers.
        if phase == .idle {
            if let hint = model.keys(.idle).hint { out.append(trChosen(hint, ["time": .text("0:00")])) }
        } else if let line = readout.readout?.hint {
            out.append(trChosen(line.key, line.args.mapValues { .number($0) }))
        }
        if let warning = model.runningWarning { out.append(warning) }
        if let solution = model.cook.plan?.solution ?? planner.solution {
            out.append(textureNote(
                yolkDoseMin: solution.result.yolkDoseMin, whiteDoseMin: solution.result.whiteDoseMin,
                whiteSets: solution.whiteSets
            ))
        }
        if let card = world.card.last, let lang = model.cook.running?.lang {
            out += [card.stage.title(in: lang)] + card.cook
        }
        return out
    }

    /// The setup's words over every choice that changes which keys say it.
    @Test func theSetupsWordsForEveryChoice() async throws {
        let world = World()
        let model = world.model()
        defer {
            model.cook.killed()
            Copy.use("en")
        }
        let planner = model.planner
        var drawnCount = 0
        for lang in languages.map(\.tag) {
            Copy.use(lang)
            for units in UnitSystem.allCases {
                for count in [1, 4] {
                    for start in StartChoice.allCases {
                        for heatOff in [false, true] {
                            for cooling in Cooling.allCases {
                                for waterGiven in [false, true] {
                                    for from in EggFrom.allCases {
                                        var s = planner.settings
                                        s.unitsChosen = units
                                        s.eggCount = count
                                        s.startMode = start == .hot ? .hot : .cold
                                        s.afterBoil = heatOff ? .off : .hold
                                        s.cooling = cooling
                                        s.tapWaterC = waterGiven ? 14 : nil
                                        s.bowlWaterC = waterGiven ? 12 : nil
                                        s.startTempMode = from
                                        planner.settings = s
                                        planner.start = start
                                        let at = "\(lang) \(units) \(count) \(start) heatOff \(heatOff) \(cooling) water \(waterGiven) \(from)"
                                        expectDrawn(drawn(model, world), at)
                                        if start == .sousVide {
                                            let sv = sousVideCopy(planner.sousVide, now: Date(timeIntervalSince1970: world.clock.seconds), units: units)
                                            expectDrawn([sv.headline, sv.subline, sv.note, sv.warn, sv.hint], at)
                                        }
                                        drawnCount += 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        #expect(drawnCount == 2 * 2 * 2 * 3 * 2 * 5 * 2 * 3)
        await world.until("the last solve") { !planner.solver.busy }
    }

    /// A cook to Done for each cooling, the four of start and heat among
    /// them, each drawn idle with its time decided and at every phase it
    /// passes through.
    @Test func everyPhasesWordsForEachCooling() async throws {
        let runs: [(StartChoice, Bool, Cooling, UnitSystem, Int, String, Bool)] = [
            (.cold, false, .ice, .metric, 1, "en", false),
            (.cold, true, .tap, .imperial, 4, "en-x-1750", false),
            (.hot, true, .bowl, .imperial, 1, "en", true),
            (.hot, false, .counter, .metric, 4, "en", false),
            (.cold, false, .eggCup, .metric, 2, "en-x-1750", false),
        ]
        defer { Copy.use("en") }
        for (start, heatOff, cooling, units, count, lang, probe) in runs {
            Copy.use(lang)
            let world = World()
            let model = world.model()
            defer { model.cook.killed() }
            let at = { "\(start) heatOff \(heatOff) \(cooling) \(units) \(count) \(lang): \(model.cook.phase)" }
            // A hot start with the heat off never sets the white at the
            // defaults, and a cook that never sets it never starts: its heat
            // goes off as a correction, a minute in, as a cook turns it off.
            let offAtStart = heatOff && start == .cold
            model.appear()
            model.planner.start = start
            model.planner.settings.unitsChosen = units
            model.planner.settings.eggCount = count
            model.planner.settings.cooling = cooling
            model.planner.heatOff = offAtStart
            model.planner.setProbe(probe)
            // Idle, the time decided: what pressing the certainty opens.
            await decided(model, world)
            expectDrawn(drawn(model, world), at())
            #expect(!ReadoutWords(model, phase: .idle, nowS: world.clock.seconds).opened.isEmpty, "\(at())")
            model.eggsIn()
            await world.until("the cook to start") { model.cook.running != nil && !model.starting }
            await world.settled(model.cook)
            var seen: [Phase] = [model.cook.phase]
            expectDrawn(drawn(model, world), at())
            if model.cook.phase == .heating {
                world.clock.advance(300)
                model.boil()
                await world.settled(model.cook)
                seen.append(model.cook.phase)
                expectDrawn(drawn(model, world), at())
            }
            if heatOff && !offAtStart {
                await correct(at: world.clock.seconds + 60, model, world) { model.planner.heatOff = true }
                #expect(model.cook.running?.choices.afterBoil == .off, "\(at())")
                expectDrawn(drawn(model, world), at())
            }
            let pull = try pullS(model.cook)
            await tick(at: pull + 1, model, world)
            seen.append(model.cook.phase)
            expectDrawn(drawn(model, world), at())
            world.clock.set(pull + 2)
            model.pulledOut()
            await world.settled(model.cook)
            seen.append(model.cook.phase)
            expectDrawn(drawn(model, world), at())
            // On the counter nothing is timed after the pull.
            if let cooled = model.cook.plan?.deadlines.coolEndS {
                await tick(at: cooled + 1, model, world)
                seen.append(model.cook.phase)
                expectDrawn(drawn(model, world), at())
            }
            #expect(seen == (start == .cold ? [.heating, .cooking] : [.cooking]) + [.pull]
                + (cooling == .counter ? [.done] : [.cooling, .done]), "\(at())")
            model.cook.killed()
            await world.learned(model.planner)
        }
    }

    /// The sous-vide words at every duration and start phrase, the warning
    /// line at every verdict and cooling, low odds or not, and the texture
    /// note across its bands, in both languages and both systems.
    @Test func theWordsMadeFromTheCoresKeys() async throws {
        let world = World()
        let planner = world.planner()
        defer { Copy.use("en") }
        let hour = 3600.0, day = 86400.0
        // Each of longDuration's units, and each of startPhrase's: today,
        // yesterday, a weekday, last week, weeks and months ago.
        let totals = [600, 2 * hour, 30 * hour, 3 * day, 10 * day, 30 * day, 120 * day]
        let anchor = { (key: CopyKey) in #"{"key":"\#(key.rawValue)","level":0.5,"approxPeakYolk_C":65}"# }
        let decoder = JSONDecoder()
        for lang in languages.map(\.tag) {
            Copy.use(lang)
            for units in UnitSystem.allCases {
                for total in totals {
                    for whiteBound in [false, true] {
                        let est = try decoder.decode(SousVideEstimate.self, from: Data(#"""
                            {"bath_C":64,"equilibrate_s":600,"yolkHold_s":600,"whiteHold_s":600,"total_s":\#(total),"whiteBound":\#(whiteBound)}
                            """#.utf8))
                        let sv = sousVideCopy(est, now: Date(timeIntervalSince1970: world.clock.seconds), units: units)
                        expectDrawn([sv.headline, sv.subline, sv.note, sv.warn, sv.hint], "\(lang) \(units) \(total)")
                    }
                }
                for kind in ["none", "tooSoftForWhite", "harderThanPanReaches", "whiteNeverSets"] {
                    for cooling in Cooling.allCases {
                        for lowOdds in [false, true] {
                            let v = try decoder.decode(Verdict.self, from: Data(#"""
                                {"kind":"\#(kind)","wanted":\#(anchor(donenessAnchors[0].key)),"limit":\#(anchor(donenessAnchors[2].key)),"worthSaying":true}
                                """#.utf8))
                            var setup = planner.setup
                            setup.cooling = cooling
                            let line = warningText(v, lowOdds: lowOdds, level: 0.5, setup: setup, water: showIn(units, .water, 2))
                            expectDrawn([line], "\(lang) \(units) \(kind) \(cooling) \(lowOdds)")
                        }
                    }
                }
            }
            for yolk in [0.01, 0.05, 0.3, 2.0, 20.0, 300.0, 2000.0, 20000.0] {
                for white in [0.005, 0.05, 0.5, 50.0] {
                    for sets in [false, true] {
                        expectDrawn([textureNote(yolkDoseMin: yolk, whiteDoseMin: white, whiteSets: sets)], "\(lang) \(yolk) \(white)")
                    }
                }
            }
        }
        await world.until("the planner's first solve") { !planner.solver.busy }
    }

    /// A key a view (ios/App, ios/Widget) computes and renders with `tr`,
    /// from each place it can come from, takes the arguments the view gives:
    /// none, or for a measure, its value, and for a size, its mass. `trChosen`
    /// is given every argument any of its keys takes, so a key it renders
    /// takes no other. Read from the views by hand (tools/copyArgs.ts lists
    /// each call it cannot read, with `--unread`): a view that computes its
    /// key somewhere new is not seen here.
    @Test func everyKeyAViewDrawsTakesWhatItIsGiven() {
        let takes = { (key: CopyKey) in CopyKey.argumentNames[key] ?? [] }
        var none: [CopyKey] = []
        // The alarm's and the card's pull line, the pulled button, the
        // certainty word, the doneness words, the weekday.
        for c in Cooling.allCases {
            none += [pullLineKey(cooling: c.rawValue), pulledKey(c)]
        }
        none.append(pullLineKey(cooling: "anything else"))
        none += [Certainty.veryCertain, .ballpark, .wildGuess].map(certaintyKey)
        none += donenessAnchors.map(\.key)
        none += (0..<7).map(weekdayKey)
        // Help's advice, which the core chooses (`protocolAdvice`).
        none += CopyKey.allCases.filter { $0.rawValue.hasPrefix("advice.") }
        // The phase's label, its button, the heating hint (rendered with
        // none), and the clauses' labels; the idle hint is given the time,
        // the cooking hint the boil.
        for phase in [Phase.idle, .heating, .cooking, .pull, .cooling, .done] {
            for start in StartMode.allCases {
                for after in HeatAfterBoil.allCases {
                    for cooling in Cooling.allCases {
                        for flags in 0..<8 {
                            let k = phaseKeys(PhaseFacts(
                                phase: phase, startMode: start, afterBoil: after, cooling: cooling,
                                whiteSets: flags & 1 != 0, boilKnown: flags & 2 != 0, probeWanted: flags & 4 != 0
                            ))
                            none.append(k.label)
                            if let action = k.action { none.append(action) }
                            if let hint = k.hint {
                                switch phase {
                                case .idle: #expect(takes(hint).isSubset(of: ["time"]), "\(hint)")
                                case .cooking: #expect(takes(hint).isSubset(of: ["boiling"]), "\(hint)")
                                case .heating: none.append(hint)
                                default: break // the readout's line, with its own numbers
                                }
                            }
                        }
                        for from in EggFrom.allCases {
                            for sous in [false, true] {
                                for given in [false, true] {
                                    let keys = clauseKeys(ClauseFacts(
                                        eggFrom: from, startMode: start, sousVide: sous, afterBoil: after,
                                        cooling: cooling, coolingWaterGiven: given
                                    ))
                                    none += keys.values.map(\.label)
                                }
                            }
                        }
                    }
                }
            }
        }
        for key in none { #expect(takes(key).isEmpty, "\(key) takes \(takes(key).sorted()), and is given none") }
        // A measure's unit alone, and its value in its format.
        for q in Quantity.allCases {
            for system in UnitSystem.allCases {
                for region in [nil, "US", "GB", "AU"] as [String?] {
                    let m = measureFor(q, system: system, region: region)
                    #expect(takes(m.unitKey).isEmpty, "\(m.unitKey)")
                    #expect(takes(m.formatKey) == ["value"], "\(m.formatKey)")
                }
            }
        }
        // A size's name, with its mass.
        for region in [nil, "US"] as [String?] {
            for c in sizeClassesFor(region: region) {
                for system in UnitSystem.allCases {
                    let label = sizeClassLabel(c, system: system)
                    #expect(takes(label.key) == ["mass"], "\(label.key)")
                    #expect(takes(label.mass.key) == ["value"], "\(label.mass.key)")
                }
            }
        }
        // The start's limit, given the time.
        for kind in [StartLimit.Kind.now, .boil, .pull, .earliest] {
            #expect(takes(kind.key).isSubset(of: ["time"]), "\(kind.key)")
        }
    }
}
