import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

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
/// it is the sentence, drawn as it is, so each clause is a link where it is
/// drawn, which is where a test's tap lands (ios/UITests); and then one
/// button per clause, "Egg: 68 g, change", open or not.
struct SetupSentence: View {
    let planner: Planner
    /// The clause whose choice is open, drawn so.
    let open: Clause?
    /// Whether a clause opens its choice.
    var editable = true
    /// A clause pressed, which opens its choice or closes it
    /// (`ContentView.tapped`).
    var onTap: (Clause) -> Void = { _ in }
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// The scheme a clause's link uses. Never leaves the app.
    private static let scheme = "eggtimer-clause"

    var body: some View {
        let words = SentenceWords(planner)
        let texts = words.texts
        let shown = words.clauses
        Text(attributed(words))
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
                onTap(clause)
                return .handled
            })
            .accessibilityRepresentation {
                VStack(alignment: .leading) {
                    Text(attributed(words))
                        .appFont(.title3)
                        .lineSpacing(6)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("sentence")
                    ForEach(shown) { clause in
                        Button(tr(.`setup.clause`, [
                            "label": .text(texts[clause]?.label ?? .none),
                            "value": .text(texts[clause]?.value ?? .none),
                        ])) {
                            guard editable else { return }
                            onTap(clause)
                        }
                        .accessibilityValue(tr(open == clause ? .`more.expanded` : .`more.collapsed`))
                    }
                }
            }
    }

    private func attributed(_ words: SentenceWords) -> AttributedString {
        var out = AttributedString()
        for (i, part) in words.parts.enumerated() {
            guard i % 2 == 1, let clause = Clause(rawValue: String(part)), let text = words.texts[clause] else {
                out += AttributedString(String(part))
                continue
            }
            var run = AttributedString(text.text.string)
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
}

// MARK: - The choices

/// The room, one setting, in each panel where it changes the answer: where
/// the egg comes from when it is Room, the start with the heat off, and the
/// cooling in the air. Not under a bowl, whose water's temperature is asked
/// there itself and assumed at the room; not under an egg cup, opened too
/// soon for the room to move the yolk. Its label is too long to share a line
/// with the field and its stepper, so the control has a line of its own.
/// Optional, greyed at the room assumed until set (`RoomField`).
private struct RoomRow: View {
    let planner: Planner

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            InfoRow(.`controls.room`, more: [tr(.`controls.room.more`, [
                "room": .text(planner.show(.temperature, StartTempPresets.roomC)),
            ])])
            HStack {
                Spacer(minLength: 0)
                RoomField(planner: planner)
            }
        }
    }
}

