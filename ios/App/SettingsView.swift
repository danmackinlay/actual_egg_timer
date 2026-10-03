import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Settings: what belongs to the kitchen rather than the egg (UI.md sections
/// 2 and 3, the web's `#settings`). Set once, cook many, so it is a page of its
/// own, pushed, and visited rarely. Each item has its (i).
///
/// In sous-vide the settings that change nothing there are put away, as on
/// the web: `sousVideEstimate` takes the egg's size, the doneness and a bath,
/// so the altitude, the water, the eggs in the pan, the heat after the boil
/// and the probe are all pan arithmetic. A new input to `sousVideEstimate` is
/// the signal to bring one back.
struct SettingsView: View {
    @Bindable var planner: Planner
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Forget asks first, in place, as the web's does: the button gives way to
    /// the question and its two answers.
    @State private var confirming = false
    /// "Delete what I've sent" asks first, the same way.
    @State private var confirmingDelete = false
    /// Set once a deletion asked for here is confirmed by the server, so the
    /// note can say so while Settings is open.
    @State private var deletedHere = false
    private var sharing: Sharing { Sharing.shared }

    var body: some View {
        Form {
            Section {
                InfoRow(name: about("controls.units"), more: [tr("controls.units.more.ios")]) {
                    Text(tr("controls.units"))
                }
                Picker(tr("controls.units"), selection: Binding(
                    get: { planner.units },
                    set: { planner.chooseUnits($0) }
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
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            // English, or the English of 1750. Named alike in both
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

            if !planner.isSousVide {
                Section {
                    InfoRow("controls.altitude", more: [tr("controls.altitude.more")]) {
                        StepperValue(
                            label: tr("controls.altitude"), measure: planner.measure(.altitude),
                            value: $planner.altitudeM, show: { planner.show(.altitude, $0) }
                        )
                    }
                    LabeledContent(tr("readout.stat.waterBoilsAt")) {
                        Text(planner.show(.boilingPoint, planner.boilingC))
                            .monospacedDigit()
                    }
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                }

                Section {
                    InfoRow("controls.water", more: [tr("controls.water.more")]) {
                        StepperValue(
                            label: tr("controls.water"), measure: planner.measure(.water),
                            value: $planner.waterLitres, show: { planner.show(.water, $0) }
                        )
                    }
                    InfoRow("controls.eggsInPan", more: [tr("controls.eggsInPan.more")]) {
                        CountValue(label: tr("controls.eggsInPan"), value: $planner.eggCount, range: Limits.eggCount)
                    }
                }

                Section {
                    InfoRow("controls.afterTheBoil", more: [tr("controls.afterTheBoil.more")])
                    Picker(tr("controls.afterTheBoil"), selection: $planner.heatOff) {
                        Text(tr("controls.afterTheBoil.keepBoiling")).tag(false)
                        Text(tr("controls.afterTheBoil.heatOff")).tag(true)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                // The probe thermometer. Off by default; offered once during a
                // cook, and changed here.
                Section {
                    InfoRow("controls.thermometer", more: [tr("controls.thermometer.more")])
                    Toggle(tr("controls.thermometer.ask"), isOn: Binding(
                        get: { planner.probe },
                        set: { planner.setProbe($0) }
                    ))
                }
            }

            learned

            share

            Section {
                Text(colophon)
                    .appFont(.footnote)
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
                .appFont(.footnote)
                .foregroundStyle(.secondary)
            if planner.eggsLogged > 0 || planner.hasBoilMemory {
                if confirming {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tr("learned.confirm.title"))
                            .appFont(.subheadline, weight: .semibold)
                        Text(tr("learned.confirm.message"))
                            .appFont(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    Button(tr("learned.confirm.forget"), role: .destructive) {
                        confirming = false
                        planner.resetCalibration()
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

    // MARK: - Sharing

    /// Sharing (E6), as the web's `#share`: the consent on screen beside the
    /// switch rather than behind the (i), the note under it, and the
    /// deletion, asked first. Sharing.swift does the work.
    private var share: some View {
        let s = sharing.state
        return Section {
            InfoRow(name: about("share.title"), more: [tr("share.more")]) {
                Text(tr("share.title"))
            }
            Text(tr("share.what"))
                .appFont(.footnote)
                .foregroundStyle(.secondary)
            Toggle(tr("share.toggle"), isOn: Binding(
                get: { s.on },
                set: { on in
                    deletedHere = false
                    sharing.setSharing(on)
                    // The time moves by the nudge with it.
                    planner.refresh()
                }
            ))
            if let note = shareNote(s) {
                Text(note)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
            }
            if confirmingDelete {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("share.confirm.title"))
                        .appFont(.subheadline, weight: .semibold)
                    Text(tr("share.confirm.message"))
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                Button(tr("share.confirm.delete"), role: .destructive) {
                    confirmingDelete = false
                    Task {
                        await sharing.deleteSent()
                        deletedHere = sharing.state.deleting.isEmpty
                    }
                }
                Button(tr("share.confirm.keep")) {
                    confirmingDelete = false
                }
            } else if !s.uids.isEmpty {
                Button(tr("share.delete"), role: .destructive) {
                    withAnimation(.snappy) { confirmingDelete = true }
                }
            }
            Link(tr("help.privacy"), destination: HelpView.privacyURL)
                .appFont(.footnote)
        }
    }

    /// The web's `renderShare`: deleting, deleted, nothing yet, or how many
    /// have gone and how many wait.
    private func shareNote(_ s: Sharing.State) -> String? {
        if !s.deleting.isEmpty { return tr("share.deleting") }
        if deletedHere && !s.on { return tr("share.deleted") }
        guard s.on else { return nil }
        if s.sent == 0 { return tr("share.none") }
        let final = planner.kept.log.count - (planner.answers == nil ? 0 : 1)
        let waiting = max(0, final - s.sent)
        let sent = tr("share.sent", ["eggs": .int(s.sent)])
        return waiting > 0 ? sent + " " + tr("share.waiting", ["eggs": .int(waiting)]) : sent
    }

    /// The web's `renderLearned`: nothing yet, the eggs, the pan, or both.
    private var learnedNote: String {
        let eggs = planner.eggsLogged
        let pan = planner.hasBoilMemory
        if eggs == 0 && !pan { return tr("learned.literature") }
        let tuned = eggs > 0 ? tr("learned.tuned", ["eggs": .int(eggs)]) : ""
        let measured = pan
            ? tr("learned.pan", [
                "water": .text(planner.show(.water, planner.waterLitres)),
                "time": .text(clockString(planner.timeToBoilS)),
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
        name.font = .app(.footnote, weight: .semibold, size: dynamicTypeSize)
        var link = AttributedString(tr("colophon.link"))
        link.link = URL(string: "https://github.com/danmackinlay/actual_egg_timer")
        link.underlineStyle = .single
        return name + AttributedString(" " + tr("colophon.lede") + " ") + link
            + AttributedString(" " + tr("colophon.tail"))
    }
}
