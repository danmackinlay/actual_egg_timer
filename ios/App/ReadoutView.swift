import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// The phase, the time, and the line under it; then how sure I am.
///
/// Sous-vide is answered honestly and separately: no cook to run, no clock
/// to start, and a start time that has already been and gone. It branches
/// FIRST, before any of the pan readout.
///
/// A function of the clock: the egg screen's `TimelineView` hands over the
/// date it drew for, and the phase at that date.
struct ReadoutView: View {
    let model: AppModel
    let phase: Phase
    let now: Date
    /// What the sous-vide screen says at `now`, or nil for a pan and while a
    /// cook runs.
    let sousVide: SousVideCopy?
    /// Whether the certainty line is open.
    @Binding var certaintyOpen: Bool
    /// Whether the Learning mark's (i) is open.
    @State private var learningOpen = false

    private var planner: Planner { model.planner }

    /// The clock's size, pt: fixed, as the web's, at every text size.
    private static let digits: CGFloat = 76
    /// How far below the digits' baseline their line reaches, pt: the room
    /// a descender would take, which digits never use.
    private static let descender = -UIFont.systemFont(ofSize: digits, weight: .semibold).descender
    /// From the digits' baseline to the top of the boil line, pt (the web's
    /// 10 px on a 390-px screen).
    private static let underBaseline: CGFloat = 10
    /// How far the certainty line's second line of room hangs into the
    /// panel's foot, pt: the word's x-height at the default text size (about
    /// 8 pt, the web's 0.5rem), so the folded word has no more empty room
    /// under it than it needs. What opens under it and the white's line take
    /// it back, so they sit where they did. Fixed at every text size, as the
    /// panel's 14 pt padding is, so "most likely" never reaches its edge.
    private static let hang = UIFont.preferredFont(
        forTextStyle: .subheadline, compatibleWith: UITraitCollection(preferredContentSizeCategory: .large)
    ).xHeight.rounded()

    var body: some View {
        let words = ReadoutWords(model, phase: phase, nowS: now.timeIntervalSince1970)
        VStack(spacing: 6) {
            if let copy = sousVide {
                Text(tr(.`readout.phase.startTime`))
                    .appFont(.caption, smallCaps: true)
                    .foregroundStyle(.secondary)
                // Not the 76 pt clock face the other phases use: "Yesterday" is
                // not a clock face and will not fit like one. The web app has a
                // CSS rule that says the same thing.
                Text(copy.headline)
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(copy.subline)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            } else {
                Text(tr(words.label))
                    .appFont(.caption, smallCaps: true)
                    .foregroundStyle(phase == .pull ? .orange : .secondary)
                    .multilineTextAlignment(.center)
                if learningShown && learningOpen {
                    MoreText([tr(.`learning.badge.more`)])
                        .transition(.opacity)
                }

                // The time's two lines sit close under the digits
                // (UI.md section 8, as the web): the boil
                // line about 10 pt under the digits' baseline, which digits
                // never reach below, and the certainty word's press target
                // directly under the boil line.
                VStack(spacing: 0) {
                    Text(words.big)
                        .font(.system(size: Self.digits, weight: .semibold, design: .rounded))
                        .accessibilityIdentifier("readout.time")
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.snappy, value: words.big)
                        .padding(.bottom, Self.underBaseline - Self.descender)

                    sublineLine(words)
                    certaintyLine(words)
                }
            }
        }
        .frame(maxWidth: .infinity)
        // The web's 14 px at a phone's width (styles.css `#readout`).
        .padding(.vertical, 14)
        .padding(.horizontal, 12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
        .overlay(alignment: .topTrailing) {
            if learningShown { learningMark }
        }
    }

    /// The Learning mark, as on the web: small, in the
    /// panel's corner, over the time it is about, while sharing is on - the
    /// time may then be nudged a few seconds. Never in sous-vide, which has no
    /// time to nudge. Its (i) opens under the phase label.
    private var learningShown: Bool {
        Sharing.shared.state.on && sousVide == nil
    }

    private var learningMark: some View {
        HStack(spacing: 0) {
            Text(tr(.`learning.badge`))
                .appFont(.caption2, weight: .semibold)
                .textCase(.uppercase)
                .foregroundStyle(Palette.accent)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .overlay(Capsule().strokeBorder(Palette.accent.opacity(0.55)))
            InfoButton(expanded: $learningOpen, name: about(.`learning.badge`))
        }
        .padding(.top, 6)
        .padding(.trailing, 4)
    }