/// A clause's choice, opened in place under the sentence: its heading and
/// (i), a Done that closes it, and the control. One at a time.
struct ClausePanel: View {
    @Bindable var planner: Planner
    let clause: Clause
    /// While a cook runs, its corrections: the start's panel then has when
    /// the eggs went in, and no sous-vide, which starts no cook. Nil while
    /// idle.
    var inHand: InHand? = nil
    let done: () -> Void
    @State private var more = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.editGesture) private var gesture

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 2) {
                Text(tr(titleKey))
                    .appFont(.footnote, weight: .semibold)
                    .foregroundStyle(.secondary)
                InfoButton(expanded: $more, name: about(titleKey))
                Spacer()
                Button(tr(.`setup.close`), action: done)
                    .appFont(.subheadline, weight: .semibold)
            }
            if more { MoreText([moreText]).transition(.opacity) }
            choice
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
    }

    private var titleKey: CopyKey {
        switch clause {
        case .egg: .`controls.egg`
        case .from: .`controls.eggFrom`
        case .start: .`controls.start`
        case .cooling: .`controls.cooling`
        }
    }

    private var moreText: Words {
        switch clause {
        case .egg: tr(.`controls.egg.more`)
        case .from: tr(.`controls.eggFrom.more`)
        case .start: tr(.`controls.start.more`)
        case .cooling: tr(.`controls.cooling.more`)
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
            SegmentedChoice(
                label: tr(.`controls.start`),
                choices: [(tr(.`controls.start.cold`), StartChoice.cold), (tr(.`controls.start.hot`), StartChoice.hot)]
                    + (inHand == nil ? [(
                        tr(.`controls.start.sousVide`, ["bath": .text(planner.show(.temperature, sousVideBathC))]),
                        StartChoice.sousVide
                    )] : []),
                selection: $planner.start, field: .startMode
            )
            if !planner.isSousVide { pan }
            if let inHand, let start = inHand.shownStart { startedAt(inHand, start) }
        case .cooling: cooling
        }
    }

    /// The pan's rows under the start, changed from one cook to the next:
    /// the heat after the boil, which the start clause's words already say
    /// ("heat off and lid on"), and the water in the pan, which a pan always
    /// shows: it is the volume the time to boil is remembered under.
    private var pan: some View {
        VStack(alignment: .leading, spacing: 10) {
            InfoRow(.`controls.afterTheBoil`, more: [tr(.`controls.afterTheBoil.more`)])
            SegmentedChoice(
                label: tr(.`controls.afterTheBoil`),
                choices: [
                    (tr(.`controls.afterTheBoil.keepBoiling`), false),
                    (tr(.`controls.afterTheBoil.heatOff`), true),
                ],
                selection: $planner.heatOff, field: .afterBoil
            )
            InfoRow(.`controls.water`, more: [tr(.`controls.water.more`)]) {
                StepperValue(
                    label: tr(.`controls.water`), measure: planner.measure(.water),
                    value: $planner.settings.waterLitres, show: { planner.show(.water, $0) }, field: .waterLitres
                )
            }
            // A cold pan starts at the cold tap's temperature: one number with
            // running water's, the cooling's row.
            if planner.start == .cold {
                InfoRow(.`controls.panWater`, more: [panWaterMore])
                HStack {
                    Spacer(minLength: 0)
                    WaterTemperatureField(planner: planner, water: .pan)
                }
            }
            // With the heat off the pan cools toward the room.
            if planner.heatOff { RoomRow(planner: planner) }
        }
        .appFont(.subheadline)
    }

    /// Five ways to cool the eggs, one to a line, fastest first: five names
    /// fit no phone's width as segments (`ListChoice`). Under them, with its
    /// own choice, a bowl's water, and the temperature of running water or
    /// of the bowl, which is optional and shows greyed the one assumed.
    private var cooling: some View {
        VStack(alignment: .leading, spacing: 10) {
            ListChoice(
                label: tr(.`controls.cooling`),
                choices: [
                    (tr(.`controls.cooling.ice`), Cooling.ice), (tr(.`controls.cooling.tap`), Cooling.tap),
                    (tr(.`controls.cooling.bowl`), Cooling.bowl), (tr(.`controls.cooling.counter`), Cooling.counter),
                    (tr(.`controls.cooling.eggCup`), Cooling.eggCup),
                ],
                selection: $planner.settings.cooling
            )
            if planner.settings.cooling == .bowl {
                InfoRow(.`controls.bowl`, more: [tr(.`controls.bowl.more`)])
                HStack {
                    Spacer(minLength: 0)
                    StepperValue(
                        label: tr(.`controls.bowl`), measure: planner.measure(.bowl),
                        value: $planner.settings.bowlLitres, show: { planner.show(.bowl, $0) }, field: .bowlLitres
                    )
                }
            }
            if planner.settings.cooling == .tap || planner.settings.cooling == .bowl {
                InfoRow(.`controls.coolingWater`, more: [coolingWaterMore])
                HStack {
                    Spacer(minLength: 0)
                    WaterTemperatureField(planner: planner, water: .cooling)
                }
            }
            // In the air the egg cools toward the room.
            if planner.settings.cooling == .counter { RoomRow(planner: planner) }
        }
        .appFont(.subheadline)
    }

    /// What the (i) beside a cold pan's water says: the tap assumed when it
    /// is left blank, and that running water's is the same number.
    private var panWaterMore: Words {
        tr(.`controls.panWater.more`, ["water": .text(planner.show(.temperature, Constants.tColdTapC))])
    }

    /// What the (i) beside the water's temperature says: the temperature
    /// assumed when it is left blank, and why it may be otherwise.
    private var coolingWaterMore: Words {
        let assumed = planner.show(.temperature, planner.coolingWaterAssumedC)
        return planner.settings.cooling == .tap
            ? tr(.`controls.coolingWater.tap.more`, ["water": .text(assumed)])
            : tr(.`controls.coolingWater.bowl.more`, ["room": .text(assumed)])
    }

    /// When the eggs went in, while a cook runs: a − and a +, a minute at a time, no later than now,
    /// the press of Rolling boil or the pull, no earlier than two hours
    /// before Start; when a press goes no further, the line under it says
    /// why, and the time it stopped at.
    private func startedAt(_ inHand: InHand, _ start: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(tr(.`controls.startedAt`))
                Spacer(minLength: 8)
                Text(timeOfDay(Date(timeIntervalSince1970: start)))
                    .systemFigures()
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .fixedSize()
                    // The stepper says it, as its value.
                    .accessibilityHidden(true)
                Stepper(tr(.`controls.startedAt`).string) {
                    inHand.stepStart(up: true)
                } onDecrement: {
                    inHand.stepStart(up: false)
                } onEditingChanged: { on in
                    if on { inHand.fingerDown(.startedAt) } else { inHand.fingerUp() }
                }
                .labelsHidden()
                .adjustable(
                    tr(.`controls.startedAt`), value: timeOfDay(Date(timeIntervalSince1970: start)),
                    field: .startedAt, gesture: gesture
                ) { inHand.stepStart(up: $0) }
                .accessibilityIdentifier("startedAt.stepper")
            }
            .appFont(.subheadline)
            if let limit = inHand.startLimit {
                Text(trChosen(limit.kind.key, ["time": .text(timeOfDay(Date(timeIntervalSince1970: limit.atS)))]))
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
            // by side, the menu would leave the name a column a letter wide,
            // or nothing. There the menu's button wraps its choice rather than
            // run past the screen (`MenuChoice`).
            // The menu says its name, so the name beside it is drawn for the
            // eye alone and not read twice.
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr(.`controls.size`))
                        .accessibilityHidden(true)
                    sizeMenu
                }
            } else {
                HStack {
                    Text(tr(.`controls.size`))
                        .accessibilityHidden(true)
                    Spacer(minLength: 8)
                    sizeMenu.fixedSize()
                }
            }
            MeasureField(
                label: tr(.`controls.measure.weight`), measure: planner.measure(.mass),
                value: planner.eggMassG, set: { planner.weigh($0) }, field: .mass
            )
            // How many go in: decided at each cook, so here and in the
            // sentence, not in Settings. A sous-vide egg cooks alone.
            if !planner.isSousVide {
                InfoRow(.`controls.eggsInPan`, more: [tr(.`controls.eggsInPan.more`)]) {
                    CountValue(
                        label: tr(.`controls.eggsInPan`), value: $planner.settings.eggCount, range: Limits.eggCount,
                        field: .eggCount
                    )
                }
            }
        }
        .appFont(.subheadline)
    }

    /// The size classes, and the weight as measured: in the face of 1750
    /// there, the button and its list (`MenuChoice`).
    private var sizeMenu: some View {
        MenuChoice(
            label: tr(.`controls.size`),
            choices: planner.sizeClasses.indices.map { (sizeLabel(planner.sizeClasses[$0]), $0) } + [(
                tr(.`controls.size.measured`, ["mass": .text(planner.show(.mass, planner.settings.weighedMassG))]),
                -1
            )],
            selection: Binding(get: { planner.settings.sizeIndex }, set: { planner.chooseSize($0) })
        )
        .testID(.mass, "size")
    }

    /// Fridge, room, or the cook's own number. The presets' temperatures are
    /// said in the hint, rendered from the constants, so the words cannot
    /// disagree with the model; a room is not necessarily 20 °C, and Custom is
    /// there for anyone who knows better.
    private var from: some View {
        VStack(alignment: .leading, spacing: 10) {
            SegmentedChoice(
                label: tr(.`controls.eggFrom`),
                choices: [
                    (tr(.`controls.eggFrom.fridge`), EggFrom.fridge),
                    (tr(.`controls.eggFrom.room`), EggFrom.room),
                    (tr(.`controls.eggFrom.custom`), EggFrom.custom),
                ],
                selection: $planner.settings.startTempMode
            )
            if planner.settings.startTempMode == .custom {
                StepperRow(
                    label: tr(.`controls.eggTemp`), measure: planner.measure(.eggTemp),
                    value: $planner.settings.customStartC, show: { planner.show(.eggTemp, $0) }, field: .customStart
                )
                .appFont(.subheadline)
            }
            // An egg left out is at the room's temperature.
            if planner.settings.startTempMode == .room {
                RoomRow(planner: planner)
                    .appFont(.subheadline)
            }
            Text(tr(.`controls.eggFrom.hint`, [
                "fridge": .text(planner.show(.temperature, startTempPresetC(.fridge, roomC: planner.roomInUseC))),
                "room": .text(planner.show(.temperature, startTempPresetC(.room, roomC: planner.roomInUseC))),
            ]))
            .appFont(.caption)
            .foregroundStyle(.secondary)
        }
    }

    /// A size class's name and its mass, in the cook's units.
    private func sizeLabel(_ c: SizeClass) -> Words {
        let label = sizeClassLabel(c, system: planner.units)
        return tr(label.key, ["mass": .text(tr(label.mass.key, ["value": .fixed(label.mass.value)]))])
    }
}
