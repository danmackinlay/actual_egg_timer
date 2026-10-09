import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// Under the controls, in every phase: the one slot for a longer line, and
/// the hint and the button that move the cook on.
///
/// A function of the clock, like the readout: the egg screen's `TimelineView`
/// hands over the date it drew for, and the phase at that date.
struct PhaseActions: View {
    let model: AppModel
    let phase: Phase
    let now: Date
    /// What the sous-vide screen says at `now`, or nil for a pan and while a
    /// cook runs.
    let sousVide: SousVideCopy?

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        VStack(spacing: 18) {
            slot
            action
        }
    }

    // MARK: - The slot

    /// The one place for a longer line (UI.md section 2). While idle: the
    /// refusal or that the level is a wild guess, or the sous-vide warning,
    /// or, before anything is learned, the first-egg welcome; and under a wild
    /// guess a change would make surer, the way to Help, which is one short
    /// line and goes under whichever is there.
    @ViewBuilder
    private var slot: some View {
        if phase == .heating || phase == .cooking, let line = runningWarning, !line.isEmpty {
            // While a cook runs, until the pull: what its plan says of the
            // level, as the idle screen says it (design/one-screen.md
            // section 3: a correction that leaves the white unset gets the
            // longest time this pan can give, and the slot says so).
            Text(line)
                .foregroundStyle(.orange)
                .appFont(.footnote)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                #if DEBUG
                .onChange(of: line, initial: true) { _, said in Screenshots.log(.slot(text: said)) }
                #endif
        } else if phase == .idle {
            VStack(spacing: 10) {
                if let sousVide {
                    Text(sousVide.warn)
                        .foregroundStyle(.orange)
                } else if !planner.warning.isEmpty {
                    Text(planner.warning)
                        .foregroundStyle(.orange)
                } else if planner.eggsLogged == 0 && !planner.hasBoilMemory {
                    Text(tr("idle.welcome"))
                        .foregroundStyle(.secondary)
                }
                // The way to Help's advice (reach.ts, "when to advise").
                if planner.shownAdvice {
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
            .appFont(.footnote)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - The action

    @ViewBuilder
    private var action: some View {
        if let r = readout, r.asking {
            asking(r)
        } else {
            phaseAction
        }
    }

    /// "Are the eggs still in the water?" (`ReadoutView`): the two answers as
    /// buttons a cook can press without reading the question again, yes the
    /// primary; then Cancel. Nothing past the question is shown.
    private func asking(_ r: Readout) -> some View {
        VStack(spacing: 10) {
            Button {
                model.stillIn()
            } label: {
                Text(tr(r.primary ?? "ask.stillIn.yes")).frame(maxWidth: .infinity).onAccent()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button {
                model.stillOut()
            } label: {
                Text(tr(r.secondary ?? "ask.stillIn.no")).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            Button(tr("action.cancel"), role: .destructive) {
                model.cancel()
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private var phaseAction: some View {
        switch phase {
        case .idle where sousVide != nil:
            VStack(spacing: 8) {
                Text(sousVide?.hint ?? "")
                    .appFont(.footnote)
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
                    .appFont(.footnote)
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
                    Text(readout?.hint.map { tr($0.key) } ?? "")
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                // Invariant 6: tapping at first bubbles under-measures the boil
                // by 15-25%, so the button names the thing to wait for.
                Button {
                    model.boil()
                } label: {
                    Text(tr(readout?.primary ?? "action.fullBoil")).frame(maxWidth: .infinity).onAccent()
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
                if let hint = readout?.hint {
                    Text(tr(hint.key, ["seconds": .int(Int(hint.args["seconds"] ?? 0))]))
                        .appFont(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                // The web app's button, in its words: the cook's tap is the
                // nearest thing to when the egg left the water that the app will
                // ever know, and the record calls it a measured pull. Without it
                // the grace runs out and the pull is only assumed.
                Button {
                    model.pulledOut()
                } label: {
                    Text(tr(readout?.primary ?? pulledKey(.ice))).frame(maxWidth: .infinity).onAccent()
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
            Button(tr(readout?.primary ?? "action.startAgain")) {
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
                        Text(readout?.hint.map {
                            tr($0.key, ["boiling": .text(planner.show(.temperature, $0.args["boiling"] ?? 0))])
                        } ?? "")
                        // Whether the alarm is really set: iOS's own line,
                        // since the web's alarm is the open tab.
                        Text(alarmLine)
                    }
                    .appFont(.footnote)
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

    /// What a running cook's readout says at this frame's moment (core's
    /// `readoutAt`): the buttons and the hint. Nil idle.
    private var readout: Readout? {
        phase == .idle ? nil : cook.readout(atS: now.timeIntervalSince1970)
    }

    /// The running plan's warning: a refusal, or a wild guess at the
    /// level, in its own pot's words.
    private var runningWarning: String? {
        guard let plan = cook.plan else { return nil }
        let a = plan.answer
        return warningText(
            a.verdict, lowOdds: a.lowOdds, level: a.level, setup: plan.setup,
            water: planner.show(.water, plan.setup.waterLitres)
        )
    }

    /// What Start is about to ask of the cook, above the button.
    private var idleHint: String {
        guard let solution = planner.solution else { return " " }
        return model.keys(.idle).hint.map { tr($0, ["time": .text(clockString(solution.result.cookTimeS))]) } ?? " "
    }

    /// What the alarm actually is, not what permission was granted.
    ///
    /// The authorization result alone would say "alarm set" whether or not the
    /// request had been accepted, so the pending count is read back rather than
    /// assumed. An egg timer that claims an alarm it has
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
            let pull = cook.plan.map { Date(timeIntervalSince1970: $0.deadlines.cookEndS) } ?? now
            return tr("readout.alarm.set", ["time": .text(timeOfDay(pull, withSeconds: true))])
        }
    }
}
