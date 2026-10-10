import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// A clause of the setup sentence: each opens its own choice.
/// The setup as one line of prose, each clause of it tappable (UI.md section
/// 5; the web's `renderSentence`):
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
    let planner: Planner
    @Binding var open: Clause?
    /// Whether a clause opens its choice.
    var editable = true
    /// A clause pressed: another control than one with a change in hand,
    /// which commits it (`Edits.touchedElsewhere`).
    var onTap: () -> Void = {}
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// The scheme a clause's link uses. Never leaves the app.
    private static let scheme = "eggtimer-clause"

    var body: some View {
        let texts = clauseTexts(SetupFacts(planner))
        let shown = clauses
        Text(attributed(texts, shown: shown))
            .appFont(.title3)
            .lineSpacing(6)
            .tint(.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == Self.scheme, let clause = Clause(rawValue: url.host() ?? "") else {
                    return .systemAction
                }
                guard editable else { return .handled }
                onTap()
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
                            guard editable else { return }
                            onTap()
                            open = open == clause ? nil : clause
                        }
                        .accessibilityValue(tr(open == clause ? "more.expanded" : "more.collapsed"))
                    }
                }
            }
            // What the sentence says, to the debug log whenever it changes
            // (`sentence`, `"text":"…into cold water…"`): what the scripted
            // checks read.
            .logged(.sentence(text: plain(texts)))
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
        return planner.isSousVide ? tr("setup.sentenceSousVide", args) : tr("setup.sentence", args)
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
            run.font = .app(.title3, weight: .semibold, size: dynamicTypeSize)
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
/// controls, or the one in the pan (`RunningCook`). The web's `SetupFacts`.
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

    /// The setup on the controls: the settings while idle, a running cook's
    /// own choices while one runs (`AppModel`'s edits).
    @MainActor init(_ planner: Planner) {
        units = planner.units
        mass = planner.sizeClasses.indices.contains(planner.settings.sizeIndex)
            ? classMass(planner.sizeClasses[planner.settings.sizeIndex], units: units)
            : showIn(units, .mass, planner.eggMassG)
        from = planner.settings.startTempMode
        customC = planner.settings.customStartC
        start = planner.start
        heatOff = planner.heatOff
        cooling = planner.settings.cooling
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

// MARK: - The choices

/// A clause's choice, opened in place under the sentence: its heading and
/// (i), a Done that closes it, and the control. One at a time.
struct ClausePanel: View {
    @Bindable var planner: Planner
    let clause: Clause
    /// While a cook runs, its corrections: the start's panel then has when
    /// the eggs went in, and no sous-vide, which starts no cook. Nil while
    /// idle.
    var edits: Edits? = nil
    let done: () -> Void
    @State private var more = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 2) {
                Text(tr(titleKey))
                    .appFont(.footnote, weight: .semibold)
                    .foregroundStyle(.secondary)
                InfoButton(expanded: $more, name: about(titleKey))
                Spacer()
                Button(tr("setup.close"), action: done)
                    .appFont(.subheadline, weight: .semibold)
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
            Picker(tr("controls.start"), selection: $planner.start) {
                Text(tr("controls.start.cold")).tag(StartChoice.cold)
                Text(tr("controls.start.hot")).tag(StartChoice.hot)
                if edits == nil {
                    Text(tr("controls.start.sousVide", ["bath": .text(planner.show(.temperature, sousVideBathC))]))
                        .tag(StartChoice.sousVide)
                }
            }
            .segmented()
            if let edits, let start = edits.shownStart { startedAt(edits, start) }
        case .cooling:
            Picker(tr("controls.cooling"), selection: $planner.settings.cooling) {
                Text(tr("controls.cooling.ice")).tag(Cooling.ice)
                Text(tr("controls.cooling.tap")).tag(Cooling.tap)
                Text(tr("controls.cooling.counter")).tag(Cooling.counter)
            }
            .segmented()
        }
    }

    /// When the eggs went in, while a cook runs (design/one-screen.md
    /// section 7, 20): a − and a +, a minute at a time, no later than now,
    /// the press of Full rolling boil or the pull, no earlier than two hours
    /// before Start; when a press goes no further, the line under it says
    /// why, and the time it stopped at.
    private func startedAt(_ edits: Edits, _ start: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(tr("controls.startedAt"))
                Spacer(minLength: 8)
                Text(timeOfDay(Date(timeIntervalSince1970: start)))
                    .systemFigures()
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .fixedSize()
                Stepper(tr("controls.startedAt")) {
                    edits.stepStart(up: true)
                } onDecrement: {
                    edits.stepStart(up: false)
                } onEditingChanged: { on in
                    if on { edits.fingerDown(.startTime) } else { edits.fingerUp() }
                }
                .labelsHidden()
                .accessibilityValue(timeOfDay(Date(timeIntervalSince1970: start)))
            }
            .appFont(.subheadline)
            // The start the panel shows, epoch s, to the debug log whenever
            // it changes (`panelStart`, `"at":1791234567`).
            .logged(.panelStart(at: start))
            if let limit = edits.startLimit {
                Text(tr(limit.kind.key, ["time": .text(timeOfDay(Date(timeIntervalSince1970: limit.atS)))]))
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The carton's classes for this region, and the weight, typed. A weighed
    /// egg is better information than a carton, so typing a weight overrides
    /// the class, and choosing a class moves the weight to that class's mass.
    private var egg: some View {
        VStack(alignment: .leading, spacing: 10) {
            // At the accessibility sizes the size's name over its menu: side
            // by side, the menu left the name a column a letter wide, or
            // nothing. There the menu's button wraps its choice rather than
            // run past the screen (`MenuChoice`).
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr("controls.size"))
                        .accessibilityHidden(true)
                    sizeMenu
                }
            } else {
                LabeledContent(tr("controls.size")) {
                    sizeMenu.fixedSize()
                }
            }
            MeasureField(
                label: tr("controls.measure.weight"), measure: planner.measure(.mass),
                value: planner.eggMassG, set: { planner.weigh($0) }, field: .mass
            )
        }
        .appFont(.subheadline)
    }

    /// The size classes, and the weight as measured: in the face of 1750
    /// there, the button and its list (`MenuChoice`).
    private var sizeMenu: some View {
        MenuChoice(
            label: tr("controls.size"),
            choices: planner.sizeClasses.indices.map { (sizeLabel(planner.sizeClasses[$0]), $0) } + [(
                tr("controls.size.measured", ["mass": .text(planner.show(.mass, planner.settings.weighedMassG))]),
                -1
            )],
            selection: Binding(get: { planner.settings.sizeIndex }, set: { planner.chooseSize($0) })
        )
    }

    /// Fridge, room, or the cook's own number. The presets' temperatures are
    /// said in the hint, rendered from the constants, so the words cannot
    /// disagree with the model; a room is not necessarily 20 °C, and Custom is
    /// there for anyone who knows better.
    private var from: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker(tr("controls.eggFrom"), selection: $planner.settings.startTempMode) {
                Text(tr("controls.eggFrom.fridge")).tag(EggFrom.fridge)
                Text(tr("controls.eggFrom.room")).tag(EggFrom.room)
                Text(tr("controls.eggFrom.custom")).tag(EggFrom.custom)
            }
            .segmented()
            if planner.settings.startTempMode == .custom {
                StepperRow(
                    label: tr("controls.eggTemp"), measure: planner.measure(.eggTemp),
                    value: $planner.settings.customStartC, show: { planner.show(.eggTemp, $0) }, field: .customStart
                )
                .appFont(.subheadline)
            }
            Text(tr("controls.eggFrom.hint", [
                "fridge": .text(planner.show(.temperature, startTempPresetC(.fridge, roomC: planner.roomInUseC))),
                "room": .text(planner.show(.temperature, startTempPresetC(.room, roomC: planner.roomInUseC))),
            ]))
            .appFont(.caption)
            .foregroundStyle(.secondary)
        }
    }

    /// A size class's name and its mass, in the cook's units.
    private func sizeLabel(_ c: SizeClass) -> String {
        let label = sizeClassLabel(c, system: planner.units)
        return tr(label.key, ["mass": .text(tr(label.mass.key, ["value": .fixed(label.mass.value)]))])
    }
}
