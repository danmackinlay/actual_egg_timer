import SwiftUI
import EggTimerCore
import EggTimerCopy

/// At Done: the two questions, both always on screen and neither required
/// (INFERENCE.md section 3) - the yolk the cook got, in the slider's own five
/// words, and the white next to it (DECISIONS.md 92) - and under them the
/// probe reading, optional too, whenever this cook had a moment to probe.
/// Ordered words are not a poor interface for a rating - they are the whole
/// measurement: a number out of ten would collect precision that is not
/// there. There is no Skip button: an unanswered question is recorded as
/// skipped when the next cook starts.
struct FeedbackPanel: View {
    let model: AppModel
    /// The probe reading as typed, in the cook's units, and what was said
    /// back about it. The panel is only on screen at Done, so both go
    /// with the egg.
    @State private var probeText = ""
    @State private var probeNote = ""

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        VStack(spacing: 12) {
            // After a relaunch the second question is not offered again: the
            // surface it would be folded against is gone, and the one left
            // unanswered stays a skip in the record.
            if cook.feedbackGiven && planner.answers == nil {
                Text(tr(planner.learning ? "feedback.learning" : "feedback.thanks"))
                    .appFont(.subheadline)
                Text(planner.learning ? " " : tunedLine)
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            } else {
                if let target = targetLine {
                    Text(target)
                        .appFont(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                Text(tr("feedback.ask"))
                    .appFont(.headline)
                    .multilineTextAlignment(.center)
                yolkWords
                    .answerRow(tr("feedback.ask"))

                Text(tr("feedback.white.ask"))
                    .appFont(.headline)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                HStack(spacing: 10) {
                    whiteButton(tr("feedback.white.runny"), .runny)
                    whiteButton(tr("feedback.white.tender"), .tender)
                    whiteButton(tr("feedback.white.firm"), .firm)
                }
                .answerRow(tr("feedback.white.ask"))

                probeEntry

                Text(tr("feedback.optional"))
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text(calibrationNote)
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 18))
    }

    // MARK: - The thermometer

    /// The reading, at DONE, under the two questions, whenever the cooling
    /// ended at the yolk's peak, with the probe setting on or off: typed in
    /// the cook's units, refused with the range it should be in when no
    /// believable kitchen could have made it, and otherwise folded into the
    /// egg with whatever else has been said. Optional, like the questions.
    @ViewBuilder
    private var probeEntry: some View {
        if cook.ticket?.probeMoment == true {
            let given = planner.answers?.probe
            VStack(spacing: 8) {
                Text(tr("probe.ask"))
                    .appFont(.headline)
                    .multilineTextAlignment(.center)
                Text(tr("probe.how"))
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                // The − and + step in whole degrees from the peak the cook was
                // started at, which the empty field shows greyed; the button
                // goes under them, since the three do not fit one line.
                NudgeField(
                    label: tr("probe.entry"), measure: planner.measure(.probeTemp), text: $probeText,
                    startSI: cook.ticket?.peakYolkC ?? 0, width: 96, disabled: given != nil
                )
                Button(tr("probe.save")) { saveProbe() }
                    .buttonStyle(.bordered)
                    .disabled(given != nil || probeText.isEmpty)
                if !probeNote.isEmpty {
                    Text(probeNote)
                        .appFont(.caption)
                        .foregroundStyle(given == nil ? .orange : .secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.top, 4)
        }
    }

    private func saveProbe() {
        guard let ticket = cook.ticket, planner.answers?.probe == nil else { return }
        let reading = parseTyped(probeText).flatMap { parse(planner.measure(.probeTemp), $0) }
        guard let scored = cook.eggRecord(yolk: nil).map(recordCookTimeS) else { return }
        let range = planner.probeRange(egg: ticket.egg, setup: ticket.setup, cookTimeS: scored)
        guard let reading, reading >= range.low, reading <= range.high else {
            probeNote = tr("probe.refused", [
                "low": .text(planner.show(.probeTemp, range.low)),
                "high": .text(planner.show(.probeTemp, range.high)),
            ])
            return
        }
        guard let probe = cook.probeReading(centreC: reading) else { return }
        probeNote = planner.show(.probeTemp, reading)
        model.answer(yolk: nil, white: nil, probe: probe)
    }

    // MARK: - The two questions

    /// The five yolk words, the slider's own (`donenessAnchors`, whose order
    /// is `YolkWord`'s), side by side; when the text is too large for one
    /// row, three over two, so no word is cut.
    private var yolkWords: some View {
        let words = YolkWord.allCases
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) {
                ForEach(words.indices, id: \.self) { i in yolkButton(i) }
            }
            VStack(spacing: 8) {
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in yolkButton(i) }
                }
                HStack(spacing: 6) {
                    ForEach(3..<words.count, id: \.self) { i in yolkButton(i) }
                }
            }
        }
    }

    private func yolkButton(_ index: Int) -> some View {
        let value = YolkWord.allCases[index]
        let given = planner.answers?.yolk
        return answerButton(
            tr(donenessAnchors[index].key), chosen: given == value, answered: given != nil, tight: true
        ) {
            model.answer(yolk: value, white: nil)
        }
    }

    private func whiteButton(_ label: String, _ value: WhiteReport) -> some View {
        let given = planner.answers?.white
        return answerButton(label, chosen: given == value, answered: given != nil) {
            model.answer(yolk: nil, white: value)
        }
    }

    /// The answer given stays legible, filled; its row goes out of reach.
    /// `tight` is for the five yolk words: one line each, never truncated,
    /// so that a row that cannot hold them all is left for two rows.
    @ViewBuilder
    private func answerButton(
        _ label: String, chosen: Bool, answered: Bool, tight: Bool = false, action: @escaping () -> Void
    ) -> some View {
        // A bordered button pads its label by about 12 pt a side, which leaves
        // five words a phone's width only at the smallest text; the yolk
        // words give back most of it, as the web's do.
        let text = Text(label)
            .appFont(.subheadline)
            .lineLimit(1)
            .fixedSize(horizontal: tight, vertical: false)
            .padding(.horizontal, tight ? -8 : 0)
            .frame(maxWidth: .infinity)
        if chosen {
            Button(action: action) { text.onAccent() }
                .buttonStyle(.borderedProminent).allowsHitTesting(false)
        } else {
            Button(action: action) { text }
                .buttonStyle(.bordered).disabled(answered)
        }
    }

    private var calibrationNote: String {
        if planner.learning { return tr("feedback.learning") }
        if planner.answers != nil { return tr("feedback.thanks") }
        if planner.eggsLogged == 0 {
            return tr("feedback.invite")
        }
        return tunedLine
    }

    /// What this cook was started for, over the yolk question, so the answer
    /// is graded against it: "You asked for: jammy, peak yolk 65 °C". From
    /// the ticket's level and peak, never the slider now, in the language and
    /// units on screen now, as the web's `renderTarget` says it.
    private var targetLine: String? {
        guard let ticket = cook.ticket else { return nil }
        return tr("feedback.target", [
            "doneness": .text(midSentence(tr(anchorNear(ticket.level).key), locale: Copy.activeLocale)),
            "yolk": .text(planner.show(.temperature, ticket.peakYolkC)),
        ])
    }

    private var tunedLine: String {
        tr("learned.tuned", ["eggs": .int(planner.eggsLogged)])
    }
}

private extension View {
    /// A row of answers as one group named by its question, as the web's
    /// `role="group"` with `aria-labelledby`: both rows have a Runny, and
    /// VoiceOver says which question it is in as it enters the row.
    func answerRow(_ question: String) -> some View {
        accessibilityElement(children: .contain)
            .accessibilityLabel(question)
    }
}
