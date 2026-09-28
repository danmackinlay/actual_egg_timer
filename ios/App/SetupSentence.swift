import SwiftUI
import EggTimerCore
import EggTimerCopy

/// A clause of the setup sentence: each opens its own choice.
/// The setup as one line of prose, each clause of it tappable (UI.md section
/// 2; the web's `renderSentence`):
///
/// > **68 g eggs** **from the fridge**, **into cold water and boiled**, **then
/// > an ice bath**.
///
/// The template is the catalogue's, so a language may order the clauses as it
/// likes; each placeholder becomes its clause, and everything between them
/// stays text. Each clause carries its own preposition and article. Sous-vide
/// says less, because where the egg comes from and how it cools change
/// nothing there.
///
/// One Text, so it wraps as prose does: each clause is a link to a scheme of
/// the app's own, caught by `openURL` before the system sees it. To VoiceOver
/// it is the sentence and then one button per clause, "Egg: 68 g, change".
struct SetupSentence: View {
    let kitchen: Kitchen
    @Binding var open: Clause?

    /// The scheme a clause's link uses. Never leaves the app.
    private static let scheme = "eggtimer-clause"

    var body: some View {
        let texts = clauseTexts(kitchen)
        let shown = clauses
        Text(attributed(texts, shown: shown))
            .font(.title3)
            .lineSpacing(6)
            .tint(.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == Self.scheme, let clause = Clause(rawValue: url.host() ?? "") else {
                    return .systemAction
                }
                withAnimation(.snappy) { open = open == clause ? nil : clause }
                return .handled
            })
            .accessibilityRepresentation {
                VStack(alignment: .leading) {
                    Text(plain(texts))
                    ForEach(shown) { clause in
                        Button(tr("setup.clause", [
                            "label": .text(texts[clause]?.label ?? ""),
                            "value": .text(texts[clause]?.value ?? ""),
                        ])) {
                            open = open == clause ? nil : clause
                        }
                        .accessibilityValue(tr(open == clause ? "more.expanded" : "more.collapsed"))
                    }
                }
            }
    }

    /// The clauses the sentence has now, in the template's order.
    private var clauses: [Clause] {
        let marked = template
        return Clause.allCases
            .compactMap { c in marked.range(of: mark(c)).map { (c, $0.lowerBound) } }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    private func mark(_ c: Clause) -> String { "\u{1}\(c.rawValue)\u{1}" }

    /// The template with each placeholder marked by a character no catalogue
    /// will contain.
    private var template: String {
        let args: CopyArgs = [
            "egg": .text(mark(.egg)), "from": .text(mark(.from)),
            "start": .text(mark(.start)), "cooling": .text(mark(.cooling)),
        ]
        return kitchen.isSousVide ? tr("setup.sentenceSousVide", args) : tr("setup.sentence", args)
    }

    private func attributed(_ texts: [Clause: ClauseText], shown: [Clause]) -> AttributedString {
        var out = AttributedString()
        for (i, part) in template.split(separator: "\u{1}", omittingEmptySubsequences: false).enumerated() {
            guard i % 2 == 1, let clause = Clause(rawValue: String(part)), let text = texts[clause] else {
                out += AttributedString(String(part))
                continue
            }
            var run = AttributedString(text.text)
            run.link = URL(string: "\(Self.scheme)://\(clause.rawValue)")
            run.font = .title3.weight(.semibold)
            run.underlineStyle = Text.LineStyle(pattern: .solid, color: Palette.accent)
            if open == clause {
                run.backgroundColor = Palette.accent.opacity(0.3)
            }
            out += run
        }
        return out
    }

    private func plain(_ texts: [Clause: ClauseText]) -> String {
        var out = ""
        for (i, part) in template.split(separator: "\u{1}", omittingEmptySubsequences: false).enumerated() {
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
struct ClauseText {
    let text: String
    let label: String
    let value: String
}

/// What the sentence says, whichever cook it is about: the one on the
/// controls, or the one in the pan (`Cook.Ticket`). The web's `SetupFacts`.
struct SetupFacts {
    /// The egg's mass as the size menu or the scale says it, with its unit.
    var mass: String
    var from: EggFrom
    /// The egg's temperature when it is the cook's own number, C.
    var customC: Double
    var start: StartChoice
    var heatOff: Bool
    var cooling: Cooling
    var units: UnitSystem

    /// The setup on the controls.
    @MainActor init(_ kitchen: Kitchen) {
        units = kitchen.units
        mass = kitchen.sizeClasses.indices.contains(kitchen.sizeIndex)
            ? classMass(kitchen.sizeClasses[kitchen.sizeIndex], units: units)
            : showIn(units, .mass, kitchen.eggMassG)
        from = kitchen.startTemp
        customC = kitchen.customStartC
        start = kitchen.start
        heatOff = kitchen.heatOff
        cooling = kitchen.cooling
    }

    /// The setup a cook was started with, from its ticket and not the
    /// controls: what the cook promised, in the units they set it up in. A
    /// class egg is named as its class's mass, as the size menu names it,
    /// when the carton still has a class of that mass; otherwise it is the
    /// egg's own.
    @MainActor init(_ ticket: Cook.Ticket, kitchen: Kitchen) {
        let system = ticket.units
        units = system
        let byClass = ticket.massFrom == .sizeClass
            ? kitchen.sizeClasses.first { abs($0.massKg * 1000 - ticket.eggGrams) < 1e-9 }
            : nil
        mass = byClass.map { classMass($0, units: system) } ?? showIn(system, .mass, ticket.eggGrams)
        from = ticket.startTemp
        customC = ticket.setup.eggStartC
        start = ticket.coldStart ? .cold : .hot
        heatOff = ticket.setup.afterBoil == .off
        cooling = ticket.cooling
    }
}

/// A size class's mass as the size menu shows it.
private func classMass(_ c: SizeClass, units: UnitSystem) -> String {
    let label = sizeClassLabel(c, system: units)
    return tr(label.mass.key, ["value": .fixed(label.mass.value)])
}

@MainActor
func clauseTexts(_ kitchen: Kitchen) -> [Clause: ClauseText] {
    clauseTexts(SetupFacts(kitchen))
}

/// The clauses' words: core's `clauseKeys`, with this app's arguments. The
/// web's `clauseTexts`.
func clauseTexts(_ f: SetupFacts) -> [Clause: ClauseText] {
    let args: CopyArgs = [
        "mass": .text(f.mass),
        "temp": .text(showIn(f.units, .eggTemp, f.customC)),
        "bath": .text(showIn(f.units, .temperature, sousVideBathC)),
    ]
    let keys = clauseKeys(ClauseFacts(
        eggFrom: f.from, startMode: f.start == .cold ? .cold : .hot, sousVide: f.start == .sousVide,
        afterBoil: f.heatOff ? .off : .hold, cooling: f.cooling
    ))
    /// A nil value is the argument itself: the mass, or the cook's own
    /// temperature.
    let own: [Clause: String] = [.egg: f.mass, .from: showIn(f.units, .eggTemp, f.customC)]
    return keys.reduce(into: [:]) { out, entry in
        let (clause, k) = entry
        out[clause] = ClauseText(
            text: tr(k.text, args), label: tr(k.label),
            value: k.value.map { tr($0, args) } ?? own[clause] ?? ""
        )
    }
}

// MARK: - The cook in the pan

/// The cook in the pan, once the controls are gone (owner, 28 September): the
/// setup sentence it was started with, so a forgetful cook can see what they
/// promised, and under it what the sentence does not say, the doneness and
/// the peak yolk. From the ticket, never the controls. Plain prose: nothing in
/// it can change a cook under way, so nothing in it is a link. Sous-vide never
/// runs a cook, so it never shows this.
struct CookSentence: View {
    let ticket: Cook.Ticket
    let kitchen: Kitchen

    var body: some View {
        let facts = SetupFacts(ticket, kitchen: kitchen)
        let texts = clauseTexts(facts)
        VStack(alignment: .leading, spacing: 6) {
            Text(tr("setup.sentence", [
                "egg": .text(texts[.egg]?.text ?? ""), "from": .text(texts[.from]?.text ?? ""),
                "start": .text(texts[.start]?.text ?? ""), "cooling": .text(texts[.cooling]?.text ?? ""),
            ]))
            .font(.title3)
            .lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
            // In the system the egg was set up in, which the controls cannot
            // have changed since.
            Text(tr("cook.summary", [
                "doneness": .text(midSentence(ticket.doneness, locale: Copy.activeLocale)),
                "yolk": .text(showIn(facts.units, .temperature, ticket.peakYolkC)),
            ]))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - The choices

/// A clause's choice, opened in place under the sentence: its heading and
/// (i), a Done that closes it, and the control. One at a time.
struct ClausePanel: View {
    @Bindable var kitchen: Kitchen
    let clause: Clause
    let done: () -> Void
    @State private var more = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 2) {
                Text(tr(titleKey))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                InfoButton(expanded: $more, name: about(titleKey))
                Spacer()
                Button(tr("setup.close"), action: done)
                    .font(.subheadline.weight(.semibold))
            }
            if more { MoreText([moreText]).transition(.opacity) }
            choice
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
    }

    private var titleKey: String {
        switch clause {
        case .egg: "controls.egg"
        case .from: "controls.eggFrom"
        case .start: "controls.start"
        case .cooling: "controls.cooling"
        }
    }

    private var moreText: String {
        switch clause {
        case .egg: tr("controls.egg.more")
        case .from: tr("controls.eggFrom.more")
        case .start: tr("controls.start.more")
        case .cooling: tr("controls.cooling.more")
        }
    }

    @ViewBuilder
    private var choice: some View {
        switch clause {
        case .egg: egg
        case .from: from
        case .start:
            // Rendered from the constant, so the button cannot name a bath
            // the model is not computing.
            Picker(tr("controls.start"), selection: $kitchen.start) {
                Text(tr("controls.start.cold")).tag(StartChoice.cold)
                Text(tr("controls.start.hot")).tag(StartChoice.hot)
                Text(tr("controls.start.sousVide", ["bath": .text(kitchen.show(.temperature, sousVideBathC))]))
                    .tag(StartChoice.sousVide)
            }
            .pickerStyle(.segmented)
        case .cooling:
            Picker(tr("controls.cooling"), selection: $kitchen.cooling) {
                Text(tr("controls.then.ice")).tag(Cooling.ice)
                Text(tr("controls.then.tap")).tag(Cooling.tap)
                Text(tr("controls.then.counter")).tag(Cooling.counter)
            }
            .pickerStyle(.segmented)
        }
    }

    /// The carton's classes for this region, and the weight, typed. A weighed
    /// egg is better information than a carton, so typing a weight overrides
    /// the class, and choosing a class moves the weight to that class's mass.
    private var egg: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabeledContent(tr("controls.size")) {
                Picker(tr("controls.size"), selection: Binding(
                    get: { kitchen.sizeIndex },
                    set: { kitchen.chooseSize($0) }
                )) {
                    ForEach(kitchen.sizeClasses.indices, id: \.self) { i in
                        Text(sizeLabel(kitchen.sizeClasses[i])).tag(i)
                    }
                    Text(tr("controls.size.weighed", [
                        "mass": .text(kitchen.show(.mass, kitchen.weighedMassG)),
                    ])).tag(-1)
                }
                .pickerStyle(.menu)
                .labelsHidden()
                // "Extra large — 76 g" otherwise wraps onto two lines.
                .fixedSize()
            }
            MeasureField(
                label: tr("controls.measure.weight"), measure: kitchen.measure(.mass),
                value: kitchen.eggMassG, set: { kitchen.weigh($0) }
            )
        }
        .font(.subheadline)
    }

    /// Fridge, room, or the cook's own number. The presets' temperatures are
    /// said in the hint, rendered from the constants, so the words cannot
    /// disagree with the model; a room is not necessarily 20 °C, and Custom is
    /// there for anyone who knows better.
    private var from: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker(tr("controls.eggFrom"), selection: $kitchen.startTemp) {
                Text(tr("controls.eggFrom.fridge")).tag(EggFrom.fridge)
                Text(tr("controls.eggFrom.room")).tag(EggFrom.room)
                Text(tr("controls.eggFrom.custom")).tag(EggFrom.custom)
            }
            .pickerStyle(.segmented)
            if kitchen.startTemp == .custom {
                StepperRow(
                    label: tr("controls.eggTemp"), measure: kitchen.measure(.eggTemp),
                    value: $kitchen.customStartC, show: { kitchen.show(.eggTemp, $0) }
                )
                .font(.subheadline)
            }
            Text(tr("controls.eggFrom.hint", [
                "fridge": .text(kitchen.show(.temperature, StartTempPresets.fridgeC)),
                "room": .text(kitchen.show(.temperature, StartTempPresets.roomC)),
            ]))
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    /// A size class's name and its mass, in the cook's units.
    private func sizeLabel(_ c: SizeClass) -> String {
        let label = sizeClassLabel(c, system: kitchen.units)
        return tr(label.key, ["mass": .text(tr(label.mass.key, ["value": .fixed(label.mass.value)]))])
    }
}
