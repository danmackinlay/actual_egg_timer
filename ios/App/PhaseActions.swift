import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Under the controls, in every phase: the one slot for a longer line, the
/// hint and the button that move the cook on, and, while a cook runs, the
/// once-only offer of the thermometer (E4).
///
/// A function of the clock, like the readout: the egg screen's `TimelineView`
/// hands over the date it drew for, and the phase at that date.
struct PhaseActions: View {
    let model: AppModel
    let phase: Phase
    let now: Date

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        VStack(spacing: 18) {
            slot
            action
            if phase != .idle && phase != .done { probeOffer }
        }
    }

    // MARK: - The slot

    /// The one place for a longer line (UI.md section 2). While idle: the
    /// refusal, or the sous-vide warning, or, before anything is learned, the
    /// first-egg welcome; and under low odds, the way to Help, which is one
    /// short line and goes under whichever is there.
    @ViewBuilder
    private var slot: some View {
        if phase == .idle {
            VStack(spacing: 10) {
                if planner.isSousVide {
                    Text(sousVideCopy(planner.sousVide, now: now, units: planner.units).warn)
                        .foregroundStyle(.orange)
                } else if !planner.refusal.isEmpty {
                    Text(planner.refusal)
                        .foregroundStyle(.orange)
                } else if planner.eggsLogged == 0 && !planner.hasBoilMemory {
                    Text(tr("idle.welcome"))
                        .foregroundStyle(.secondary)
                }
                // The low-odds link (reach.ts).
                if planner.adviceWanted {
                    NavigationLink(value: Route.help(.reliable)) {
                        HStack(spacing: 4) {
                            Text(tr("advice.toggle"))
                            Image(systemName: "arrow.right")
                                .accessibilityHidden(true)
                        }
                    }
                    .tint(Palette.accent)
                }
            }
            .font(.footnote)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - The action

    @ViewBuilder
    private var action: some View {
        switch phase {
        case .idle where planner.isSousVide:
            VStack(spacing: 8) {
                Text(sousVideCopy(planner.sousVide, now: now, units: planner.units).hint)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                // Dead rather than absent. There is nothing to start, and a
                // button that has gone missing looks like a layout accident
                // where one that will not press is the answer.
                Button {} label: {
                    Text(tr("action.eggsIn")).frame(maxWidth: .infinity).onAccent()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(true)
            }

        case .idle:
            VStack(spacing: 8) {
                Text(idleHint)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    model.eggsIn()
                } label: {
                    Text(tr(model.keys(.idle).action ?? "action.eggsIn"))
                        .frame(maxWidth: .infinity)
                        .onAccent()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(model.starting || planner.solution == nil || planner.solution?.whiteSets == false)
            }

        case .heating:
            VStack(spacing: 10) {
                // What a full rolling boil looks like, and why the tap
                // matters, in its (i).
                InfoRow(
                    name: tr("action.hint.heating.info"),
                    more: [tr("action.hint.heating.more")],
                    alignment: .center
                ) {
                    Text(model.keys(.heating).hint.map { tr($0) } ?? "")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                // Invariant 6: tapping at first bubbles under-measures the boil
                // by 15-25%, so the button names the thing to wait for.
                Button {
                    Task {
                        if let measured = await cook.recordBoil() {
                            planner.rememberBoil(seconds: measured)
                        }
                    }
                } label: {
                    Text(tr(model.keys(.heating).action ?? "action.fullBoil")).frame(maxWidth: .infinity).onAccent()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(tr("action.cancel"), role: .destructive) {
                    model.cancel()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

        case .pull:
            VStack(spacing: 10) {
                // The web's hint: when the cooling starts on its own. Not on
                // the counter, where the grace runs out into Done and the line
                // under the time already says the yolk is still cooking.
                if let hint = model.keys(.pull).hint, let pullAt = cook.pullAt {
                    let left = max(0, (pullGraceSeconds - now.timeIntervalSince(pullAt)).rounded(.up))
                    Text(tr(hint, ["seconds": .int(Int(left))]))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                // The web app's button, in its words: the cook's tap is the
                // nearest thing to when the egg left the water that the app will
                // ever know, and the record calls it a measured pull. Without it
                // the grace runs out and the pull is only assumed.
                Button {
                    cook.pulledOut()
                } label: {
                    Text(tr(model.keys(.pull).action ?? pulledKey(.ice))).frame(maxWidth: .infinity).onAccent()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(tr("action.cancel"), role: .destructive) {
                    model.cancel()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

        case .done:
            Button(tr(model.keys(.done).action ?? "action.startAgain")) {
                model.startAgain()
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)

        default:
            VStack(spacing: 10) {
                if phase == .cooking {
                    VStack(spacing: 4) {
                        // The web's hint: what the hob must do until the pull.
                        Text(model.keys(.cooking).hint.map {
                            tr($0, ["boiling": .text(planner.show(
                                .temperature, cook.ticket?.setup.boilingC ?? planner.boilingC
                            ))])
                        } ?? "")
                        // Whether the alarm is really set: iOS's own line,
                        // since the web's alarm is the open tab.
                        Text(alarmLine)
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                }
                Button(tr("action.cancel"), role: .destructive) {
                    model.cancel()
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
            }
        }
    }

    /// What Start is about to ask of the cook, above the button.
    private var idleHint: String {
        guard let solution = planner.solution else { return " " }
        return model.keys(.idle).hint.map { tr($0, ["time": .text(clockString(solution.result.cookTimeS))]) } ?? " "
    }

    /// What the alarm actually is, not what permission was granted.
    ///
    /// This used to read the authorization result alone, so it said "alarm set"
    /// whether or not the request had been accepted - while ios/README.md
    /// claimed the app reads the pending count back "rather than assuming",
    /// which it did and then ignored. An egg timer that claims an alarm it has
    /// not got is worse than one with no alarm at all.
    private var alarmLine: String {
        switch cook.alarmAuthorized {
        case .none:
            return tr("readout.alarm.setting")
        case .some(false):
            return tr("readout.alarm.denied")
        case .some(true):
            guard cook.pendingAlarms > 0 else {
                return tr("readout.alarm.failed")
            }
            return tr("readout.alarm.set", ["time": .text(timeOfDay(cook.pullAt ?? .now, withSeconds: true))])
        }
    }

    // MARK: - The thermometer (E4)

    /// Offered once, while a cook is running, to a cook whose cooling ends at
    /// the yolk's peak. Either answer puts it away for good; the setting stays
    /// in the controls.
    @ViewBuilder
    private var probeOffer: some View {
        if !planner.probeAsked, cook.ticket?.probeMoment == true {
            VStack(spacing: 10) {
                Text(tr("probe.offer"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                HStack(spacing: 10) {
                    Button {
                        planner.answerProbeOffer(true)
                        cook.probeSettingChanged()
                    } label: {
                        Text(tr("probe.offer.yes")).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    Button {
                        planner.answerProbeOffer(false)
                    } label: {
                        Text(tr("probe.offer.no")).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}