    /// The line under the time. "Based on history" has an (i) that says what
    /// history, as on the web.
    @ViewBuilder
    private func sublineLine(_ words: ReadoutWords) -> some View {
        if phase == .idle && planner.coldStart && planner.hasBoilMemory {
            InfoRow(
                name: tr(.`readout.sub.coldAssumes.info`),
                more: [tr(.`readout.sub.coldAssumes.more`)],
                alignment: .center
            ) {
                Text(words.sub)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("readout.sub")
            }
        } else {
            Text(words.sub)
                .appFont(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("readout.sub")
        }
    }

    /// How sure I am of the time on screen, beneath it (UI.md section 8, the
    /// web's `renderOdds`): the class as a line the
    /// cook presses, which opens in place the 90% interval in the slider's
    /// words, "most likely" when it is not already said (`mostLikelyOpened`),
    /// the likely time range and, while idle, the way to Help's "How sure I
    /// am". "Most likely" shows under the line unpressed when it is not the
    /// word asked (`mostLikelyShown`). Then a line when a runny white is a
    /// real risk.
    ///
    /// While idle it is the choice on screen's, and blank until this pot's
    /// surface lands; the line holds two lines' room, the word and "most
    /// likely", or until the pull the room of the tallest of them (`tallest`)
    /// where that is more, so a drag that brings "most likely" or takes it
    /// away does not move the slider at any text size. Once a cook is running it is its plan's, on its pot's
    /// surface (held while a new pot's is built), until the pull, when the
    /// time it was about has passed; the
    /// white's line stays to the end. Never where the white never sets: there
    /// is no cook to say anything about.
    @ViewBuilder
    private func certaintyLine(_ words: ReadoutWords) -> some View {
        let idle = phase == .idle
        let sure = words.certainty
        VStack(spacing: 2) {
            ZStack(alignment: .top) {
                // Two lines' room in every phase, the word and "most
                // likely", so nothing under it moves when they come or go,
                // nor at the start; the word at its top, close under the
                // boil line; the second line hanging its
                // x-height into the panel's foot (`hang`).
                Text(verbatim: " \n ").appFont(.subheadline).padding(.vertical, 4).hidden().accessibilityHidden(true)
                // Wherever "most likely" can show, the room the line takes
                // with it, whichever words they are: at the largest text
                // sizes either wraps to two lines, more than the two lines
                // above, and it would move the slider as it came and went.
                if canSay(phase) {
                    tallest.hidden().accessibilityHidden(true)
                }
                if let sure {
                    VStack(spacing: 2) {
                        Button {
                            withAnimation(.snappy) { certaintyOpen.toggle() }
                        } label: {
                            Text(tr(certaintyKey(sure.words.certainty)))
                                .underline(true, pattern: certaintyOpen ? .solid : .dot, color: Palette.accent)
                                .appFont(.subheadline, weight: .semibold)
                                .modifier(OneLineWhenLarge())
                                .padding(.vertical, 4)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(tr(certaintyOpen ? .`more.expanded` : .`more.collapsed`))
                        if mostLikelyShown(sure.words) {
                            Text(renderedWords(mostLikelyWords(sure.words)))
                                .appFont(.footnote)
                                .modifier(OneLineWhenLarge())
                                .foregroundStyle(.secondary)
                                .accessibilityIdentifier("readout.likely")
                        }
                    }
                }
            }
            .padding(.bottom, -Self.hang)
            if sure != nil, certaintyOpen {
                VStack(alignment: .leading, spacing: 0) {
                    MoreText(words.opened)
                    if idle {
                        NavigationLink(value: Route.help(.odds)) {
                            HStack(spacing: 4) {
                                Text(tr(.`certainty.help`))
                                Image(systemName: "arrow.right")
                                    .accessibilityHidden(true)
                            }
                            .appFont(.footnote, weight: .semibold)
                        }
                        .tint(Palette.accent)
                        .padding(.top, 6)
                    }
                }
                .padding(.top, 4 + Self.hang)
                .transition(.opacity)
            }
            if words.whiteRunny {
                Text(tr(.`outcome.whiteRunny`))
                    .appFont(.footnote)
                    .foregroundStyle(.orange)
                    .padding(.top, 2 + Self.hang)
            }
        }
        .multilineTextAlignment(.center)
    }

    /// Whether the line can say how sure I am in this phase, and so "most
    /// likely" under it: until the pull.
    private func canSay(_ phase: Phase) -> Bool {
        phase == .idle || phase == .heating || phase == .cooking
    }

    /// The line at its tallest, at this text size and width: the tallest of
    /// the three words over the tallest "most likely", laid out as the line
    /// lays them out, so the room it keeps is the room it takes, which only
    /// at the largest sizes is more than its two lines'.
    private var tallest: some View {
        VStack(spacing: 2) {
            ZStack {
                ForEach([Certainty.veryCertain, .ballpark, .wildGuess], id: \.self) { c in
                    Text(tr(certaintyKey(c))).appFont(.subheadline, weight: .semibold).modifier(OneLineWhenLarge())
                }
            }
            .padding(.vertical, 4)
            ZStack {
                ForEach(donenessAnchors.indices, id: \.self) { i in
                    Text(tr(.`certainty.mostLikely`, ["word": .text(tr(donenessAnchors[i].key))]))
                        .appFont(.footnote)
                        .modifier(OneLineWhenLarge())
                }
            }
        }
    }
}

/// The certainty word and "most likely" at the accessibility sizes: each on
/// one line, set smaller where it would wrap. The line keeps the room of its
/// tallest words whether they show or not, so the slider never moves
/// (`tallest`); wrapped, that was four lines, three of them empty under a
/// word of one line. On one line each it is two, as at every other size.
private struct OneLineWhenLarge: ViewModifier {
    @Environment(\.dynamicTypeSize) private var size

    func body(content: Content) -> some View {
        if size.isAccessibilitySize {
            content.lineLimit(1).minimumScaleFactor(0.5)
        } else {
            content
        }
    }
}
