import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Settings: what belongs to the kitchen rather than the egg (UI.md sections
/// 2 and 3, the web's `#kitchen`). Set once, cook many, so it is a page of its
/// own, pushed, and visited rarely. Each item has its (i).
///
/// In sous-vide the settings that change nothing there are put away, as on
/// the web: `sousVideEstimate` takes the egg's size, the doneness and a bath,
/// so the altitude, the water, the eggs in the pan, the heat after the boil
/// and the probe are all pan arithmetic. A new input to `sousVideEstimate` is
/// the signal to bring one back.
struct SettingsView: View {
    @Bindable var kitchen: Kitchen
    /// Forget asks first, in place, as the web's does: the button gives way to
    /// the question and its two answers.
    @State private var confirming = false

    var body: some View {
        Form {
            Section {
                InfoRow(name: about("controls.units"), more: [tr("controls.units.more.ios")]) {
                    Text(tr("controls.units"))
                }
                Picker(tr("controls.units"), selection: Binding(
                    get: { kitchen.units },
                    set: { kitchen.chooseUnits($0) }
                )) {
                    Text(tr("controls.units.metric")).tag(UnitSystem.metric)
                    Text(tr("controls.units.imperial")).tag(UnitSystem.imperial)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                // The way into 1750 for a cook who starts in Imperial and so
                // never makes the switch (LANGUAGE.md section 6): on any
                // English page, 1750 included, in its own twin.
                if languageOf(Copy.activeLocale) == "en" {
                    Text(tr("controls.units.period"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            // F6: English, or the English of 1750. Named alike in both
            // catalogues, so either can be found from the other.
            Section {
                InfoRow(name: about("controls.language"), more: [tr("controls.language.more")]) {
                    Text(tr("controls.language"))
                }
                Picker(tr("controls.language"), selection: Binding(
                    get: { Copy.activeLocale },
                    set: { LanguageChoice.shared.pick($0) }
                )) {
                    Text(tr("language.en")).tag(defaultLanguage)
                    Text(tr("language.en1750")).tag(periodLanguage)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            if !kitchen.isSousVide {
                Section {
                    InfoRow("controls.altitude", more: [tr("controls.altitude.more")]) {
                        StepperValue(
                            label: tr("controls.altitude"), measure: kitchen.measure(.altitude),
                            value: $kitchen.altitudeM, show: { kitchen.show(.altitude, $0) }
                        )
                    }
                    LabeledContent(tr("readout.stat.waterBoilsAt")) {
                        Text(kitchen.show(.boilingPoint, kitchen.boilingC))
                            .monospacedDigit()
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                Section {
                    InfoRow("controls.water", more: [tr("controls.water.more")]) {
                        StepperValue(
                            label: tr("controls.water"), measure: kitchen.measure(.water),
                            value: $kitchen.waterLitres, show: { kitchen.show(.water, $0) }
                        )
                    }
                    InfoRow("controls.eggsInPan", more: [tr("controls.eggsInPan.more")]) {
                        CountValue(label: tr("controls.eggsInPan"), value: $kitchen.eggCount, range: Limits.eggCount)
                    }
                }

                Section {
                    InfoRow("controls.afterTheBoil", more: [tr("controls.afterTheBoil.more")])
                    Picker(tr("controls.afterTheBoil"), selection: $kitchen.heatOff) {
                        Text(tr("controls.afterBoil.keepBoiling")).tag(false)
                        Text(tr("controls.afterBoil.heatOff")).tag(true)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                // E4. Off by default; offered once during a cook, and changed here.
                Section {
                    InfoRow("controls.thermometer", more: [tr("controls.thermometer.more")])
                    Toggle(tr("controls.thermometer.ask"), isOn: Binding(
                        get: { kitchen.probe },
                        set: { kitchen.setProbe($0) }
                    ))
                }
            }

            learned

            Section {
                Text(colophon)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle(tr("controls.settings"))
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - What I've learned

    /// What this kitchen has taught the app, and the way to take it back.
    /// Offered whenever there is anything to forget - a measured pan counts,
    /// not just logged eggs - because the button clears both.
    private var learned: some View {
        Section {
            Text(tr("learned.title"))
            Text(learnedNote)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if kitchen.eggsLogged > 0 || kitchen.hasBoilMemory {
                if confirming {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tr("learned.confirm.title"))
                            .font(.subheadline.weight(.semibold))
                        Text(tr("learned.confirm.message"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    Button(tr("learned.confirm.forget"), role: .destructive) {
                        confirming = false
                        kitchen.resetCalibration()
                    }
                    Button(tr("learned.confirm.keep")) {
                        confirming = false
                    }
                } else {
                    InfoRow(name: about("learned.forget"), more: [tr("learned.forget.more")]) {
                        Button(tr("learned.forget"), role: .destructive) {
                            withAnimation(.snappy) { confirming = true }
                        }
                        // Its own hit area, not the row's: the row also
                        // holds the (i).
                        .buttonStyle(.borderless)
                    }
                }
            }
        }
    }

    /// The web's `renderLearned`: nothing yet, the eggs, the pan, or both.
    private var learnedNote: String {
        let eggs = kitchen.eggsLogged
        let pan = kitchen.hasBoilMemory
        if eggs == 0 && !pan { return tr("learned.literature") }
        let tuned = eggs > 0 ? tr("learned.tuned", ["eggs": .int(eggs)]) : ""
        let measured = pan
            ? tr("learned.pan", [
                "water": .text(kitchen.show(.water, kitchen.waterLitres)),
                "time": .text(clockString(kitchen.timeToBoilS)),
            ])
            : ""
        if !tuned.isEmpty && !measured.isEmpty {
            return tr("learned.both", ["tuned": .text(tuned), "pan": .text(measured)])
        }
        return tuned + measured
    }

    /// The web's colophon, with its link to the source.
    private var colophon: AttributedString {
        var name = AttributedString(tr("colophon.name"))
        name.font = .footnote.weight(.semibold)
        var link = AttributedString(tr("colophon.link"))
        link.link = URL(string: "https://github.com/danmackinlay/actual_egg_timer")
        link.underlineStyle = .single
        return name + AttributedString(" " + tr("colophon.lede") + " ") + link
            + AttributedString(" " + tr("colophon.tail"))
    }
}
