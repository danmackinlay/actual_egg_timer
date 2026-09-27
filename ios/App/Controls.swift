import SwiftUI
import EggTimerCore

/// The small controls the setup sentence's panels and Settings share: a stored
/// SI value on a stepper or in a typed field, in the cook's units.

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

    var body: some View {
        HStack(spacing: 10) {
            Text(show(value))
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Stepper(label, value: measured(measure, $value), in: measure.bounds ?? 0...0, step: measure.step)
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

    var body: some View {
        HStack {
            Text(label)
            Spacer(minLength: 8)
            StepperValue(label: label, measure: measure, value: $value, show: show)
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

    var body: some View {
        HStack(spacing: 10) {
            Text(countText(Double(value)))
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Stepper(label, value: $value, in: Int(range.lowerBound)...Int(range.upperBound))
                .labelsHidden()
                .accessibilityValue(countText(Double(value)))
        }
    }
}

/// A stored SI value typed in, in the cook's units, as the web's number
/// fields are. What is typed is kept while it is being typed; every other
/// time the field shows the stored value rounded to its step, so the field
/// never fights the cursor and a rounded display is never parsed back over
/// the stored value. A comma is the decimal point on half the world's
/// keyboards.
struct MeasureField: View {
    let label: String
    let measure: Measure
    let value: Double
    let set: (Double) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 6) {
                TextField(label, text: $text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 96)
                    .focused($focused)
                    .onChange(of: text) {
                        guard focused else { return }
                        let typed = Double(text.replacingOccurrences(of: ",", with: ".")
                            .trimmingCharacters(in: .whitespaces))
                        if let typed, let si = parse(measure, typed) { set(si) }
                    }
                Text(tr(measure.unitKey))
                    .foregroundStyle(.secondary)
            }
        }
        .onAppear { text = shown }
        .onChange(of: value) { if !focused { text = shown } }
        .onChange(of: measure) { text = shown }
        .onChange(of: focused) { if !focused { text = shown } }
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
