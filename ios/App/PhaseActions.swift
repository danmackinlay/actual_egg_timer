import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// Under the controls, in every phase: the one slot for a longer line.
///
/// A function of the clock, like the readout: the egg screen's `TimelineView`
/// hands over the date it drew for, and the phase at that date.
struct PhaseSlot: View {
    let model: AppModel
    let phase: Phase
    /// What the sous-vide screen says at `now`, or nil for a pan and while a
    /// cook runs.
    let sousVide: SousVideCopy?

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        slot
    }

    /// The one place for a longer line (UI.md section 2). While idle: the
    /// refusal or that the level is a wild guess, or the sous-vide warning,
    /// or, before anything is learned, the first-egg welcome; and under a wild
    /// guess a change would make surer, the way to Help, which is one short
    /// line and goes under whichever is there.
    @ViewBuilder
    private var slot: some View {
        if phase == .heating || phase == .cooking, let line = model.runningWarning, !line.isEmpty {
            // While a cook runs, until the pull: what its plan says of the
            // level, as the idle screen says it: a correction that leaves the
            // white unset gets the longest time this pan can give, and the
            // slot says so.
            Text(line)
                .foregroundStyle(.orange)
                .appFont(.footnote)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        } else if phase == .idle {
            VStack(spacing: 10) {
                if let sousVide {
                    Text(sousVide.warn)
                        .foregroundStyle(.orange)
                } else if !planner.warning.isEmpty {
                    Text(planner.warning)
                        .foregroundStyle(.orange)
                } else if planner.eggsLogged == 0 && !planner.hasBoilMemory {
                    Text(tr(.`idle.welcome`))
                        .foregroundStyle(.secondary)
                }
                // The way to Help's advice (reach.ts, "when to advise").
                if planner.shownAdvice {
                    NavigationLink(value: Route.help(.reliable)) {
                        HStack(spacing: 4) {
                            Text(tr(.`advice.toggle`))
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

}

/// Directly under the time, in every phase: the hint, and under it one row
/// of buttons that move the cook on.
///
/// The row is Cancel on the left, small, at its own width, and the phase's
/// main button filling the rest, on the right where the thumb rests, with
/// room between them; a phase with only the main button gives it the whole
/// row, and one with only Cancel leaves the rest empty. The row is as tall
/// in every phase, the main button's height, so nothing below it moves.
/// Where the widest main button and Cancel do not fit side by side (at the
/// accessibility text sizes, in 1750's longer words), they stack, the main
/// button over Cancel, and the stack keeps the room of both in every phase.
/// The choice is made on the widest words the row can hold, never on the
/// phase's own, so it is the same in every phase. The hint keeps the room
/// of the tallest hint, its own at its foot. Only "still in the water?",
/// with its two answers and Cancel, and the heating hint's (i) opened go
/// past the room.
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

    /// Between Cancel and the main button: room enough that a wet thumb
    /// reaching for the one does not land on the other.
    private static let gap: CGFloat = 20

    var body: some View {
        VStack(spacing: 10) {
            if let r = readout, r.asking {
                asking(r)
            } else {
                ZStack(alignment: .bottom) {
                    hintRoom
                    hint
                }
                buttons(main: main, cancel: cancels)
            }
        }
    }

    // MARK: - The hint

    /// The hint's room, as tall as the tallest it is: idle's, with the
    /// widest time; Heating's, with its (i); Cooking's, with the alarm's line.
    private var hintRoom: some View {
        let widest = clockString(59 * 60 + 59)
        let boiling = planner.show(.temperature, planner.boilingC)
        return ZStack {
            Text(model.keys(.idle).hint.map { trChosen($0, ["time": .text(widest)]) } ?? " ")
            InfoRow(name: tr(.`action.hint.heating.info`), more: [], alignment: .center) {
                Text(model.keys(.heating).hint.map { tr($0) } ?? " ")
            }
            VStack(spacing: 4) {
                Text(model.keys(.cooking).hint.map { trChosen($0, ["boiling": .text(boiling)]) } ?? " ")
                Text(alarmLine)
            }
        }
        .appFont(.footnote)
        .multilineTextAlignment(.center)
        .hidden()
        .accessibilityHidden(true)
    }

    /// One of the core's hint lines in words, with the numbers it takes
    /// (`readoutAt`): `boiling` a temperature, `seconds` as it is. A view
    /// drawn for one phase may hold the readout of the next for a frame, so
    /// every hint is rendered with its own arguments, whichever phase drew it.
    private func hintText(_ line: ReadoutLine) -> String {
        var args: CopyArgs = [:]
        for (name, value) in line.args {
            args[name] = name == "boiling" ? .text(planner.show(.temperature, value)) : .int(Int(value))
        }
        return trChosen(line.key, args)
    }

    /// The phase's hint, at the foot of its room.
    @ViewBuilder
    private var hint: some View {
        switch phase {
        case .idle:
            footnote(sousVide?.hint ?? idleHint)
        case .heating:
            // What a full rolling boil looks like, and why the tap matters,
            // in its (i).
            InfoRow(
                name: tr(.`action.hint.heating.info`),
                more: [tr(.`action.hint.heating.more`)],
                alignment: .center
            ) {
                footnote(readout?.hint.map(hintText) ?? "")
            }
        case .cooking:
            VStack(spacing: 4) {
                // The web's hint: what the hob must do until the pull.
                Text(readout?.hint.map(hintText) ?? "")
                // Whether the alarm is really set: iOS's own line, since the
                // web's alarm is the open tab.
                Text(alarmLine)
            }
            .appFont(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        case .pull:
            // The web's hint: when the cooling starts on its own. Not on the
            // counter, where the grace runs out into Done and the line under
            // the time already says the yolk is still cooking.
            if let hint = readout?.hint {
                footnote(hintText(hint))
            }
        default:
            EmptyView()
        }
    }

    private func footnote(_ text: String) -> some View {
        Text(text)
            .appFont(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
    }

    // MARK: - The row

    /// The phase's main button: its words, what it does, and whether it is
    /// the accent's (Start again is not) or dead.
    private struct Main {
        let title: String
        var prominent = true
        var disabled = false
        let action: () -> Void
    }

    /// The phase's main button, if it has one.
    private var main: Main? {
        switch phase {
        case .idle where sousVide != nil:
            // Dead rather than absent. There is nothing to start, and a
            // button that has gone missing looks like a layout accident
            // where one that will not press is the answer.
            return Main(title: tr(.`action.eggsIn`), disabled: true) {}
        case .idle:
            return Main(
                title: tr(model.keys(.idle).action ?? .`action.eggsIn`),
                disabled: model.starting || planner.solution == nil || planner.solution?.whiteSets == false
            ) { model.eggsIn() }
        case .heating:
            // Invariant 6: tapping at first bubbles under-measures the boil
            // by 15-25%, so the button names the thing to wait for.
            return Main(title: tr(readout?.primary ?? .`action.fullBoil`)) { model.boil() }
        case .pull:
            // The cook's tap is the nearest thing to when the egg left the
            // water that the app will ever know, and the record calls it a
            // measured pull. Without it the grace runs out and the pull is
            // only assumed.
            return Main(title: tr(readout?.primary ?? pulledKey(.ice))) { model.pulledOut() }
        case .done:
            return Main(title: tr(readout?.primary ?? .`action.startAgain`), prominent: false) { model.startAgain() }
        default:
            return nil
        }
    }

    /// Whether the phase has Cancel: every phase of a cook under way.
    private var cancels: Bool {
        phase != .idle && phase != .done
    }

    /// The main button and Cancel side by side, or stacked where the widest
    /// of them do not fit (above). Each way holds, hidden, the widest the
    /// row can be, so the choice and the height are the same in every phase.
    private func buttons(main: Main?, cancel: Bool) -> some View {
        ViewThatFits(in: .horizontal) {
            ZStack {
                HStack(spacing: Self.gap) { cancelButton; mainShape }
                    .hidden()
                    .accessibilityHidden(true)
                HStack(spacing: Self.gap) {
                    if cancel { cancelButton }
                    if let main { mainButton(main) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            ZStack(alignment: .top) {
                VStack(spacing: 10) { mainShape; cancelButton }
                    .hidden()
                    .accessibilityHidden(true)
                VStack(spacing: 10) {
                    if let main { mainButton(main) }
                    if cancel { cancelButton }
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func mainButton(_ main: Main) -> some View {
        if main.prominent {
            Button(action: main.action) {
                Text(main.title).frame(maxWidth: .infinity).onAccent()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(main.disabled)
            .logBottom("main")
        } else {
            Button(action: main.action) {
                Text(main.title).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(main.disabled)
            .logBottom("main")
        }
    }

    /// The main button at its widest: the words of every main button that
    /// can stand beside Cancel, laid over one another.
    private var mainShape: some View {
        Button {} label: {
            ZStack {
                Text(tr(model.keys(.idle).action ?? .`action.eggsIn`))
                Text(tr(.`action.fullBoil`))
                Text(tr(pulledKey(planner.settings.cooling)))
                Text(tr(.`action.startAgain`))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }

    /// Cancel: small, grey, at its own width, so it reads as the way out and
    /// not the way on.
    private var cancelButton: some View {
        Button(tr(.`action.cancel`), role: .destructive) {
            model.cancel()
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
    }

    /// "Are the eggs still in the water?" (`ReadoutView`): the two answers as
    /// buttons a cook can press without reading the question again, yes the
    /// primary; then Cancel. Nothing past the question is shown.
    private func asking(_ r: Readout) -> some View {
        VStack(spacing: 10) {
            Button {
                model.stillIn()
            } label: {
                Text(tr(r.primary ?? .`ask.stillIn.yes`)).frame(maxWidth: .infinity).onAccent()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button {
                model.stillOut()
            } label: {
                Text(tr(r.secondary ?? .`ask.stillIn.no`)).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            cancelButton
        }
    }

    /// What a running cook's readout says at this frame's moment (core's
    /// `readoutAt`): the buttons and the hint. Nil idle.
    private var readout: Readout? {
        phase == .idle ? nil : cook.readout(atS: now.timeIntervalSince1970)
    }

    /// What Start is about to ask of the cook, above the button.
    private var idleHint: String {
        guard let solution = planner.solution else { return " " }
        return model.keys(.idle).hint.map { trChosen($0, ["time": .text(clockString(solution.result.cookTimeS))]) } ?? " "
    }

    /// What the alarm actually is, not what permission was granted.
    ///
    /// The authorization result alone would say "alarm set" whether or not the
    /// request had been accepted, so the pending count is read back rather than
    /// assumed. An egg timer that claims an alarm it has
    /// not got is worse than one with no alarm at all.
    private var alarmLine: String {
        switch cook.alarms.authorized {
        case .none:
            return tr(.`readout.alarm.setting`)
        case .some(false):
            return tr(.`readout.alarm.denied`)
        case .some(true):
            guard cook.alarms.pending > 0 else {
                return tr(.`readout.alarm.failed`)
            }
            let pull = cook.plan.map { Date(timeIntervalSince1970: $0.deadlines.cookEndS) } ?? now
            return tr(.`readout.alarm.set`, ["time": .text(timeOfDay(pull, withSeconds: true))])
        }
    }
}
