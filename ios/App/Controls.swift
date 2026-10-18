import SwiftUI
import EggTimerCore
import EggTimerApp
import EggTimerShared

/// The small controls the setup sentence's panels and Settings share: a stored
/// SI value on a stepper or in a typed field, in the cook's units.

/// What a control tells the correction in hand while a cook runs (`InHand`):
/// a finger down (true) and up (false) on a − or + of a group of the cook's
/// choices, and a control of no group used (core `HandControl`). Set once,
/// at the screen's root; nothing while idle.
struct EditGesture {
    var touch: (HandGroup, Bool) -> Void = { _, _ in }
    var used: (HandControl) -> Void = { _ in }
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
    /// The group of the cook's choices a change of it makes, while a cook
    /// runs.
    var field: HandGroup? = nil
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
    var field: HandGroup? = nil
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        // At the accessibility sizes the value and its stepper go under the
        // label, at the end, rather than squeeze it. The stepper says the
        // label, so it is drawn for the eye alone.
        if size.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .accessibilityHidden(true)
                HStack {
                    Spacer(minLength: 0)
                    StepperValue(label: label, measure: measure, value: $value, show: show, field: field)
                }
            }
        } else {
            HStack {
                Text(label)
                    .accessibilityHidden(true)
                Spacer(minLength: 8)
                StepperValue(label: label, measure: measure, value: $value, show: show, field: field)
            }
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
    var field: HandGroup? = nil
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
///
/// At the accessibility sizes the stepper keeps its size while the number
/// grows, so beside the label the field was left too narrow for "68", which
/// showed as "…". There the label goes above, as the egg size's does over
/// its menu, and the field takes the width the unit and the stepper leave.
struct MeasureField: View {
    let label: String
    let measure: Measure
    let value: Double
    let set: (Double) -> Void
    var field: HandGroup? = nil
    @Environment(\.editGesture) private var gesture
    @Environment(\.dynamicTypeSize) private var size
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        Group {
            if size.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    // The field, named by the same words, says it.
                    Text(label)
                        .accessibilityHidden(true)
                    controls(large: true)
                }
            } else {
                LabeledContent(label) {
                    controls(large: false)
                }
            }
        }
        .onAppear { text = shown }
        .onChange(of: value) { if !focused { text = shown } }
        .onChange(of: measure) { text = shown }
        .onChange(of: focused) { if !focused { text = shown } }
    }

    /// The field, its unit and the stepper; `large`, at the accessibility
    /// sizes, with the field as wide as the row leaves and the unit whole.
    private func controls(large: Bool) -> some View {
        HStack(spacing: 6) {
            TextField(label, text: $text)
                .systemFigures()
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: large ? .infinity : 72)
                .focused($focused)
                .onChange(of: text) {
                    guard focused else { return }
                    if let typed = parseTyped(text), let si = parse(measure, typed) { set(si) }
                }
            Text(tr(measure.unitKey))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: large, vertical: large)
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
    var field: HandGroup? = nil
    /// The control it is, when it makes no choice of the cook's: the probe's
    /// reading.
    var control: HandControl? = nil
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
                if let field { gesture.touch(field, on) } else if on, let control { gesture.used(control) }
            }
            .labelsHidden()
            .disabled(disabled)
            .accessibilityValue(text.isEmpty ? fieldText(measure, start) : text)
        }
        .onChange(of: focused) {
            if focused, field == nil, let control { gesture.used(control) }
            if !focused { endEditing() }
        }
    }

    private var start: Double { nudgeFrom(measure, startSI) }

    private func step(up: Bool) {
        focused = false
        let from = parseTyped(text) ?? start
        text = fieldText(measure, stepPast(measure, from, up: up))
    }
}

/// The room, in Settings and beside "at room temperature": empty until set,
/// when the room is assumed; emptied again, it is assumed again. The planner holds it
/// in SI (`roomC`); the field holds what the cook typed or stepped to, and
/// shows the stored room again whenever it is not being typed in.
struct RoomField: View {
    let planner: Planner
    @State private var text = ""

    var body: some View {
        let m = planner.measure(.roomTemp)
        NudgeField(
            label: tr(.`controls.room`), measure: m, text: $text, startSI: StartTempPresets.roomC,
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

/// The temperature of the water the eggs cool in, running or in a bowl,
/// whichever the cooling is: empty until set, when it shows greyed the one
/// the model assumes (mains water running, the room in a bowl); emptied
/// again, it is assumed again. As `RoomField`.
struct CoolingWaterField: View {
    let planner: Planner
    @State private var text = ""

    var body: some View {
        let m = planner.measure(.coolingWater)
        NudgeField(
            label: tr(.`controls.coolingWater`), measure: m, text: $text, startSI: planner.coolingWaterAssumedC,
            endEditing: { text = shown }, field: planner.settings.cooling == .tap ? .tapWater : .bowlWater
        )
            .onAppear { text = shown }
            .onChange(of: text) {
                let typed = text.trimmingCharacters(in: .whitespaces)
                // What the stored temperature already shows is not a new
                // number: a rounded display is never parsed back over it.
                if typed == shown { return }
                if typed.isEmpty {
                    if planner.coolingWaterC != nil { planner.setCoolingWater(nil) }
                } else if let value = parseTyped(typed), let si = parse(m, value), si != planner.coolingWaterC {
                    planner.setCoolingWater(si)
                }
            }
            .onChange(of: m) { text = shown }
            .onChange(of: planner.settings.cooling) { text = shown }
    }

    private var shown: String {
        guard let water = planner.coolingWaterC else { return "" }
        let m = planner.measure(.coolingWater)
        return fieldText(m, display(m, water))
    }
}

/// A choice of a few, one to a line: each a row the width of the panel, the
/// one chosen filled and ticked, as the web's list. Four names fit no phone's
/// width as segments, least of all at the accessibility sizes, where a row
/// instead wraps its name onto as many lines as it needs.
struct ListChoice<Tag: Hashable>: View {
    let label: String
    let choices: [(title: String, tag: Tag)]
    @Binding var selection: Tag

    var body: some View {
        VStack(spacing: 6) {
            ForEach(choices.indices, id: \.self) { i in
                let picked = choices[i].tag == selection
                Button {
                    selection = choices[i].tag
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(choices[i].title)
                            .appFont(.subheadline, weight: picked ? .semibold : nil)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark")
                            .font(.subheadline.weight(.semibold))
                            .opacity(picked ? 1 : 0)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .foregroundStyle(picked ? Palette.accentText : Color.primary)
                    .background(picked ? Palette.accent : Color(.systemBackground), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8).stroke(picked ? Palette.accent : Color.secondary.opacity(0.3))
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}

/// A choice of two or three, as segments, named for VoiceOver by its
/// heading. UIKit draws the segments' titles at one size at every text size,
/// so at the accessibility sizes the choices are a list instead, one to a
/// line, which grows with the text (`ListChoice`).
struct SegmentedChoice<Tag: Hashable>: View {
    let label: String
    let choices: [(title: String, tag: Tag)]
    @Binding var selection: Tag
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        if size.isAccessibilitySize {
            ListChoice(label: label, choices: choices, selection: $selection)
        } else {
            Picker(label, selection: $selection) {
                ForEach(choices.indices, id: \.self) { i in
                    Text(choices[i].title).tag(choices[i].tag)
                }
            }
            .segmented()
            .labelsHidden()
            .accessibilityLabel(label)
        }
    }
}
