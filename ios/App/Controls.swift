import SwiftUI
import EggTimerCore
import EggTimerApp
import EggTimerShared

/// The small controls the setup sentence's panels and Settings share: a stored
/// SI value on a stepper or in a typed field, in the cook's units.

/// What a − or + tells about the finger on it while a cook runs: down (true)
/// and up (false), for its field, so a hold is committed on release and a
/// tap after its settle (`Edits`). Set once, at the screen's root; nothing
/// while idle.
struct EditGesture {
    var touch: (ControlField, Bool) -> Void = { _, _ in }
}

extension EnvironmentValues {
    @Entry var editGesture = EditGesture()
}

/// A number as the cook typed it, or nil if it is not one. A comma is the
/// decimal point on half the world's keyboards, and a stray space is not a
/// mistake worth refusing.
func parseTyped(_ text: String) -> Double? {
    Double(text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
}

/// An SI binding seen through a measure: it reads the stored value as
/// displayed, and a control's value as SI, clamped by the limit.
func measured(_ m: Measure, _ si: Binding<Double>) -> Binding<Double> {
    Binding(
        get: { display(m, si.wrappedValue) },
        set: { if let stored = parse(m, $0) { si.wrappedValue = stored } }
    )
}

/// A stored SI value on a stepper, in the cook's units: its value and the
/// stepper's buttons, for the end of a line. The stepper steps the DISPLAYED
/// value, from inside bounds that are the limits rounded inward to the step,
/// and writes back only when tapped - the round trip in `Units.swift`, so a
/// quart stays a quart and never becomes 1.99.
struct StepperValue: View {
    let label: String
    let measure: Measure
    @Binding var value: Double
    let show: (Double) -> String
    /// The control a correction from it is, while a cook runs.
    var field: ControlField? = nil
    @Environment(\.editGesture) private var gesture

    var body: some View {
        HStack(spacing: 10) {
            // One line, whatever the face: a value is never broken between
            // its number and its unit, which the wider serif of 1750 did.
            Text(show(value))
                .systemFigures()
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
            Stepper(label, value: measured(measure, $value), in: measure.bounds ?? 0...0, step: measure.step) { on in
                if let field { gesture.touch(field, on) }
            }
                .labelsHidden()
                .accessibilityValue(show(value))
        }
    }
}

/// `StepperValue` with its label, for a line of its own.
struct StepperRow: View {
    let label: String
    let measure: Measure
    @Binding var value: Double
    let show: (Double) -> String
    var field: ControlField? = nil

    var body: some View {
        HStack {
            Text(label)
            Spacer(minLength: 8)
            StepperValue(label: label, measure: measure, value: $value, show: show, field: field)
        }
    }
}

/// A whole number of eggs, for the end of a line. The core counts them as a
/// Double because it mirrors a TypeScript `number`; that stops here rather
/// than reaching the control.
struct CountValue: View {
    let label: String
    @Binding var value: Int
    let range: ClosedRange<Double>
    var field: ControlField? = nil
    @Environment(\.editGesture) private var gesture

    var body: some View {
        HStack(spacing: 10) {
            Text(countText(Double(value)))
                .systemFigures()
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Stepper(label, value: $value, in: Int(range.lowerBound)...Int(range.upperBound)) { on in
                if let field { gesture.touch(field, on) }
            }
                .labelsHidden()
                .accessibilityValue(countText(Double(value)))
        }
    }
}

/// A stored SI value typed in, in the cook's units, as the web's number
/// fields are, with a stepper beside it. What is typed is kept while it is
/// being typed; every other time the field shows the stored value rounded to
/// its step, so the field never fights the cursor and a rounded display is
/// never parsed back over the stored value. A comma is the decimal point on
/// half the world's keyboards (`parseTyped`).
///
/// The stepper steps to the next point of the measure's grid strictly past
/// the stored value, as the web's `stepUp` does, so a typed 58.3 g goes up to
/// 58.5, not from the 58.5 the field rounds it to on to 59. It repeats while
/// held. A step ends the typing, so the field shows the number stepped to
/// rather than what was half typed.
struct MeasureField: View {
    let label: String
    let measure: Measure
    let value: Double
    let set: (Double) -> Void
    var field: ControlField? = nil
    @Environment(\.editGesture) private var gesture
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 6) {
                TextField(label, text: $text)
                    .systemFigures()
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 72)
                    .focused($focused)
                    .onChange(of: text) {
                        guard focused else { return }
                        if let typed = parseTyped(text), let si = parse(measure, typed) { set(si) }
                    }
                Text(tr(measure.unitKey))
                    .foregroundStyle(.secondary)
                Stepper(label) {
                    step(up: true)
                } onDecrement: {
                    step(up: false)
                } onEditingChanged: { on in
                    if let field { gesture.touch(field, on) }
                }
                    .labelsHidden()
                    .accessibilityValue(spoken)
            }
        }
        .onAppear { text = shown }
        .onChange(of: value) { if !focused { text = shown } }
        .onChange(of: measure) { text = shown }
        .onChange(of: focused) { if !focused { text = shown } }
    }

    /// One press: the next point of the step's grid past the stored value,
    /// in the measure's unit, inside its bounds.
    private func step(up: Bool) {
        focused = false
        let k = fromSI(measure.unit, value) * measure.stepDen / measure.stepNum
        let n = up ? (k + 1e-9).rounded(.down) + 1 : (k - 1e-9).rounded(.up) - 1
        var next = n * measure.stepNum / measure.stepDen
        if let b = measure.bounds { next = min(b.upperBound, max(b.lowerBound, next)) }
        if let si = parse(measure, next) { set(si) }
    }

    /// The stored value as VoiceOver says it, with its unit: "58.5 g".
    private var spoken: String {
        let q = quantityText(measure, value)
        return tr(q.key, ["value": .fixed(q.value)])
    }

    /// The stored value as the field holds it: without the trailing zeros a
    /// readout keeps ("2", not "2.00").
    private var shown: String {
        let t = displayText(measure, value)
        guard t.contains(".") else { return t }
        var s = Substring(t)
        while s.hasSuffix("0") { s = s.dropLast() }
        if s.hasSuffix(".") { s = s.dropLast() }
        return String(s)
    }
}

