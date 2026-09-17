import SwiftUI
import EggTimerCore

/// The whole app: every input the solver has, the cook time the ported physics
/// says they need, and the phase machine that runs it.
///
/// The controls disappear once a cook starts. Mid-cook they would be a lie -
/// the egg is already in the water and the answer is already fixed - and the
/// screen is better spent on the one number that matters.
struct ContentView: View {
    @State private var kitchen = Kitchen()
    @State private var cook = Cook()
    @State private var showPan = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // The readout and the action button are functions of the
                    // CLOCK, not of any stored property, so nothing the
                    // observation system watches ever changes while a cook
                    // counts down. TimelineView is what redraws them: it asks
                    // for a new body once a second, and each one recomputes the
                    // phase from `Date.now`.
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        VStack(spacing: 24) {
                            readout
                            action
                        }
                    }
                    if cook.phase == .idle {
                        controls
                    } else {
                        cookNote
                    }
                    colophon
                }
                .padding(20)
            }
            .navigationTitle("Actual Egg Timer")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            // Install the notification delegate before anything can fire.
            Alarm.shared.activate()
            // The machine cannot solve for itself. A cold start needs a fresh
            // answer twice: when the boil is tapped, and whenever a slow hob
            // forces the estimate out.
            cook.resolveCookTime = { [kitchen] seconds in
                await kitchen.cookTime(timeToBoilS: seconds)
            }
        }
    }

    // MARK: - Readout

    private var readout: some View {
        VStack(spacing: 6) {
            Text(phaseLabel)
                .font(.caption.smallCaps())
                .foregroundStyle(cook.phase == .pull ? .orange : .secondary)
                .multilineTextAlignment(.center)

            Text(bigTime)
                .font(.system(size: 76, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .animation(.snappy, value: bigTime)

            Text(subline)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let result = kitchen.solution?.result {
                HStack(spacing: 24) {
                    stat("peak yolk", "\(Int(result.peakYolkC.rounded()))°C")
                    stat("peak white", "\(Int(result.peakWhiteC.rounded()))°C")
                    // The COOK's own record once one is running, not the live
                    // inputs: what is in the pan cannot change after "Eggs in".
                    if cook.ticket?.coldStart ?? kitchen.coldStart {
                        stat("after boil", clockString(afterBoilSeconds))
                    }
                }
                .padding(.top, 10)

                Text(textureNote(peakYolkC: result.peakYolkC, peakWhiteC: result.peakWhiteC))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }

            if !kitchen.refusal.isEmpty && cook.phase == .idle {
                Text(kitchen.refusal)
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value).font(.headline).monospacedDigit()
        }
    }

    /// Cooking time after the boil is reached - the number every recipe quotes,
    /// and the only part of a cold start comparable to one.
    private var afterBoilSeconds: Double {
        if cook.phase == .idle {
            return (kitchen.solution?.result.cookTimeS ?? 0) - kitchen.timeToBoilS
        }
        return cook.secondsAfterBoil
    }

    private var phaseLabel: String {
        switch cook.phase {
        case .idle: kitchen.coldStart ? "Total time, lid on" : "Total time"
        case .heating: "Heating — tap when it boils"
        case .cooking: kitchen.heatOff ? "Cooking — heat off, lid on" : "Cooking — keep it boiling"
        case .pull: "Out of the water — now"
        case .cooling: kitchen.cooling == .ice ? "Cooling — leave in the ice" : "Cooling"
        case .done: "Done"
        }
    }

    private var bigTime: String {
        switch cook.phase {
        case .idle: kitchen.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
        case .heating, .cooking: clockString(cook.secondsToPull)
        case .pull: "NOW"
        case .cooling: clockString(cook.secondsToCoolDone)
        case .done: "Eat"
        }
    }

    private var subline: String {
        switch cook.phase {
        case .idle:
            kitchen.coldStart ? "from eggs into cold water to eggs out" : "from eggs in to eggs out"
        case .heating:
            "estimate — the clock corrects itself when you tap the boil"
        case .cooking:
            alarmLine
        case .pull:
            "carryover is running"
        case .cooling:
            "\(Int(Cook.coolingSeconds / 60)) minutes, or the yolk keeps cooking"
        case .done:
            "that is the egg you asked for"
        }
    }

    private var alarmLine: String {
        switch cook.alarmAuthorized {
        case .some(true): "alarm set for \(Self.clock.string(from: cook.pullAt ?? .now))"
        case .some(false): "no notification permission — keep the app open"
        case .none: "setting the alarm…"
        }
    }

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    // MARK: - Action

    @ViewBuilder
    private var action: some View {
        switch cook.phase {
        case .idle:
            Button {
                guard let solution = kitchen.solution else { return }
                let ticket = Cook.Ticket(
                    doneness: kitchen.label,
                    peakYolkC: Int(solution.result.peakYolkC.rounded()),
                    eggGrams: kitchen.eggMassG,
                    cooling: kitchen.cooling,
                    coldStart: kitchen.coldStart
                )
                Task {
                    await cook.start(
                        cookSeconds: solution.result.cookTimeS,
                        assumedBoilS: kitchen.timeToBoilS,
                        coldStart: kitchen.coldStart,
                        ticket: ticket
                    )
                }
            } label: {
                Text(kitchen.coldStart ? "Eggs in, heat on" : "Eggs in")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(kitchen.solution == nil || kitchen.solution?.whiteSets == false)

        case .heating:
            VStack(spacing: 10) {
                // Invariant 6: tapping at first bubbles under-measures the boil
                // by 15-25%, so the button names the thing to wait for.
                Button {
                    Task {
                        if let measured = await cook.recordBoil() {
                            kitchen.rememberBoil(seconds: measured)
                        }
                    }
                } label: {
                    Text("Full rolling boil").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button("Cancel", role: .destructive) { cook.cancel() }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
            }

        case .done:
            Button("Start again") { cook.cancel() }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .frame(maxWidth: .infinity)

        default:
            Button("Cancel", role: .destructive) { cook.cancel() }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
        }
    }

    /// What is in the pan, once the controls are gone.
    @ViewBuilder
    private var cookNote: some View {
        if let ticket = cook.ticket {
            Text("\(Int(ticket.eggGrams.rounded())) g · \(ticket.doneness.lowercased()) · "
                 + "peak yolk \(ticket.peakYolkC)°C")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                LabeledContent("Doneness") {
                    Text(kitchen.label).foregroundStyle(.secondary)
                }
                Slider(value: $kitchen.doneness, in: Limits.doneness, step: 0.01)
                HStack {
                    Text("Runny")
                    Spacer()
                    Text("Hard")
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 6) {
                LabeledContent("Egg") {
                    Text("\(kitchen.eggMassG, specifier: "%.1f") g").foregroundStyle(.secondary)
                }
                Slider(value: $kitchen.eggMassG, in: 42...80, step: 0.5)
            }

            Picker("Egg from", selection: $kitchen.fromFridge) {
                Text("Fridge 4°").tag(true)
                Text("Room 20°").tag(false)
            }
            .pickerStyle(.segmented)

            Picker("Start", selection: $kitchen.coldStart) {
                Text("Boiling water").tag(false)
                Text("Cold start").tag(true)
            }
            .pickerStyle(.segmented)

            Picker("Then", selection: $kitchen.cooling) {
                Text("Ice bath").tag(Cooling.ice)
                Text("Cold tap").tag(Cooling.tap)
                Text("Counter").tag(Cooling.counter)
            }
            .pickerStyle(.segmented)

            pan
        }
    }

    /// The pan, the kitchen and the hob. Folded away because the defaults are
    /// right for most people most mornings, and a first-time user should not
    /// have to answer six questions to boil an egg.
    private var pan: some View {
        DisclosureGroup("Pan, hob and altitude", isExpanded: $showPan) {
            VStack(alignment: .leading, spacing: 20) {
                Picker("After the boil", selection: $kitchen.heatOff) {
                    Text("Keep boiling").tag(false)
                    Text("Heat off, lid on").tag(true)
                }
                .pickerStyle(.segmented)

                Text(kitchen.heatOff
                     ? "The standing method: the pan coasts down from the boil and the "
                       + "cook is whatever the stored heat can still do. Water volume "
                       + "decides whether it can do it at all."
                     : "The burner holds the water at a rolling boil for the whole cook.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                stepperRow(
                    "Water", value: $kitchen.waterLitres, range: Limits.waterLitres,
                    step: 0.25, format: "%.2f L"
                )
                stepperRow(
                    "Eggs in the pan", value: $kitchen.eggCount, range: Limits.eggCount,
                    step: 1, format: "%.0f"
                )
                stepperRow(
                    "Altitude", value: $kitchen.altitudeM, range: Limits.altitudeM,
                    step: 100, format: "%.0f m"
                )

                LabeledContent("Water boils at") {
                    Text("\(kitchen.boilingC, specifier: "%.1f") °C")
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.footnote)

                LabeledContent("Time to boil") {
                    Text(clockString(kitchen.timeToBoilS)
                         + (kitchen.hasBoilMemory ? "" : " (assumed)"))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.footnote)

                Text(kitchen.hasBoilMemory
                     ? "Measured on this pan at this volume. It is re-measured every "
                       + "cold start."
                     : "Never measured. Run one cold start and tap the boil, and this "
                       + "becomes your pan rather than a guess.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 12)
        }
        .font(.subheadline)
    }

    private func stepperRow(
        _ label: String, value: Binding<Double>, range: ClosedRange<Double>,
        step: Double, format: String
    ) -> some View {
        Stepper(value: value, in: range, step: step) {
            LabeledContent(label) {
                Text(String(format: format, value.wrappedValue))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }

    private var colophon: some View {
        Text("Times computed from heat conduction and denaturation kinetics, "
             + "not from a recipe. The cooling step is part of the recipe: "
             + "carryover is what ruins a soft egg.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ContentView()
}
