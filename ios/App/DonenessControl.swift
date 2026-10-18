import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// The doneness slider: its heading, with the peak yolk the level asks for at
/// its end (in sous-vide, the water's temperature - there is no peak there);
/// the track shaded by the odds; the five words under it; and the texture.
/// The doneness word is on the ticks, so it is not drawn again; VoiceOver
/// hears it with the temperature as the slider's value.
///
/// In every phase, as on the web: while idle
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var planner: Planner { model.planner }

    var body: some View {
        let r = SliderReading(model, phase: phase)
        VStack(alignment: .leading, spacing: 6) {
            // On one line while both fit whole; at the largest text sizes the
            // peak goes under the heading, rather than the heading breaking
            // as "Done-" beside it, which would read as the phase.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    heading.fixedSize()
                    Spacer(minLength: 0)
                    peak(r).fixedSize()
                }
                VStack(alignment: .leading, spacing: 2) {
                    heading.fixedSize(horizontal: false, vertical: true)
                    peak(r).fixedSize(horizontal: false, vertical: true)
                }
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
                    value: Binding(get: { planner.settings.doneness }, set: { planner.settings.doneness = $0 }),
                    range: Limits.doneness, step: 0.01,
                    label: tr(.`controls.doneness`), valueText: donenessValue(r), inset: $thumbInset,
                    onTouch: { down in
                        // While a cook runs a drag is a correction committed
                        // on release (`InHand`).
                        if down { model.inHand.fingerDown(.level) } else { model.inHand.fingerUp() }
                    }
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
            let note = r.note(planner)
            if !note.isEmpty {
                Text(note)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The slider's heading.
    private var heading: some View {
        Text(tr(.`controls.doneness`))
            .foregroundStyle(.secondary)
    }

    /// The peak yolk the level asks for, across from the heading.
    private func peak(_ r: SliderReading) -> some View {
        Text(donenessPeak(r))
            .fontWeight(.semibold)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            // The slider's value says it, with the word.
            .accessibilityHidden(true)
    }

    /// The five doneness words, each under the level it names, as the web's
    /// ticks are. The ends are held inside the track. A word is struck
    /// through, as on the web, only where the pan cannot deliver any of it:
    /// none of its positions lies outside the stripes (`anchorReachable`).
    @ViewBuilder
    private func ticks(_ r: SliderReading) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            staggeredTicks(r)
        } else {
            oneRowOfTicks(r)
        }
    }

    /// The five words at the accessibility sizes: in two rows, Runny, Jammy
    /// and Hard over Soft and Fudgy, so each has the room between every other
    /// level and they can grow with the text. Up to the third accessibility
    /// size, the largest at which no two words in a row meet on a phone.
    private func staggeredTicks(_ r: SliderReading) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            tickRow([0, 2, 4], r)
            tickRow([1, 3], r)
        }
        .appFont(.caption2)
        .dynamicTypeSize(...DynamicTypeSize.accessibility3)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    /// A row of the words at `indices`, each under its level, the ends held
    /// inside the track; as tall as a word, which a hidden one sizes.
    private func tickRow(_ indices: [Int], _ r: SliderReading) -> some View {
        Text(tr(donenessAnchors[indices[0]].key))
            .hidden()
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay {
                GeometryReader { geo in
                    let inset = thumbInset
                    let span = geo.size.width - 2 * inset
                    ZStack(alignment: .topLeading) {
                        ForEach(indices, id: \.self) { i in
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
                                    .position(x: inset + CGFloat(anchor.level) * span, y: geo.size.height / 2)
                            }
                        }
                    }
                }
            }
    }

    /// The five words in one row, at the sizes under the accessibility ones.
    private func oneRowOfTicks(_ r: SliderReading) -> some View {
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
        // Each word sits under its level, so in one row the words cannot
        // grow past the room between levels, or they overlap each other and
        // the texture under them; the accessibility sizes take two rows
        // (`staggeredTicks`). VoiceOver hears the level as the slider's
        // value.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
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
            return tr(.`controls.doneness.bath`, ["bath": .text(planner.show(.temperature, sousVideBathC))])
        }
        return tr(.`controls.doneness.peak`, ["yolk": .text(planner.show(.temperature, r.peakYolkC))])
    }

    /// The slider's value to VoiceOver: the doneness word and the temperature.
    private func donenessValue(_ r: SliderReading) -> String {
        if r.sousVide {
            return tr(.`controls.doneness.valueBath`, [
                "doneness": .text(planner.label), "bath": .text(planner.show(.temperature, sousVideBathC)),
            ])
        }
        return tr(.`controls.doneness.value`, [
            "doneness": .text(tr(anchorNear(r.level).key)), "yolk": .text(planner.show(.temperature, r.peakYolkC)),
        ])
    }
}
