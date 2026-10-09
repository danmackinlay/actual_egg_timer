import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

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
    /// While a cook runs, the pot's rows - the altitude, the water, the eggs
    /// in the pan, the heat after the boil, the probe and the room - are its
    /// controls, and correct it as the sentence does; what I have learned
    /// and sharing wait for it to end (design/one-screen.md, step 7).
    var cooking = false
    /// Whether the egg on screen is in the log and still open to correction
    /// (`Cook.eggOpen`): sharing holds it back.
    var eggOpen = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Forget asks first, in place, as the web's does: the button gives way to
    /// the question and its two answers.
    @State private var confirming = false
    /// Set when "Export my results" is pressed with nothing kept, so the note
    /// under it can say so.
    @State private var nothingToExport = false
    /// "Delete what I've sent" asks first, the same way.
    @State private var confirmingDelete = false
    /// Set once a deletion asked for here is confirmed by the server, so the
    /// note can say so while Settings is open.
    @State private var deletedHere = false
    private var sharing: Sharing { Sharing.shared }

    var body: some View {
        Form {
            // The egg screen's line, again where the settings that will not
            // be kept are changed (`Stores`, DECISIONS.md 100).
            if Stores.readOnly {
                Section { NewerNote() }
            }
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
                .segmented()
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
                .segmented()
                .labelsHidden()
            }

            // The alarm's sound (DECISIONS.md 101). Choosing one plays it.
            Section {
                InfoRow(name: about("controls.alarm"), more: [tr("controls.alarm.more")]) {
                    Text(tr("controls.alarm"))
                }
                Picker(tr("controls.alarm"), selection: Binding(
                    get: { AlarmSoundChoice.shared.sound },
                    set: { AlarmSoundChoice.shared.pick($0) }
                )) {
                    Text(tr("controls.alarm.timer")).tag(AlarmSound.timer)
                    Text(tr("controls.alarm.cuckoo")).tag(AlarmSound.cuckoo)
                    Text(tr("controls.alarm.hen")).tag(AlarmSound.hen)
                }
                .segmented()
                .labelsHidden()
            }

            if !planner.isSousVide {
                Section {
                    InfoRow("controls.altitude", more: [tr("controls.altitude.more")]) {
                        StepperValue(
                            label: tr("controls.altitude"), measure: planner.measure(.altitude),
                            value: $planner.altitudeM, show: { planner.show(.altitude, $0) }, field: .altitude
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
                            value: $planner.waterLitres, show: { planner.show(.water, $0) }, field: .water
                        )
                    }
                    InfoRow("controls.eggsInPan", more: [tr("controls.eggsInPan.more")]) {
                        CountValue(
                            label: tr("controls.eggsInPan"), value: $planner.eggCount, range: Limits.eggCount,
                            field: .eggCount
                        )
                    }
                }

                Section {
                    InfoRow("controls.afterTheBoil", more: [tr("controls.afterTheBoil.more")])
                    Picker(tr("controls.afterTheBoil"), selection: $planner.heatOff) {
                        Text(tr("controls.afterTheBoil.keepBoiling")).tag(false)
                        Text(tr("controls.afterTheBoil.heatOff")).tag(true)
                    }
                    .segmented()
                    .labelsHidden()
                }

                // The probe thermometer. Off by default, and changed here; the
                // reading's field after a cook is there either way.
                Section {
                    InfoRow("controls.thermometer", more: [tr("controls.thermometer.more")])
                    Toggle(tr("controls.thermometer.ask"), isOn: Binding(
                        get: { planner.probe },
                        set: { planner.setProbe($0) }
                    ))
                    // The room, measured with the probe: offered only while
                    // the probe is on, and optional (`roomInUse`).
                    // Its label is too long to share a line with the field
                    // and its stepper, so the control has a line of its own.
                    if planner.probe {
                        InfoRow("controls.room", more: [tr("controls.room.more", [
                            "room": .text(planner.show(.temperature, StartTempPresets.roomC)),
                        ])])
                        HStack {
                            Spacer(minLength: 0)
                            RoomField(planner: planner)
                        }
                    }
                }
            }

            if !cooking {
                learned

                share
            }

            Section {
                Text(colophon)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                Text(versionLine)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .barTitle(tr("controls.settings"))
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
            // Every result kept here, to a file through the share sheet
            // (DECISIONS.md 81). Offered on an empty log too, which says
            // there is nothing to save.
            if Calibrations.resultsKept(planner.kept) > 0 {
                ShareLink(
                    item: ResultsExport(uid: sharing.state.uid, name: Calibrations.exportName()),
                    preview: SharePreview(Calibrations.exportName())
                ) {
                    Text(tr("learned.export"))
                }
            } else {
                Button(tr("learned.export")) {
                    nothingToExport = true
                }
                if nothingToExport {
                    Text(tr("learned.export.none"))
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            // Not while a newer build's results are left alone (`Stores`):
            // there is nothing this build may forget.
            if (planner.eggsLogged > 0 || planner.hasBoilMemory) && !Stores.readOnly {
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
    /// switch rather than behind the (i), the note under it, the random
    /// number, and the deletion, asked first. Sharing.swift does the work.
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
            // Nothing is sent or deleted while a newer build's results are
            // left alone (`Stores`).
            .disabled(Stores.readOnly)
            if let note = shareNote(s) {
                Text(note)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
            }
            // The random number, to quote by email (DECISIONS.md 67), as the
            // web's `#shareId`: whole, selectable, and only while there is
            // one. Fixed-width in the system face, so the 1750 face's figures
            // never draw its 0 as an o.
            if let uid = s.uid {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("share.id"))
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                    Text(verbatim: uid)
                        .font(.footnote.monospaced())
                        .textSelection(.enabled)
                }
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
            } else if !s.uids.isEmpty && !Stores.readOnly {
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
    private func shareNote(_ s: ShareState) -> String? {
        if !s.deleting.isEmpty { return tr("share.deleting") }
        if deletedHere && !s.on { return tr("share.deleted") }
        guard s.on else { return nil }
        if s.sent == 0 { return tr("share.none") }
        let final = planner.kept.log.count - (eggOpen ? 1 : 0)
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

    /// The web's last line, "Version 0.4.0 (2)": the App Store version, which
    /// holds only integers, and the build in brackets. The number is a run of
    /// its own, fixed-width in the system face, as the random number is, so
    /// the 1750 face never draws its 0 as an o; the line is selectable.
    private var versionLine: AttributedString {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        let mark = "\u{1}"
        let parts = tr("colophon.version", ["version": .text(mark)]).components(separatedBy: mark)
        var number = AttributedString(build.isEmpty ? short : "\(short) (\(build))")
        number.font = .footnote.monospaced()
        number.foregroundColor = .primary
        return AttributedString(parts.first ?? "") + number
            + AttributedString(parts.count > 1 ? parts[1] : "")
    }
}
