import Foundation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// The setup sentence's words (UI.md section 5; the web's `renderSentence`):
/// the catalogue's template, each placeholder marked where its clause goes,
/// and each clause's own words. The screen (`SetupSentence`) makes the
/// clauses links; this is what it says. Sous-vide says less, because where
/// the egg comes from and how it cools change nothing there.
@MainActor
public struct SentenceWords {
    /// The template with each clause's place marked (`mark`).
    public let template: String
    public let texts: [Clause: ClauseText]

    public init(_ planner: Planner) {
        texts = clauseTexts(SetupFacts(planner))
        let args: CopyArgs = [
            "egg": .text(Self.mark(.egg)), "from": .text(Self.mark(.from)),
            "start": .text(Self.mark(.start)), "cooling": .text(Self.mark(.cooling)),
        ]
        template = planner.isSousVide ? tr(.`setup.sentenceSousVide`, args) : tr(.`setup.sentence`, args)
    }

    /// A clause's place in the template: its name between characters no
    /// catalogue will contain.
    public static func mark(_ c: Clause) -> String { "\u{1}\(c.rawValue)\u{1}" }

    /// The template cut at the marks: the text between clauses at even
    /// places, a clause's name at odd ones.
    public var parts: [Substring] { template.split(separator: "\u{1}", omittingEmptySubsequences: false) }

    /// The clauses the sentence has now, in the template's order.
    public var clauses: [Clause] {
        Clause.allCases
            .compactMap { c in template.range(of: Self.mark(c)).map { (c, $0.lowerBound) } }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    /// The sentence as read: each clause's words in its place.
    public var plain: String {
        var out = ""
        for (i, part) in parts.enumerated() {
            if i % 2 == 1, let clause = Clause(rawValue: String(part)) {
                out += texts[clause]?.text ?? ""
            } else {
                out += part
            }
        }
        return out
    }
}

/// What a clause says, and what a screen reader hears for it: its heading and
/// the option chosen, as the choice itself shows them ("Egg: 68 g").
public struct ClauseText {
    public let text: String
    public let label: String
    public let value: String
}

/// What the sentence says, whichever cook it is about: the one on the
/// controls, or the one in the pan (`RunningCook`). The web's `SetupFacts`.
struct SetupFacts {
    /// The egg's mass as the size menu or the scale says it, with its unit.
    var mass: String
    /// How many eggs go in.
    var count: Int
    var from: EggFrom
    /// The egg's temperature when it is the cook's own number, C.
    var customC: Double
    var start: StartChoice
    var heatOff: Bool
    var cooling: Cooling
    /// The bowl's water, with its unit.
    var water: String
    /// The temperature of the water the eggs cool in as the cook gave it, C,
    /// for running water or a bowl; nil when assumed, or for another cooling.
    var coolingWaterC: Double?
    var units: UnitSystem

    /// The setup on the controls: the settings while idle, a running cook's
    /// own choices while one runs (`AppModel`'s edits).
    @MainActor init(_ planner: Planner) {
        units = planner.units
        mass = planner.sizeClasses.indices.contains(planner.settings.sizeIndex)
            ? classMass(planner.sizeClasses[planner.settings.sizeIndex], units: units)
            : showIn(units, .mass, planner.eggMassG)
        count = planner.settings.eggCount
        from = planner.settings.startTempMode
        customC = planner.settings.customStartC
        start = planner.start
        heatOff = planner.heatOff
        cooling = planner.settings.cooling
        water = showIn(units, .bowl, planner.settings.bowlLitres)
        coolingWaterC = planner.coolingWaterC
    }
}

/// A size class's mass as the size menu shows it.
private func classMass(_ c: SizeClass, units: UnitSystem) -> String {
    let label = sizeClassLabel(c, system: units)
    return tr(label.mass.key, ["value": .fixed(label.mass.value)])
}

/// The clauses' words: core's `clauseKeys`, with this app's arguments. The
/// web's `clauseTexts`.
func clauseTexts(_ f: SetupFacts) -> [Clause: ClauseText] {
    let args: CopyArgs = [
        "count": .int(f.count),
        "mass": .text(f.mass),
        "temp": .text(showIn(f.units, .eggTemp, f.customC)),
        "bath": .text(showIn(f.units, .temperature, sousVideBathC)),
    ]
    // The cooling clause's temperature is the water's, not the egg's.
    let coolingArgs: CopyArgs = [
        "water": .text(f.water),
        "temp": .text(f.coolingWaterC.map { showIn(f.units, .coolingWater, $0) } ?? ""),
    ]
    let keys = clauseKeys(ClauseFacts(
        eggFrom: f.from, startMode: f.start == .cold ? .cold : .hot, sousVide: f.start == .sousVide,
        afterBoil: f.heatOff ? .off : .hold, cooling: f.cooling, coolingWaterGiven: f.coolingWaterC != nil
    ))
    /// A nil value is the argument itself: the mass, or the cook's own
    /// temperature.
    let own: [Clause: String] = [.egg: f.mass, .from: showIn(f.units, .eggTemp, f.customC)]
    return keys.reduce(into: [:]) { out, entry in
        let (clause, k) = entry
        let with = clause == .cooling ? coolingArgs : args
        out[clause] = ClauseText(
            text: trChosen(k.text, with), label: tr(k.label),
            value: k.value.map { trChosen($0, with) } ?? own[clause] ?? ""
        )
    }
}
