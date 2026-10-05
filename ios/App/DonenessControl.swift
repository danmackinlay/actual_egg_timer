import SwiftUI
import EggTimerCore
import EggTimerCopy

/// The doneness slider: its heading, with the peak yolk the level asks for at
/// its end (in sous-vide, the water's temperature - there is no peak there);
/// the track shaded by the odds; the five words under it; and the texture.
/// The doneness word is on the ticks, so it is not drawn again; VoiceOver
/// hears it with the temperature as the slider's value.
struct DonenessControl: View {
    @Bindable var planner: Planner
    /// Half the slider's thumb, pt, as the slider reports it: where the track,
    /// the bracket and the doneness words are inset to.
    @Binding var thumbInset: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(tr("controls.doneness"))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text(donenessPeak)
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
                OddsTrack(solution: planner.isSousVide ? nil : planner.solution, profile: planner.shownProfile)
                    .frame(height: 10)
                    .padding(.horizontal, thumbInset)
                YolkSlider(
                    value: $planner.doneness, range: Limits.doneness, step: 0.01,
                    label: tr("controls.doneness"), valueText: donenessValue, inset: $thumbInset
                )
            }
            // Where the yolk will probably land, under the track: never in
            // sous-vide, as on the web.
            // Its room is kept while it is away, so the words under it do not
            // move when it lands.
            Group {
                if let bracket = planner.heldOutcome {
                    YolkBracket(outcome: bracket)
                } else {
                    Color.clear.frame(height: 9).accessibilityHidden(true)
                }
            }
            .padding(.horizontal, thumbInset)
            .padding(.top, -4)
            ticks
            let note = donenessNote
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
    private var ticks: some View {
        GeometryReader { geo in
            let inset = thumbInset
            let span = geo.size.width - 2 * inset
            ZStack(alignment: .topLeading) {
                ForEach(donenessAnchors.indices, id: \.self) { i in
                    let anchor = donenessAnchors[i]
                    let blocked = tickBlocked(i)
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
    private func tickBlocked(_ index: Int) -> Bool {
        guard !planner.isSousVide, let solution = planner.solution else { return false }
        let softest = solution.whiteSets ? solution.softestLevel : 1
        let hardest = solution.whiteSets ? solution.hardestLevel : 0
        return !anchorReachable(index, softest: softest, hardest: hardest)
    }

    /// At the end of the slider's heading: the peak yolk the level asks for,
    /// or in sous-vide the water's temperature.
    private var donenessPeak: String {
        if planner.isSousVide {
            return tr("controls.doneness.bath", ["bath": .text(planner.show(.temperature, sousVideBathC))])
        }
        let yolk = planner.solution?.result.peakYolkC ?? targetPeakYolkC(planner.doneness)
        return tr("controls.doneness.peak", ["yolk": .text(planner.show(.temperature, yolk))])
    }

    /// The slider's value to VoiceOver: the doneness word and the temperature.
    private var donenessValue: String {
        if planner.isSousVide {
            return tr("controls.doneness.valueBath", [
                "doneness": .text(planner.label), "bath": .text(planner.show(.temperature, sousVideBathC)),
            ])
        }
        let yolk = planner.solution?.result.peakYolkC ?? targetPeakYolkC(planner.doneness)
        return tr("controls.doneness.value", [
            "doneness": .text(planner.label), "yolk": .text(planner.show(.temperature, yolk)),
        ])
    }

    /// What the yolk and white will be like, or, in a bath, the bath's own
    /// note.
    private var donenessNote: String {
        if planner.isSousVide {
            return sousVideCopy(planner.sousVide, now: .now, units: planner.units).note
        }
        guard let s = planner.solution else { return "" }
        return textureNote(peakYolkC: s.result.peakYolkC, peakWhiteC: s.result.peakWhiteC, whiteSets: s.whiteSets)
    }
}
