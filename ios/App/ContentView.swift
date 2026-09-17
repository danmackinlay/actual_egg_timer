import SwiftUI
import EggTimerCore

/// The first vertical slice: a doneness slider, and the cook time the ported
/// physics says it needs. Deliberately not the whole web app - this exists to
/// prove the chain from the Swift package through to a screen, and to be the
/// thing notifications and a Live Activity get bolted onto next.
struct ContentView: View {
    @State private var kitchen = Kitchen()
    @State private var cook = Cook()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    readout
                    action
                    if cook.phase == .idle { controls }
                    colophon
                }
                .padding(20)
            }
            .navigationTitle("Actual Egg Timer")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var readout: some View {
        VStack(spacing: 6) {
            Text(phaseLabel)
                .font(.caption.smallCaps())
                .foregroundStyle(cook.phase == .pull ? .orange : .secondary)

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
                }
                .padding(.top, 10)

                Text(textureNote(peakYolkC: result.peakYolkC, peakWhiteC: result.peakWhiteC))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }

            if let solution = kitchen.solution, !solution.reachable {
                Text("Not reachable — softest here is \(Int(solution.softestLevel * 100))%")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
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

    private var phaseLabel: String {
        switch cook.phase {
        case .idle: "Total time"
        case .cooking: "Cooking"
        case .pull: "Out of the water — now"
        case .cooling: kitchen.cooling == .ice ? "Cooling — leave in the ice" : "Cooling"
        case .done: "Done"
        }
    }

    private var bigTime: String {
        switch cook.phase {
        case .idle: kitchen.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
        case .cooking: clockString(cook.secondsToPull)
        case .pull: "NOW"
        case .cooling: clockString(cook.secondsToCoolDone)
        case .done: "Eat"
        }
    }

    private var subline: String {
        switch cook.phase {
        case .idle:
            "from eggs in to eggs out"
        case .cooking:
            switch cook.alarmAuthorized {
            case .some(true): "alarm set for \(Self.clock.string(from: cook.pullAt ?? .now))"
            case .some(false): "no notification permission — keep the app open"
            case .none: "setting the alarm…"
            }
        case .pull:
            "carryover is running"
        case .cooling:
            "\(Int(Cook.coolingSeconds / 60)) minutes, or the yolk keeps cooking"
        case .done:
            "that is the egg you asked for"
        }
    }

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    @ViewBuilder
    private var action: some View {
        switch cook.phase {
        case .idle:
            Button {
                guard let seconds = kitchen.solution?.result.cookTimeS else { return }
                Task { await cook.start(cookSeconds: seconds, cooling: kitchen.cooling) }
            } label: {
                Text("Eggs in").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(kitchen.solution == nil)

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

    private var controls: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                LabeledContent("Doneness") {
                    Text(kitchen.label).foregroundStyle(.secondary)
                }
                Slider(value: $kitchen.doneness, in: 0...1)
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

            Picker("Then", selection: $kitchen.cooling) {
                Text("Ice bath").tag(Cooling.ice)
                Text("Cold tap").tag(Cooling.tap)
                Text("Counter").tag(Cooling.counter)
            }
            .pickerStyle(.segmented)
        }
    }

    private var colophon: some View {
        Text("Eggs into boiling water, then straight into the chosen cooling. "
             + "Times computed from heat conduction and denaturation kinetics, "
             + "not from a recipe.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ContentView()
}
