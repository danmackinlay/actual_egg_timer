import SwiftUI
import EggTimerCore
import EggTimerCopy

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
    private var cook: Cook { model.cook }

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
    /// panel's 22 pt padding is, so "most likely" never reaches its edge.
    private static let hang = UIFont.preferredFont(
        forTextStyle: .subheadline, compatibleWith: UITraitCollection(preferredContentSizeCategory: .large)
    ).xHeight.rounded()

    var body: some View {
        VStack(spacing: 6) {
            if let copy = sousVide {
                Text(tr("readout.phase.startTime"))
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
                Text(asking ? tr("ask.stillIn") : tr(model.keys(phase).label))
                    .appFont(.caption, smallCaps: true)
                    .foregroundStyle(phase == .pull ? .orange : .secondary)
                    .multilineTextAlignment(.center)
                if learningShown && learningOpen {
                    MoreText([tr("learning.badge.more")])
                        .transition(.opacity)
                }

                // The time's two lines sit close under the digits
                // (DECISIONS.md 99, UI.md section 8, as the web): the boil
                // line about 10 pt under the digits' baseline, which digits
                // never reach below, and the certainty word's press target
                // directly under the boil line.
                VStack(spacing: 0) {
                    Text(bigTime)
                        .font(.system(size: Self.digits, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.snappy, value: bigTime)
                        .padding(.bottom, Self.underBaseline - Self.descender)

                    sublineLine
                        #if DEBUG
                        // What the readout says, for the scripted checks.
                        .onChange(of: "\(phase.rawValue) \(bigTime) | \(subline)", initial: true) { _, said in
                            Screenshots.log("readout \(said)")
                        }
                        // One frame whole: the moment it was drawn for, to
                        // the millisecond, with the time, the line under it
                        // and the certainty's time range it drew, so a check
                        // can see that all of them are of that one moment.
                        .onChange(of: frame, initial: true) { _, said in
                            Screenshots.log("frame \(said)")
                        }
                        #endif
                    certaintyLine
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
        .overlay(alignment: .topTrailing) {
            if learningShown { learningMark }
        }
    }

    /// The Learning mark (E8, DECISIONS.md 58), as on the web: small, in the
    /// panel's corner, over the time it is about, while sharing is on - the
    /// time may then be nudged a few seconds. Never in sous-vide, which has no
    /// time to nudge. Its (i) opens under the phase label.
    private var learningShown: Bool {
        Sharing.shared.state.on && sousVide == nil
    }

    private var learningMark: some View {
        HStack(spacing: 0) {
            Text(tr("learning.badge"))
                .appFont(.caption2, weight: .semibold)
                .textCase(.uppercase)
                .foregroundStyle(Palette.accent)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .overlay(Capsule().strokeBorder(Palette.accent.opacity(0.55)))
            InfoButton(expanded: $learningOpen, name: about("learning.badge"))
        }
        .padding(.top, 6)
        .padding(.trailing, 4)
    }

    /// The line under the time. "Based on history" has an (i) that says what
    /// history, as on the web.
    @ViewBuilder
    private var sublineLine: some View {
        if phase == .idle && planner.coldStart && planner.hasBoilMemory {
            InfoRow(
                name: tr("readout.sub.coldAssumes.info"),
                more: [tr("readout.sub.coldAssumes.more")],
                alignment: .center
            ) {
                Text(subline)
                    .appFont(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        } else {
            Text(subline)
                .appFont(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// How sure I am of the time on screen, beneath it (UI.md section 8, the
    /// web's `renderOdds`; DECISIONS.md 93 and 97): the class as a line the
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
    /// time it was about has passed (design/one-screen.md section 7, 12); the
    /// white's line stays to the end. Never where the white never sets: there
    /// is no cook to say anything about.
    @ViewBuilder
    private var certaintyLine: some View {
        let idle = phase == .idle
        // While idle, the choice on screen's; once a cook is running, its
        // plan's.
        let o = idle ? planner.heldOutcome : cook.outcome
        let sure = certainty
        VStack(spacing: 2) {
            ZStack(alignment: .top) {
                // Two lines' room in every phase, the word and "most
                // likely", so nothing under it moves when they come or go,
                // nor at the start; the word at its top, close under the
                // boil line (DECISIONS.md 99); the second line hanging its
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
                                .padding(.vertical, 4)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(tr(certaintyOpen ? "more.expanded" : "more.collapsed"))
                        if mostLikelyShown(sure.words) {
                            Text(rendered(mostLikelyWords(sure.words)))
                                .appFont(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.bottom, -Self.hang)
            if let sure, certaintyOpen {
                VStack(alignment: .leading, spacing: 0) {
                    MoreText(opened(sure))
                    if idle {
                        NavigationLink(value: Route.help(.odds)) {
                            HStack(spacing: 4) {
                                Text(tr("certainty.help"))
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
            if whiteRunny(o) {
                Text(tr("outcome.whiteRunny"))
                    .appFont(.footnote)
                    .foregroundStyle(.orange)
                    .padding(.top, 2 + Self.hang)
            }
        }
        .multilineTextAlignment(.center)
        #if DEBUG
        // What the line says, and what a press would open last (the time
        // range), whether open or not; and whether the white's line shows:
        // for the scripted checks.
        .onChange(of: sure.map { "\(tr(certaintyKey($0.words.certainty))) | \(opened($0).last ?? "")" } ?? "none",
                  initial: true) { _, said in
            Screenshots.log("certainty \(said)")
        }
        .onChange(of: whiteRunny(o), initial: true) { _, shown in
            Screenshots.log("white \(shown)")
        }
        // Whether "Most likely" shows under the word, unpressed.
        .onChange(of: sure.map { mostLikelyShown($0.words) } ?? false, initial: true) { _, shown in
            Screenshots.log("likely \(shown)")
        }
        #endif
    }

    /// How sure I am, in this phase: while idle, the choice on screen's;
    /// while the egg is in, its plan's, where the white sets; after the
    /// pull, nothing.
    private var certainty: CertaintyReading? {
        switch phase {
        case .idle: planner.heldCertainty
        case .heating, .cooking: cook.plan?.solution.whiteSets == true ? cook.heldCertainty : nil
        case .pull, .cooling, .done: nil
        }
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
                    Text(tr(certaintyKey(c))).appFont(.subheadline, weight: .semibold)
                }
            }
            .padding(.vertical, 4)
            ZStack {
                ForEach(donenessAnchors.indices, id: \.self) { i in
                    Text(tr("certainty.mostLikely", ["word": .text(tr(donenessAnchors[i].key))]))
                        .appFont(.footnote)
                }
            }
        }
    }

    /// Whether to say the white might still be runny: the choice on screen's
    /// while idle, the plan's while the egg is in, and once it is out the
    /// forecast as it ran (`Cook.asRan`), not a plan made since on a
    /// posterior that has learned from this egg.
    /// Never under "Are the eggs still in the water?": not a caveat about the
    /// pull the question doubts (onescreen review 3).
    private func whiteRunny(_ o: Outcome?) -> Bool {
        if asking { return false }
        if phase != .idle, let ran = cook.asRan { return forecastWhiteAtRisk(ran.forecast) }
        return o.map(whiteAtRisk) ?? false
    }

    /// A key with its counts and its doneness words, rendered.
    private func rendered(_ ref: WordsRef) -> String {
        var args: CopyArgs = [:]
        for (name, value) in ref.args { args[name] = .number(value) }
        for (name, key) in ref.words { args[name] = .text(tr(key)) }
        return tr(ref.key, args)
    }

    /// What pressing the certainty line opens: the interval, "most likely"
    /// when it is not already said, and the likely time range in the clock's
    /// own terms (core `timeRangeWords`, onescreen review 2.3): while idle
    /// whole times, m:ss as the clock shows them; once a cook runs, the times
    /// of day to take the eggs out, not whole times under a clock counting
    /// down, and for a reading held over a plan that has moved since (a slow
    /// hob's lengthening guess) about the plan's time now.
    private func opened(_ sure: CertaintyReading) -> [String] {
        var lines = [rendered(intervalWords(sure.words))]
        if mostLikelyOpened(sure.words) { lines.append(rendered(mostLikelyWords(sure.words))) }
        let running = phase == .idle ? nil : cook.running
        let range = timeRangeWords(sure, startedAtS: running?.startedAtS, cookTimeS: cook.plan?.cookTimeS ?? 0)
        let said = { (s: Double) in
            range.ofDay ? timeOfDay(Date(timeIntervalSince1970: s)) : clockString(s)
        }
        lines.append(tr(range.key, ["low": .text(said(range.lowS)), "high": .text(said(range.highS))]))
        return lines
    }

    /// The grace ran out unanswered, so I assumed the eggs came out, and a
    /// correction since would cook them longer: the plan asks whether they
    /// are still in the water (DECISIONS.md 98), the question in the phase
    /// label's place, the time since they were due out under it, and
    /// nothing past the question - not the cooling, nor Done - until it is
    /// answered (`PhaseActions`).
    private var asking: Bool { phase != .idle && cook.plan?.askIfStillIn == true }

    /// The web's clock face in every phase: the countdown (the time heated,
    /// counting up, once the slow hob has lengthened the guess), how late the
    /// pull is running while the eggs wait to come out, and at the end the
    /// time the egg was in the water.
    private var bigTime: String {
        if asking { return "+" + clockString(max(0, now.timeIntervalSince(cook.pullAt ?? now))) }
        return switch phase {
        case .idle: planner.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
        // Once the slow hob has lengthened the guess, the pull is a guess
        // that keeps moving and would read 0:00 while the water still heats
        // (running-cook review 3): the time heated, counting up, instead.
        case .heating where cook.plan?.lengthened == true:
            clockString(now.timeIntervalSince(cook.startedAt ?? now))
        case .heating, .cooking: clockString(cook.secondsToPull(at: now))
        case .pull: "+" + clockString(now.timeIntervalSince(cook.pullAt ?? now))
        case .cooling: clockString(cook.secondsToCoolDone(at: now))
        case .done: clockString(cook.cookSeconds)
        }
    }

    #if DEBUG
    /// This frame as the debug log says it: its moment, epoch s, the phase,
    /// the time, the line under it, and the certainty's time range.
    private var frame: String {
        let range = certainty.map { opened($0).last ?? "" } ?? "none"
        return String(format: "%.3f", now.timeIntervalSince1970) + " \(phase.rawValue) \(bigTime) | \(subline) | \(range)"
    }
    #endif

    /// The line under the clock: core's key, with this phase's arguments.
    private var subline: String {
        if asking { return tr("readout.sub.stillIn") }
        let key = model.keys(phase).subline
        return switch phase {
        case .idle:
            tr(key, [
                "boil": .text(clockString(planner.timeToBoilS)),
                "water": .text(planner.show(.water, planner.waterLitres)),
            ])
        case .heating:
            tr(key, [
                "elapsed": .text(clockString(now.timeIntervalSince(cook.startedAt ?? now))),
                "boil": .text(clockString(cook.assumedBoilS)),
            ])
        case .cooking:
            tr(key, [
                "boil": .text(clockString(cook.assumedBoilS)),
                "after": .text(clockString(cook.secondsAfterBoil)),
            ])
        case .done:
            tr(key, [
                "boil": .text(clockString(cook.assumedBoilS)),
                "cooking": .text(clockString(cook.cookSeconds - cook.assumedBoilS)),
            ])
        case .pull, .cooling:
            tr(key)
        }
    }
}
