import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

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
                AnswerRows(spacing: 10, rowSpacing: 8) {
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
        if cook.shownProbeMoment {
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
                    startSI: cook.shownPeakYolkC ?? 0, width: 96, disabled: given != nil
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
        guard let plan = cook.plan, planner.answers?.probe == nil else { return }
        let reading = parseTyped(probeText).flatMap { parse(planner.measure(.probeTemp), $0) }
        guard let scored = model.liveRecord().map(recordCookTimeS) else { return }
        let range = planner.probeRange(egg: plan.egg, setup: plan.setup, cookTimeS: scored)
        guard let reading, reading >= range.low, reading <= range.high else {
            probeNote = tr("probe.refused", [
                "low": .text(planner.show(.probeTemp, range.low)),
                "high": .text(planner.show(.probeTemp, range.high)),
            ])
            return
        }
        guard let probe = cook.probeReading(centreC: reading, against: model.liveRecord()) else { return }
        probeNote = planner.show(.probeTemp, reading)
        model.answer(yolk: nil, white: nil, probe: probe)
    }

    // MARK: - The two questions

    /// The five yolk words, the slider's own (`donenessAnchors`, whose order
    /// is `YolkWord`'s), side by side; when the text is too large for one
    /// row, in as few rows as hold them, so no word is cut (`AnswerRows`).
    private var yolkWords: some View {
        AnswerRows(spacing: 6, rowSpacing: 8) {
            ForEach(YolkWord.allCases.indices, id: \.self) { i in yolkButton(i) }
        }
    }

    private func yolkButton(_ index: Int) -> some View {
        let value = YolkWord.allCases[index]
        let given = planner.answers?.yolk ?? model.held?.yolk
        return answerButton(
            tr(donenessAnchors[index].key), chosen: given == value, answered: given != nil, tight: true
        ) {
            model.answer(yolk: value, white: nil)
        }
    }

    private func whiteButton(_ label: String, _ value: WhiteReport) -> some View {
        let given = planner.answers?.white ?? model.held?.white
        return answerButton(label, chosen: given == value, answered: given != nil) {
            model.answer(yolk: nil, white: value)
        }
    }

    /// The answer given stays legible, filled; its row goes out of reach.
    /// One line each: `AnswerRows` never gives a button less than its word.
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
    /// the cook as it ran, its level and peak (`Cook.asRan`), never the slider
    /// now nor a plan made since on a posterior that has learned from this
    /// egg, in the language and units on screen now, as the web's
    /// `renderTarget` says it.
    private var targetLine: String? {
        guard let level = cook.shownLevel, let peak = cook.shownPeakYolkC else { return nil }
        return tr("feedback.target", [
            "doneness": .text(midSentence(tr(anchorNear(level).key), locale: Copy.activeLocale)),
            "yolk": .text(planner.show(.temperature, peak)),
        ])
    }

    private var tunedLine: String {
        tr("learned.tuned", ["eggs": .int(planner.eggsLogged)])
    }
}

/// A row of answer buttons that breaks into as few rows as hold them, each
/// button at least as wide as its word, as the web's grid does: all on one
/// row while they fit, then three over two, and so on to one a row. The
/// buttons on a row share its width, equally while that leaves each its
/// word. Without it, a row of words that cannot shrink pushed the whole
/// panel past the screen's edge at the largest text sizes.
struct AnswerRows: Layout {
    var spacing: CGFloat
    var rowSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        let width = proposal.width ?? (ideal.map(\.width).reduce(0, +) + spacing * CGFloat(max(subviews.count - 1, 0)))
        let rows = rows(ideal.map(\.width), width)
        let heights = rows.map { row in row.map { ideal[$0].height }.max() ?? 0 }
        return CGSize(width: width, height: heights.reduce(0, +) + rowSpacing * CGFloat(max(rows.count - 1, 0)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        var y = bounds.minY
        for row in rows(ideal.map(\.width), bounds.width) {
            let widths = shares(row.map { ideal[$0].width }, bounds.width)
            let height = row.map { ideal[$0].height }.max() ?? 0
            var x = bounds.minX
            for (k, i) in row.enumerated() {
                subviews[i].place(
                    at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: widths[k], height: height)
                )
                x += widths[k] + spacing
            }
            y += height + rowSpacing
        }
    }

    /// The fewest rows that hold the buttons in order, as even as can be,
    /// the longer rows first: five are 5, then 3 + 2, 2 + 2 + 1, and so on.
    private func rows(_ widths: [CGFloat], _ width: CGFloat) -> [[Int]] {
        let n = widths.count
        guard n > 0 else { return [] }
        for count in 1...n {
            var rows: [[Int]] = []
            var start = 0
            for r in 0..<count {
                let size = n / count + (r < n % count ? 1 : 0)
                rows.append(Array(start..<(start + size)))
                start += size
            }
            let fits = rows.allSatisfy { row in
                row.map { widths[$0] }.reduce(0, +) + spacing * CGFloat(row.count - 1) <= width
            }
            if fits { return rows }
        }
        return (0..<n).map { [$0] }
    }

    /// One row's buttons' widths: equal if that leaves each its word, and
    /// otherwise each its word and an equal share of what is left.
    private func shares(_ ideal: [CGFloat], _ width: CGFloat) -> [CGFloat] {
        let free = width - spacing * CGFloat(ideal.count - 1)
        let equal = free / CGFloat(ideal.count)
        if ideal.allSatisfy({ $0 <= equal }) { return ideal.map { _ in equal } }
        let extra = max(0, free - ideal.reduce(0, +)) / CGFloat(ideal.count)
        return ideal.map { min($0 + extra, free) }
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
