import SwiftUI
import EggTimerCore
import EggTimerCopy

/// The doneness slider: its heading, with the peak yolk the level asks for at
/// its end (in sous-vide, the water's temperature - there is no peak there);
/// the track shaded by the odds; the five words under it; and the texture.
/// The doneness word is on the ticks, so it is not drawn again; VoiceOver
/// hears it with the temperature as the slider's value.
///
/// In every phase, as on the web (design/one-screen.md section 2): while idle
/// it reads the controls' answer; while a cook runs, its plan's - the peak
/// yolk, the texture, and until the pull the shading and the bracket, from
/// its pot's surface (`SliderReading`).
struct DonenessControl: View {
    let model: AppModel
    /// The phase at the screen's last draw: the shading and the bracket go
    /// at the pull, when the time they were about has passed.
    let phase: Phase
    /// Half the slider's thumb, pt, as the slider reports it: where the track,
    /// the bracket and the doneness words are inset to.
    @Binding var thumbInset: CGFloat

    private var planner: Planner { model.planner }

    var body: some View {
        let r = SliderReading(model, phase: phase)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(tr("controls.doneness"))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text(donenessPeak(r))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    // The slider's value says it, with the word.
                    .accessibilityHidden(true)
            }
            .appFont(.subheadline)
            // One track, the yolk's: the system's thumb on no track of its
            // own, over the odds in the yolk's colour and what this pan cannot
            // deliver (OddsTrack), inset by half a thumb so a level sits under
            // the thumb that asks for it.
            ZStack {
                OddsTrack(solution: r.solution, profile: r.profile)
                    .frame(height: 10)
                    .padding(.horizontal, thumbInset)
                YolkSlider(
                    value: Binding(get: { planner.doneness }, set: { planner.doneness = $0 }),
                    range: Limits.doneness, step: 0.01,
                    label: tr("controls.doneness"), valueText: donenessValue(r), inset: $thumbInset
                )
            }
            // Where the yolk will probably land, under the track: never in
            // sous-vide, as on the web.
            // Its room is kept while it is away, so the words under it do not
            // move when it lands.
            Group {
                if let words = r.words {
                    YolkBracket(words: words)
                } else {
                    Color.clear.frame(height: 9).accessibilityHidden(true)
                }
            }
            .padding(.horizontal, thumbInset)
            .padding(.top, -4)
            ticks(r)
            let note = donenessNote(r)
            if !note.isEmpty {
                Text(note)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The five doneness words, each under the level it names, as the web's
    /// ticks are. The ends are held inside the track. A word is struck
    /// through, as on the web, only where the pan cannot deliver any of it:
    /// none of its positions lies outside the stripes (`anchorReachable`).
    private func ticks(_ r: SliderReading) -> some View {
        GeometryReader { geo in
            let inset = thumbInset
            let span = geo.size.width - 2 * inset
            ZStack(alignment: .topLeading) {
                ForEach(donenessAnchors.indices, id: \.self) { i in
                    let anchor = donenessAnchors[i]
                    let blocked = tickBlocked(i, r)
                    let word = Text(tr(anchor.key)).strikethrough(blocked).opacity(blocked ? 0.5 : 1)
                    if i == 0 {
                        word.frame(maxWidth: .infinity, alignment: .leading)
                    } else if i == donenessAnchors.count - 1 {
                        word.frame(maxWidth: .infinity, alignment: .trailing)
                    } else {
                        word
                            .fixedSize()
                            .position(x: inset + CGFloat(anchor.level) * span, y: 8)
                    }
                }
            }
        }
        .frame(height: 16)
        .appFont(.caption2)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    /// Whether the word at `index` is out of the pan's reach: over the
    /// stripes the track draws (`OddsTrack`), so never before a solution or in
    /// sous-vide, where there are none.
    private func tickBlocked(_ index: Int, _ r: SliderReading) -> Bool {
        guard let solution = r.solution else { return false }
        let softest = solution.whiteSets ? solution.softestLevel : 1
        let hardest = solution.whiteSets ? solution.hardestLevel : 0
        return !anchorReachable(index, softest: softest, hardest: hardest)
    }

    /// At the end of the slider's heading: the peak yolk the level asks for,
    /// or in sous-vide the water's temperature.
    private func donenessPeak(_ r: SliderReading) -> String {
        if r.sousVide {
            return tr("controls.doneness.bath", ["bath": .text(planner.show(.temperature, sousVideBathC))])
        }
        return tr("controls.doneness.peak", ["yolk": .text(planner.show(.temperature, r.peakYolkC))])
    }

    /// The slider's value to VoiceOver: the doneness word and the temperature.
    private func donenessValue(_ r: SliderReading) -> String {
        if r.sousVide {
            return tr("controls.doneness.valueBath", [
                "doneness": .text(planner.label), "bath": .text(planner.show(.temperature, sousVideBathC)),
            ])
        }
        return tr("controls.doneness.value", [
            "doneness": .text(tr(anchorNear(r.level).key)), "yolk": .text(planner.show(.temperature, r.peakYolkC)),
        ])
    }

    /// What the yolk and white will be like, or, in a bath, the bath's own
    /// note.
    private func donenessNote(_ r: SliderReading) -> String {
        if r.sousVide {
            return sousVideCopy(planner.sousVide, now: AppClock.now, units: planner.units).note
        }
        guard let s = r.noteSolution else { return "" }
        return textureNote(peakYolkC: s.result.peakYolkC, peakWhiteC: s.result.peakWhiteC, whiteSets: s.whiteSets)
    }
}

/// What the slider shows: the controls' answer while idle, the running
/// cook's plan while one runs (the web's `renderIdle` and `renderRunning`).
@MainActor
struct SliderReading {
    /// The pan's limits, for the stripes and the struck words; nil in
    /// sous-vide and before the first answer.
    var solution: Solution?
    /// The shading: this pot's odds at every level.
    var profile: OddsProfile?
    /// The bracket: how sure I am, in the slider's words.
    var words: WordCertainty?
    /// The heading's peak yolk, C, and the level it is for.
    var peakYolkC: Double
    var level: Double
    /// What the texture note describes.
    var noteSolution: Solution?
    var sousVide = false

    init(_ model: AppModel, phase: Phase) {
        let planner = model.planner
        let cook = model.cook
        if phase != .idle, let running = cook.running, let plan = cook.plan {
            let whiteSets = plan.solution.whiteSets
            // Until the pull; then the time they were about has passed.
            let before = phase == .heating || phase == .cooking
            // Once the egg is out, as it ran (`asRanShown`).
            let ran = asRanShown(running, plan: plan)
            solution = plan.solution
            profile = whiteSets && before ? cook.heldProfile : nil
            words = whiteSets && before ? cook.heldCertainty?.words : nil
            peakYolkC = ran?.peakYolkC ?? plan.solution.result.peakYolkC
            level = ran?.level ?? plan.level
            noteSolution = plan.solution
            return
        }
        sousVide = planner.isSousVide
        solution = sousVide ? nil : planner.solution
        profile = sousVide ? nil : planner.shownProfile
        words = sousVide ? nil : planner.heldCertainty?.words
        peakYolkC = planner.solution?.result.peakYolkC ?? targetPeakYolkC(planner.doneness)
        level = planner.doneness
        noteSolution = planner.solution
    }
}
