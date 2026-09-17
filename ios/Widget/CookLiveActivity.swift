import ActivityKit
import SwiftUI
import WidgetKit

/// The Lock Screen and Dynamic Island countdown.
///
/// This is the feature that makes a native egg timer worth having rather than a
/// bookmark. The notification says *when*; a Live Activity says *how long left*
/// without unlocking anything, which is the question you actually have while
/// standing at the hob with wet hands.
///
/// Every countdown here is `Text(timerInterval:)`, which the system ticks
/// itself. Nothing in this file runs once a second, and nothing in the app has
/// to wake up to keep it honest.
struct CookLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CookActivity.self) { context in
            lockScreen(context)
                .activityBackgroundTint(.black.opacity(0.35))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.stage.title, systemImage: context.state.stage.symbol)
                        .font(.caption)
                        .foregroundStyle(tint(context.state.stage))
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.attributes.doneness.lowercased()) · \(context.attributes.peakYolkC)°C yolk")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 2) {
                        countdown(context.state)
                            .font(.system(size: 40, weight: .semibold, design: .rounded))
                        Text(note(context.state))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            } compactLeading: {
                Image(systemName: context.state.stage.symbol)
                    .foregroundStyle(tint(context.state.stage))
            } compactTrailing: {
                countdown(context.state)
                    .font(.caption2)
                    .monospacedDigit()
                    // A compact region is a few characters wide. Without this a
                    // "12:34" countdown renders as an ellipsis, which is worse
                    // than no timer at all.
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.state.stage.symbol)
                    .foregroundStyle(tint(context.state.stage))
            }
            .keylineTint(tint(context.state.stage))
        }
    }

    private func lockScreen(_ context: ActivityViewContext<CookActivity>) -> some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Label(context.state.stage.title, systemImage: context.state.stage.symbol)
                    .font(.caption.smallCaps())
                    .foregroundStyle(tint(context.state.stage))

                Text(note(context.state))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                Text("\(Int(context.attributes.eggGrams.rounded())) g · \(context.attributes.doneness.lowercased()) · peak yolk \(context.attributes.peakYolkC)°C")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            // A system timer view does not truncate when it is squeezed: it
            // draws dashes where the digits should be, which is a countdown
            // that tells you nothing. So it takes the width it needs first and
            // the description wraps around it, never the other way round.
            countdown(context.state)
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .fixedSize()
                .layoutPriority(1)
        }
        .padding(16)
    }

    /// The countdown itself. `timerInterval` hands the range to the system,
    /// which draws and ticks it on the Lock Screen with no process of ours
    /// running - the same trick as scheduling the alarm at an absolute date.
    @ViewBuilder
    private func countdown(_ state: CookActivity.ContentState) -> some View {
        if state.stage.countsDown {
            Text(timerInterval: state.began...state.ends, countsDown: true)
                .multilineTextAlignment(.trailing)
        } else {
            Text(state.stage == .pull ? "NOW" : "Eat")
        }
    }

    private func note(_ state: CookActivity.ContentState) -> String {
        switch state.stage {
        case .heating:
            state.provisional ? "estimate until the boil is tapped" : "heating"
        case .cooking:
            state.provisional ? "estimate until the boil is tapped" : "until the eggs come out"
        case .pull:
            "into the cooling, or the yolk keeps going"
        case .cooling:
            "carryover still running"
        case .done:
            "that is the egg you asked for"
        }
    }

    private func tint(_ stage: CookActivity.Stage) -> Color {
        switch stage {
        case .heating: .orange
        case .cooking: .accentColor
        case .pull: .orange
        case .cooling: .cyan
        case .done: .green
        }
    }
}