/// A number in the measure's unit as a field holds it: to its decimals,
/// without trailing zeros ("65", "64.5").
func fieldText(_ m: Measure, _ value: Double) -> String {
    let t = String(format: "%.\(m.decimals)f", value)
    guard t.contains(".") else { return t }
    var s = Substring(t)
    while s.hasSuffix("0") { s = s.dropLast() }
    if s.hasSuffix(".") { s = s.dropLast() }
    return String(s)
}

/// A number that may be left empty, typed or stepped (the `feedback2` draft):
/// the probe's reading after a cook, and the room in Settings. The empty
/// field shows, greyed, where the − and + start: the peak the cook was
/// started at, or the room assumed. A press steps on the measure's own grid
/// for the − and + (`stepPast`: whole degrees for a probe that is typed to a
/// tenth), from what is typed, or from the greyed number when nothing is, and
/// repeats while held. Nothing untouched is ever taken as typed. A step ends
/// the typing, so the field shows the number stepped to.
struct NudgeField: View {
    /// What VoiceOver calls the field and its stepper.
    let label: String
    let measure: Measure
    @Binding var text: String
    /// Where an empty field starts, stored in SI.
    let startSI: Double
    var width: CGFloat = 72
    var disabled = false
    /// When the typing ends, for a field that shows what was stored.
    var endEditing: () -> Void = {}
    var field: ControlField? = nil
    @Environment(\.editGesture) private var gesture
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            TextField(label, text: $text, prompt: Text(fieldText(measure, start)))
                .systemFigures()
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .textFieldStyle(.roundedBorder)
                .frame(minWidth: 56, maxWidth: width)
                .focused($focused)
                .disabled(disabled)
                .accessibilityLabel(label)
            Text(tr(measure.unitKey))
                .foregroundStyle(.secondary)
                .fixedSize()
            Stepper(label) {
                step(up: true)
            } onDecrement: {
                step(up: false)
            } onEditingChanged: { on in
                if let field { gesture.touch(field, on) }
            }
            .labelsHidden()
            .disabled(disabled)
            .accessibilityValue(text.isEmpty ? fieldText(measure, start) : text)
        }
        .onChange(of: focused) { if !focused { endEditing() } }
    }

    private var start: Double { nudgeFrom(measure, startSI) }

    private func step(up: Bool) {
        focused = false
        let from = parseTyped(text) ?? start
        text = fieldText(measure, stepPast(measure, from, up: up))
    }
}

/// The room in Settings, measured with the probe: empty until set, when the
/// room is assumed; emptied again, it is assumed again. The planner holds it
/// in SI (`roomC`); the field holds what the cook typed or stepped to, and
/// shows the stored room again whenever it is not being typed in.
struct RoomField: View {
    let planner: Planner
    @State private var text = ""

    var body: some View {
        let m = planner.measure(.roomTemp)
        NudgeField(
            label: tr("controls.room"), measure: m, text: $text, startSI: StartTempPresets.roomC,
            endEditing: { text = shown }, field: .room
        )
            .onAppear { text = shown }
            .onChange(of: text) {
                let typed = text.trimmingCharacters(in: .whitespaces)
                // What the stored room already shows is not a new number: a
                // rounded display is never parsed back over it.
                if typed == shown { return }
                if typed.isEmpty {
                    if planner.settings.roomC != nil { planner.setRoom(nil) }
                } else if let value = parseTyped(typed), let si = parse(m, value), si != planner.settings.roomC {
                    planner.setRoom(si)
                }
            }
            .onChange(of: m) { text = shown }
    }

    private var shown: String {
        guard let room = planner.settings.roomC else { return "" }
        let m = planner.measure(.roomTemp)
        return fieldText(m, display(m, room))
    }
}
