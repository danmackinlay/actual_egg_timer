import SwiftUI
import EggTimerCore
import EggTimerCopy

/// At Done: the two questions, both always on screen and neither required
/// (INFERENCE.md section 3), and above them the probe reading when this cook
/// asks for one. Three answers each is not a poor interface for a rating
/// - it is the whole measurement: ordinal feedback is worth one to two bits
/// per egg, and a number out of ten would collect precision that is not
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
                probeEntry
                if let target = targetLine {
                    Text(target)
                        .appFont(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                Text(tr("feedback.ask"))
                    .appFont(.headline)
                HStack(spacing: 10) {
                    yolkButton(tr("feedback.tooSoft"), .tooSoft)
                    yolkButton(tr("feedback.justRight"), .justRight)
                    yolkButton(tr("feedback.tooFirm"), .tooHard)
                }

                Text(tr("feedback.white.ask"))
                    .appFont(.headline)
                    .padding(.top, 4)
                HStack(spacing: 10) {
                    whiteButton(tr("feedback.white.runny"), .runny)
                    whiteButton(tr("feedback.white.tender"), .tender)
                    whiteButton(tr("feedback.white.firm"), .firm)
                }

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

    /// The reading, at DONE: typed in the cook's units, refused with the range
    /// it should be in when no believable kitchen could have made it, and
    /// otherwise folded into the egg with whatever else has been said.
    @ViewBuilder
    private var probeEntry: some View {
        if cook.asksForProbe {
            let given = planner.answers?.probe
            VStack(spacing: 8) {
                Text(tr("probe.now"))
                    .appFont(.headline)
                Text(tr("probe.hint"))
                    .appFont(.caption)
                    .foregroundStyle(.secondary)
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
            .padding(.bottom, 6)
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

    private func yolkButton(_ label: String, _ value: Feedback) -> some View {
        let given = planner.answers?.yolk
        return answerButton(label, chosen: given == value, answered: given != nil) {
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
    @ViewBuilder
    private func answerButton(
        _ label: String, chosen: Bool, answered: Bool, action: @escaping () -> Void
    ) -> some View {
        let text = Text(label)
            .appFont(.subheadline)
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
