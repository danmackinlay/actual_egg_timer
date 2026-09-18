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
    @State private var confirmReset = false

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
                            // Inside the TimelineView for the same reason as
                            // the readout: reaching DONE changes no stored
                            // property, so nothing outside would redraw and the
                            // question would never appear.
                            if cook.phase == .done { feedback }
                        }
                    }
                    if cook.phase == .idle {
                        controls
                    } else {
                        cookNote
                    }
                    idleCalibrationLine
                    colophon
                }
                .padding(20)
            }
            .navigationTitle("Actual Egg Timer")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog(
                "Forget the calibration?", isPresented: $confirmReset, titleVisibility: .visible
            ) {
                Button("Forget it", role: .destructive) { kitchen.resetCalibration() }
                Button("Keep it", role: .cancel) {}
            } message: {
                Text("The model goes back to the literature values it shipped with.")
            }
        }
        .onAppear {
            // Install the notification delegate before anything can fire.
            Alarm.shared.activate()
            // The machine cannot solve for itself. A cold start needs a fresh
            // answer twice: when the boil is tapped, and whenever a slow hob
            // forces the estimate out.
            cook.resolveCookTime = { [kitchen] seconds, level in
                await kitchen.cookTime(timeToBoilS: seconds, level: level)
            }
            // The kitchen's own stored state, read here rather than in its
            // init: @State evaluates its initial value on every construction of
            // this struct and keeps only the first, so init was doing the I/O
            // and starting a solve for Kitchens that were then thrown away.
            kitchen.load()
            // After the solver is wired, so a restored cold start can revise
            // straight away rather than waiting for the next attempt.
            cook.restoreIfNeeded()
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

            // The COOK's own record once one is running, not the live inputs:
            // what is in the pan cannot change after "Eggs in", and answering
            // "how was it?" re-solves for the NEXT egg - which must not rewrite
            // the numbers describing the one just eaten.
            if let peaks = peaks {
                HStack(spacing: 24) {
                    stat("peak yolk", "\(Int(peaks.yolk.rounded()))°C")
                    stat("peak white", "\(Int(peaks.white.rounded()))°C")
                    if cook.ticket?.coldStart ?? kitchen.coldStart {
                        stat("after boil", clockString(afterBoilSeconds))
                    }
                }
                .padding(.top, 10)

                Text(textureNote(peakYolkC: peaks.yolk, peakWhiteC: peaks.white))
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

    /// The peak temperatures to display: the cook's own, if one is running or
    /// has just finished, otherwise the current solve.
    private var peaks: (yolk: Double, white: Double)? {
        if let ticket = cook.ticket { return (ticket.peakYolkC, ticket.peakWhiteC) }
        guard let result = kitchen.solution?.result else { return nil }
        return (result.peakYolkC, result.peakWhiteC)
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
            kitchen.coldStart
                ? "from eggs into COLD water, heat on, to eggs out"
                : "from eggs into BOILING water to eggs out"
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
            return "setting the alarm…"
        case .some(false):
            return "no notification permission — keep the app open"
        case .some(true):
            guard cook.pendingAlarms > 0 else {
                return "the alarm did not take — keep the app open"
            }
            return "alarm set for \(Self.clock.string(from: cook.pullAt ?? .now))"
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
                // Everything the cook is, frozen here. The calibration learns
                // from this and from nothing else, so a slider left somewhere
                // different afterwards cannot rewrite what was cooked.
                let ticket = Cook.Ticket(
                    doneness: kitchen.label,
                    peakYolkC: solution.result.peakYolkC,
                    peakWhiteC: solution.result.peakWhiteC,
                    eggGrams: kitchen.eggMassG,
                    cooling: kitchen.cooling,
                    coldStart: kitchen.coldStart,
                    logNominalTarget: kitchen.logNominalTarget,
                    level: kitchen.doneness,
                    egg: kitchen.egg,
                    setup: kitchen.setup
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

                Button("Cancel", role: .destructive) {
                    cook.cancel()
                    kitchen.refresh()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

        case .done:
            Button("Start again") {
                cook.cancel()
                kitchen.refresh()
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)

        default:
            Button("Cancel", role: .destructive) {
                cook.cancel()
                kitchen.refresh()
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
        }
    }

    /// What is in the pan, once the controls are gone.
    @ViewBuilder
    private var cookNote: some View {
        if let ticket = cook.ticket {
            VStack(spacing: 4) {
                // The method, stated rather than implied. "Keep it boiling" is
                // an instruction to the hob and says nothing about whether the
                // egg went into cold water or boiling, which is the one thing
                // you cannot check once the controls are gone.
                Text(methodLine(ticket))
                    .font(.footnote.weight(.medium))
                Text("\(Int(ticket.eggGrams.rounded())) g · \(ticket.doneness.lowercased()) · "
                     + "peak yolk \(Int(ticket.peakYolkC.rounded()))°C")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    private func methodLine(_ ticket: Cook.Ticket) -> String {
        let start = ticket.coldStart ? "Cold start" : "Into boiling water"
        let after: String
        switch ticket.cooling {
        case .ice: after = "ice bath"
        case .tap: after = "cold tap"
        case .counter: after = "rest on the counter"
        }
        return "\(start) · then \(after)"
    }

    // MARK: - Learning from the egg

    /// The one question the app asks. Three answers is not a poor interface for
    /// a rating - it is the whole measurement. Ordinal feedback is worth one to
    /// two bits per egg, and asking for a number out of ten would collect
    /// precision that is not there.
    private var feedback: some View {
        VStack(spacing: 12) {
            // The block stays put and answers back rather than vanishing on
            // tap. Learning takes about a second, and an interface that
            // disappears the moment it is used leaves no way to tell whether
            // anything was recorded.
            if cook.feedbackGiven {
                Text(kitchen.learning ? "learning…" : "Thanks — it has adjusted.")
                    .font(.subheadline)
                Text(kitchen.learning ? " " : tunedLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            } else {
                Text("How was it?")
                    .font(.headline)

                HStack(spacing: 10) {
                    feedbackButton("Too soft", .tooSoft)
                    feedbackButton("Just right", .justRight)
                    feedbackButton("Too hard", .tooHard)
                }

                Text(calibrationNote)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 18))
    }

    private func feedbackButton(_ label: String, _ value: Feedback) -> some View {
        Button {
            // The cook owns this flag now, and persists it. As view state it
            // did not survive a relaunch, so a restored DONE screen asked again
            // and a second answer folded the same egg in twice.
            guard let ticket = cook.ticket, !cook.feedbackGiven else { return }
            cook.recordFeedbackGiven()
            Task {
                await kitchen.record(
                    feedback: value,
                    egg: ticket.egg,
                    setup: ticket.setup,
                    cookTimeS: cook.cookSeconds,
                    logNominalTarget: ticket.logNominalTarget
                )
            }
        } label: {
            Text(label)
                .font(.subheadline)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(kitchen.learning)
    }

    private var calibrationNote: String {
        if kitchen.learning { return "learning…" }
        if kitchen.eggsLogged == 0 {
            return "Telling it tunes the model to your eggs and your pan."
        }
        return tunedLine
    }

    private var tunedLine: String {
        let eggs = kitchen.eggsLogged
        let plural = eggs == 1 ? "egg" : "eggs"
        return "tuned on \(eggs) \(plural) · ±\(Int(kitchen.calibrationSpread.rounded()))%"
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
                // The table, not a narrower guess at it. This said 42...80,
                // so a stored mass that Settings.load had faithfully clamped to
                // Limits could not be represented by the control that set it -
                // in a file whose own comment promises every control reads the
                // same numbers.
                Slider(value: $kitchen.eggMassG, in: Limits.massG, step: 0.5)
            }

            // Rendered from the constants, so a button cannot say one thing
            // and the model another. The web app learned this the hard way.
            Picker("Egg from", selection: $kitchen.fromFridge) {
                Text("Fridge \(Int(StartTempPresets.fridgeC))°").tag(true)
                Text("Room \(Int(StartTempPresets.roomC))°").tag(false)
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
                countRow("Eggs in the pan", value: $kitchen.eggCount, range: Limits.eggCount)
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

                if kitchen.eggsLogged > 0 {
                    Divider()
                    // No "tuned on N eggs" here: that line sits under the
                    // controls, where it is visible without opening anything.
                    // This section only carries the thing you came here for.
                    Button("Forget what it learned", role: .destructive) {
                        confirmReset = true
                    }
                    .font(.footnote)

                    Text("The posterior is honest about its own spread, so a few wrong "
                         + "answers wash out after a few more eggs. This is for when you "
                         + "would rather not wait.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.top, 12)
        }
        .font(.subheadline)
    }

    /// A whole number of eggs. The core counts them as a Double because it
    /// mirrors a TypeScript `number`; that stops here rather than reaching the
    /// control.
    private func countRow(
        _ label: String, value: Binding<Int>, range: ClosedRange<Double>
    ) -> some View {
        Stepper(value: value, in: Int(range.lowerBound)...Int(range.upperBound)) {
            LabeledContent(label) {
                Text("\(value.wrappedValue)")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
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

    @ViewBuilder
    private var idleCalibrationLine: some View {
        if cook.phase == .idle && kitchen.eggsLogged > 0 {
            Text(tunedLine)
                .font(.caption)
                .foregroundStyle(.tertiary)
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
