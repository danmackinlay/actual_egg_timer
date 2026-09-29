import SwiftUI
import EggTimerCore
import EggTimerCopy

/// The phase, the time, and the line under it; then the direction's slot.
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
    /// Whether the direction's (i) is open.
    @Binding var directionInfoOpen: Bool

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        VStack(spacing: 6) {
            if let copy = sousVide {
                Text(tr("readout.phase.startTime"))
                    .font(.caption.smallCaps())
                    .foregroundStyle(.secondary)
                // Not the 76 pt clock face the other phases use: "Yesterday" is
                // not a clock face and will not fit like one. The web app has a
                // CSS rule that says the same thing.
                Text(copy.headline)
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .fontDesign(.rounded)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(copy.subline)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            } else {
                Text(tr(model.keys(phase).label))
                    .font(.caption.smallCaps())
                    .foregroundStyle(phase == .pull ? .orange : .secondary)
                    .multilineTextAlignment(.center)

                Text(bigTime)
                    .font(.system(size: 76, weight: .semibold, design: .rounded))
                    .fontDesign(.rounded)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(.snappy, value: bigTime)

                sublineLine
                direction
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
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
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        } else {
            Text(subline)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// The direction's slot, beneath the time (UI.md section 8, the web's
    /// `renderOdds`): which way the egg is likely to miss, with one (i), "How
    /// sure I am", at its end; what the (i) opens; and a line when a runny
    /// white is a real risk.
    ///
    /// While idle it is the choice on screen's, and blank until this pot's
    /// surface lands. The sentence holds two lines, the most any of them
    /// takes, so a drag that changes it does not move the slider. Once a cook
    /// is running the direction and the white's line are what they were at
    /// "Eggs in"; the (i), which is about the slider, goes with the slider.
    /// Never where the white never sets: there is no cook to say anything
    /// about.
    ///
    /// There is no play-safe suggestion under it, and no "still learning" line,
    /// as on the web: the slider and the bracket already show the one, and "I
    /// can't call it yet" already says the other. What I learn from is the last
    /// paragraph of the (i).
    @ViewBuilder
    private var direction: some View {
        let idle = phase == .idle
        // While idle, the choice on screen's; once a cook is running, what it
        // was at "Eggs in".
        let o = idle ? planner.shownForecast : cook.ticket?.forecast
        VStack(spacing: 2) {
            HStack(alignment: .center, spacing: 2) {
                ZStack {
                    // Two lines' room while idle, one sentence centred in it.
                    if idle { Text(verbatim: " \n ").hidden().accessibilityHidden(true) }
                    Text(o.map { tr(directionKey($0)) } ?? "")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.subheadline.weight(.semibold))
                if idle && o != nil {
                    InfoButton(expanded: $directionInfoOpen, name: tr("outcome.info"))
                }
            }
            if idle && o != nil && directionInfoOpen {
                MoreText([tr("outcome.bracket"), tr("outcome.why"), tr("outcome.learning")])
                    .padding(.top, 4)
                    .transition(.opacity)
            }
            if let o, whiteAtRisk(o) {
                Text(tr("outcome.whiteRunny"))
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .padding(.top, 2)
            }
        }
        .multilineTextAlignment(.center)
    }

    /// The web's clock face in every phase: the countdown, how late the pull
    /// is running while the eggs wait to come out, and at the end the time
    /// the egg was in the water.
    private var bigTime: String {
        switch phase {
        case .idle: planner.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
        case .heating, .cooking: clockString(cook.secondsToPull)
        case .pull: "+" + clockString(now.timeIntervalSince(cook.pullAt ?? now))
        case .cooling: clockString(cook.secondsToCoolDone)
        case .done: clockString(cook.cookSeconds)
        }
    }

    /// The line under the clock: core's key, with this phase's arguments.
    private var subline: String {
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
