import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Where the egg screen can push to: Settings, and Help, at a section or at
/// the top.
enum Route: Hashable {
    case settings
    case help(HelpSection?)
}

/// The egg: the web's layout (UI.md sections 3 and 8), and the phase machine
/// that runs it.
///
/// While idle, two controls and a sentence: the time, with the line under it;
/// the doneness slider; the setup sentence, whose clauses open their choices
/// in place; one slot for the longer line; and Start. Settings and Help are
/// rare visits, so they sit in the bar at the top, out of the thumb's way.
///
/// The controls disappear once a cook starts. Mid-cook they would be a lie -
/// the egg is already in the water and the answer is already fixed - and the
/// screen is better spent on the one number that matters.
struct ContentView: View {
    @State private var kitchen = Kitchen()
    @State private var cook = Cook()
    @State private var path: [Route] = []
    /// The clause whose choice is open under the sentence, if any. One at a
    /// time.
    @State private var openClause: Clause?
    /// The probe reading as typed, in the cook's units, and what was said
    /// back about it (E4).
    @State private var probeText = ""
    @State private var probeNote = ""
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    @State private var starting = false

    var body: some View {
        // One clock read for everything outside the timelines. `cook.phase(at:)`
        // takes the instant rather than sampling `Date.now` itself, so a phase
        // boundary cannot land between two reads and leave the label describing
        // one phase while the button below it describes the next.
        let outerPhase = cook.phase(at: .now)

        return NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 22) {
                    // The readout and the action are functions of the CLOCK,
                    // not of any stored property, so nothing the observation
                    // system watches ever changes while a cook counts down.
                    // TimelineView is what redraws them: it asks for a new body
                    // once a second, and hands over the date it drew for -
                    // which is the date the phase is computed from.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        readout(cook.phase(at: context.date), at: context.date)
                    }
                    if outerPhase == .idle {
                        donenessControl
                        setup
                    }
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let phase = cook.phase(at: context.date)
                        VStack(spacing: 18) {
                            slot(phase, at: context.date)
                            action(phase, at: context.date)
                            if phase != .idle && phase != .done { probeOffer }
                            // Inside the TimelineView for the same reason as
                            // the readout: reaching DONE changes no stored
                            // property, so nothing outside would redraw and
                            // the question would never appear.
                            if phase == .done { feedback }
                        }
                    }
                    if outerPhase != .idle { cookNote }
                }
                .padding(20)
            }
            .navigationTitle(tr("app.name"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // A running cook is always the egg, as on the web.
                if outerPhase == .idle {
                    ToolbarItem(placement: .topBarLeading) {
                        NavigationLink(value: Route.settings) { Text(tr("controls.settings")) }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: Route.help(nil)) { Text(tr("help.link")) }
                    }
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .settings: SettingsView(kitchen: kitchen)
                case .help(let section): HelpView(kitchen: kitchen, start: section)
                }
            }
        }
        .onAppear {
            // Install the notification delegate before anything can fire.
            Alarm.shared.activate()
            // The machine cannot solve for itself. A cold start needs a fresh
            // answer twice: when the boil is tapped, and whenever a slow hob
            // forces the estimate out.
            cook.resolveCookTime = { [kitchen] seconds, level, lean in
                await kitchen.cookResult(timeToBoilS: seconds, level: level, leanS: lean)
            }
            // Whether the cooling's alarm asks for a probe reading (E4).
            cook.probeWanted = { [kitchen] in kitchen.probe }
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

    /// The phase, the time, and the line under it; then the direction's slot.
    ///
    /// Sous-vide is answered honestly and separately: no cook to run, no clock
    /// to start, and a start time that has already been and gone. It branches
    /// FIRST, before any of the pan readout.
    private func readout(_ phase: Cook.Phase, at now: Date) -> some View {
        VStack(spacing: 6) {
            if kitchen.isSousVide && phase == .idle {
                let copy = sousVideCopy(kitchen.sousVide, now: now, units: kitchen.units)
                Text(tr("readout.phase.startTime"))
                    .font(.caption.smallCaps())
                    .foregroundStyle(.secondary)
                // Not the 76 pt clock face the other phases use: "Yesterday" is
                // not a clock face and will not fit like one. The web app has a
                // CSS rule that says the same thing.
                Text(copy.headline)
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(copy.subline)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            } else {
                Text(phaseLabel(phase))
                    .font(.caption.smallCaps())
                    .foregroundStyle(phase == .pull ? .orange : .secondary)
                    .multilineTextAlignment(.center)

                Text(bigTime(phase))
                    .font(.system(size: 76, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(.snappy, value: bigTime(phase))

                sublineLine(phase)
                direction(phase)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
    }

    /// The line under the time. "Based on history" has an (i) that says what
    /// history, as on the web.
    @ViewBuilder
    private func sublineLine(_ phase: Cook.Phase) -> some View {
        if phase == .idle && kitchen.coldStart && kitchen.hasBoilMemory {
            InfoRow(
                name: tr("readout.sub.coldAssumes.info"),
                more: [tr("readout.sub.coldAssumes.more")],
                alignment: .center
            ) {
                Text(subline(phase))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        } else {
            Text(subline(phase))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// The direction's slot, beneath the time: PASS B puts the web's direction
    /// sentence here (which way the egg is likely to miss, src/ui/outcome.ts),
    /// with its one (i), the play-safe suggestion and the white's line; and
    /// the hardness bracket under the slider. Until then it holds the odds
    /// (E5) and "I'm still learning", as iOS has had them.
    ///
    /// The line keeps its height while the choice is being made, so nothing
    /// below it moves when it lands.
    @ViewBuilder
    private func direction(_ phase: Cook.Phase) -> some View {
        let odds = oddsLine(phase)
        VStack(spacing: 2) {
            if let hit = odds.hit {
                // Why the odds start low, opened in place under this line.
                InfoRow(name: tr("odds.info"), more: [tr("odds.why")], alignment: .center) {
                    Text(hit)
                        .font(.footnote.weight(.semibold))
                }
            } else {
                Text(verbatim: " ")
                    .font(.footnote.weight(.semibold))
                    .frame(minHeight: 32)
            }
            if odds.learning {
                Text(tr("odds.stillLearning"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(.center)
    }

    /// The odds and "still learning" (E5). While idle they are the choice on
    /// screen's, and absent until this pot's surface lands; once a cook is
    /// running, what they were at "Eggs in". Never where the white never sets:
    /// there is no cook to give odds on.
    private func oddsLine(_ phase: Cook.Phase) -> (hit: String?, learning: Bool) {
        if phase == .idle {
            guard let d = kitchen.decision, kitchen.solution?.whiteSets == true else { return (nil, false) }
            return (tr("odds.hitTheMark", ["hits": .int(d.oddsTenths), "of": .int(10)]), d.stillLearning)
        }
        guard let ticket = cook.ticket else { return (nil, false) }
        return (ticket.oddsLine, ticket.stillLearning == true)
    }

    private func phaseLabel(_ phase: Cook.Phase) -> String {
        switch phase {
        case .idle: tr("readout.phase.total")
        case .heating: tr("readout.phase.heatingTap")
        case .cooking: tr(kitchen.heatOff ? "readout.phase.cookingHeatOff" : "readout.phase.cookingBoiling")
        case .pull: tr("readout.phase.pull")
        case .cooling:
            switch kitchen.cooling {
            case .ice: tr("readout.phase.coolingIce")
            case .tap: tr("readout.phase.coolingTap")
            case .counter: tr("readout.phase.cooling")
            }
        case .done: tr("readout.phase.done")
        }
    }

    private func bigTime(_ phase: Cook.Phase) -> String {
        switch phase {
        case .idle: kitchen.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
        case .heating, .cooking: clockString(cook.secondsToPull)
        case .pull: tr("readout.big.now")
        case .cooling: clockString(cook.secondsToCoolDone)
        case .done: tr("readout.big.eat")
        }
    }

    private func subline(_ phase: Cook.Phase) -> String {
        switch phase {
        case .idle:
            // The web's: on a cold start, the boil it assumes, and whether
            // that is history or a guess; with the heat off, the water, which
            // is the most load-bearing number in the cook. The time to boil
            // plays no part on a hot start, so it is not mentioned.
            if kitchen.coldStart {
                tr(kitchen.hasBoilMemory ? "readout.sub.coldAssumes" : "readout.sub.coldGuesses",
                   ["boil": .text(clockString(kitchen.timeToBoilS))])
            } else if kitchen.heatOff {
                tr("readout.sub.standing", ["water": .text(kitchen.show(.water, kitchen.waterLitres))])
            } else {
                tr("readout.sub.hot")
            }
        case .heating:
            tr("readout.sub.heatingEstimate")
        case .cooking:
            alarmLine
        case .pull:
            tr("readout.sub.pull")
        case .cooling:
            // The countdown ends when the middle of the yolk peaks (E4), which
            // is also when a probe reading is asked for.
            tr(cook.asksForProbe ? "readout.sub.coolingProbe" : "readout.sub.coolingPeak")
        case .done:
            tr("readout.sub.done")
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

    /// "Eggs in": start a cook on the answer to the inputs as they stand.
    ///
    /// `kitchen.solution` is what is on screen, and for the coalesce and the
    /// solve after any change it still answers the previous inputs - so this
    /// asks for the current one, which is the same answer unless an input has
    /// just moved. Nothing awaits between that answer landing and `cook.start(...)`
    /// taking it, so the ticket and the start are read off the inputs it was
    /// solved for, including a slider the answer has just snapped. They used
    /// to be read at two different moments - the ticket in the tap, the start
    /// mode in a task after it - and a picker change landing between the two
    /// ran a cold start's heating phase under a ticket that said hot.
    private func startCook() async {
        let current = await kitchen.currentSolution()
        starting = false
        guard cook.phase == .idle, let solution = current, solution.whiteSets else { return }
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
            setup: kitchen.setup,
            massFrom: kitchen.massFrom,
            sizeTable: kitchen.sizeTable,
            boilRemembered: kitchen.hasBoilMemory,
            units: kitchen.units,
            lang: Copy.activeLocale,
            // The choice on screen, if it has been made: the time
            // started IS the chosen one, and a mid-cook re-solve
            // carries its lean.
            leanS: kitchen.decision?.leanS ?? 0,
            oddsTenths: kitchen.decision?.oddsTenths,
            stillLearning: kitchen.decision?.stillLearning,
            // The cooling counts to the yolk's peak for this cook (E4).
            coolS: coolingSecondsFor(solution.result),
            probeMoment: probeMomentFor(solution.result, cooling: kitchen.cooling)
        )
        await cook.start(
            cookSeconds: solution.result.cookTimeS,
            assumedBoilS: kitchen.timeToBoilS,
            coldStart: kitchen.coldStart,
            ticket: ticket
        )
    }

    // MARK: - Action

    @ViewBuilder
    private func action(_ phase: Cook.Phase, at now: Date) -> some View {
        switch phase {
        case .idle where kitchen.isSousVide:
            VStack(spacing: 8) {
                Text(sousVideCopy(kitchen.sousVide, now: now, units: kitchen.units).hint)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                // Dead rather than absent. There is nothing to start, and a
                // button that has gone missing looks like a layout accident
                // where one that will not press is the answer.
                Button {} label: {
                    Text(tr("action.eggsIn")).frame(maxWidth: .infinity)
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
                    guard !starting else { return }
                    starting = true
                    Task { await startCook() }
                } label: {
                    Text(tr(kitchen.coldStart ? "action.startHeating" : "action.eggsIn"))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(starting || kitchen.solution == nil || kitchen.solution?.whiteSets == false)
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
                    Text(tr(kitchen.heatOff ? "action.hint.heatingStanding" : "action.hint.heating"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                // Invariant 6: tapping at first bubbles under-measures the boil
                // by 15-25%, so the button names the thing to wait for.
                Button {
                    Task {
                        if let measured = await cook.recordBoil() {
                            kitchen.rememberBoil(seconds: measured)
                        }
                    }
                } label: {
                    Text(tr("action.fullBoil")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(tr("action.cancel"), role: .destructive) {
                    cook.cancel()
                    kitchen.refresh()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

        case .pull:
            VStack(spacing: 10) {
                // The web app's button, in its words: the cook's tap is the
                // nearest thing to when the egg left the water that the app will
                // ever know, and the record calls it a measured pull. Without it
                // the grace runs out and the pull is only assumed.
                Button {
                    cook.pulledOut()
                } label: {
                    Text(tr(pulledKey)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(tr("action.cancel"), role: .destructive) {
                    cook.cancel()
                    kitchen.refresh()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

        case .done:
            Button(tr("action.startAgain")) {
                // An egg nobody answered about is still logged; it folds nothing.
                if !cook.feedbackGiven, let egg = cook.eggRecord(yolk: nil) {
                    kitchen.logUnanswered(egg)
                }
                probeText = ""
                probeNote = ""
                cook.cancel()
                kitchen.endEgg()
                kitchen.refresh()
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)

        default:
            Button(tr("action.cancel"), role: .destructive) {
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
                // In the system the egg was set up in, which the controls
                // cannot have changed since.
                Text(tr("cook.summary", [
                    "mass": .text(showIn(ticket.units ?? kitchen.units, .mass, ticket.eggGrams)),
                    "doneness": .text(ticket.doneness.lowercased()),
                    "yolk": .text(showIn(ticket.units ?? kitchen.units, .temperature, ticket.peakYolkC)),
                ]))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    private func methodLine(_ ticket: Cook.Ticket) -> String {
        let start = tr(ticket.coldStart ? "cook.method.cold" : "cook.method.hot")
        let after: String
        switch ticket.cooling {
        case .ice: after = tr("cook.method.ice")
        case .tap: after = tr("cook.method.tap")
        case .counter: after = tr("cook.method.counter")
        }
        return tr("cook.method", ["start": .text(start), "after": .text(after)])
    }

    // MARK: - The thermometer (E4)

    /// Offered once, while a cook is running, to a cook whose cooling ends at
    /// the yolk's peak. Either answer puts it away for good; the setting stays
    /// in the controls.
    @ViewBuilder
    private var probeOffer: some View {
        if !kitchen.probeAsked, cook.ticket?.probeMoment == true {
            VStack(spacing: 10) {
                Text(tr("probe.offer"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                HStack(spacing: 10) {
                    Button {
                        kitchen.answerProbeOffer(true)
                        cook.probeSettingChanged()
                    } label: {
                        Text(tr("probe.offer.yes")).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    Button {
                        kitchen.answerProbeOffer(false)
                    } label: {
                        Text(tr("probe.offer.no")).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// The reading, at DONE: typed in the cook's units, refused with the range
    /// it should be in when no believable kitchen could have made it, and
    /// otherwise folded into the egg with whatever else has been said.
    @ViewBuilder
    private var probeEntry: some View {
        if cook.asksForProbe {
            let given = kitchen.answers?.probe
            VStack(spacing: 8) {
                Text(tr("probe.now"))
                    .font(.headline)
                Text(tr("probe.hint"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    TextField(tr("probe.entry"), text: $probeText)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 150)
                        .disabled(given != nil)
                    Text(tr(kitchen.measure(.probeTemp).unitKey))
                        .foregroundStyle(.secondary)
                    Button(tr("probe.save")) { saveProbe() }
                        .buttonStyle(.bordered)
                        .disabled(given != nil || probeText.isEmpty)
                }
                if !probeNote.isEmpty {
                    Text(probeNote)
                        .font(.caption)
                        .foregroundStyle(given == nil ? .orange : .secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.bottom, 6)
        }
    }

    private func saveProbe() {
        guard let ticket = cook.ticket, kitchen.answers?.probe == nil else { return }
        // A comma is the decimal point in half the world's keyboards.
        let typed = Double(probeText.replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespaces))
        let reading = typed.flatMap { parse(kitchen.measure(.probeTemp), $0) }
        guard let scored = cook.eggRecord(yolk: nil).map(recordCookTimeS) else { return }
        let range = kitchen.probeRange(egg: ticket.egg, setup: ticket.setup, cookTimeS: scored)
        guard let reading, reading >= range.low, reading <= range.high else {
            probeNote = tr("probe.refused", [
                "low": .text(kitchen.show(.probeTemp, range.low)),
                "high": .text(kitchen.show(.probeTemp, range.high)),
            ])
            return
        }
        guard let probe = cook.probeReading(centreC: reading) else { return }
        probeNote = kitchen.show(.probeTemp, reading)
        answer(yolk: nil, white: nil, probe: probe)
    }

    /// What the pull button says, by where the eggs are going.
    private var pulledKey: String {
        switch cook.ticket?.cooling ?? kitchen.cooling {
        case .ice: "action.pulled.ice"
        case .tap: "action.pulled.tap"
        case .counter: "action.pulled.counter"
        }
    }

    // MARK: - Learning from the egg

    /// The two questions, both always on screen and neither required
    /// (INFERENCE.md section 3). Three answers each is not a poor interface for
    /// a rating - it is the whole measurement: ordinal feedback is worth one to
    /// two bits per egg, and a number out of ten would collect precision that is
    /// not there. There is no Skip button: an unanswered question is recorded as
    /// skipped when the next cook starts.
    private var feedback: some View {
        VStack(spacing: 12) {
            // After a relaunch the second question is not offered again: the
            // surface it would be folded against is gone, and the one left
            // unanswered stays a skip in the record.
            if cook.feedbackGiven && kitchen.answers == nil {
                Text(tr(kitchen.learning ? "feedback.learning" : "feedback.thanks"))
                    .font(.subheadline)
                Text(kitchen.learning ? " " : tunedLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            } else {
                probeEntry
                Text(tr("feedback.ask"))
                    .font(.headline)
                HStack(spacing: 10) {
                    yolkButton(tr("feedback.tooSoft"), .tooSoft)
                    yolkButton(tr("feedback.justRight"), .justRight)
                    yolkButton(tr("feedback.tooFirm"), .tooHard)
                }

                Text(tr("feedback.white.ask"))
                    .font(.headline)
                    .padding(.top, 4)
                HStack(spacing: 10) {
                    whiteButton(tr("feedback.white.runny"), .runny)
                    whiteButton(tr("feedback.white.tender"), .tender)
                    whiteButton(tr("feedback.white.firm"), .firm)
                }

                Text(tr("feedback.optional"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
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

    /// One answer, about the yolk or the white, in whichever order they come.
    /// The first writes the egg down, before anything is learned from it; the
    /// second folds the same egg again from the posterior before it.
    private func answer(yolk: Feedback?, white: WhiteReport?, probe: ProbeReading? = nil) {
        if kitchen.answers != nil {
            Task { await kitchen.secondAnswer(yolk: yolk, white: white, probe: probe) }
            return
        }
        // The cook owns the flag and persists it, so a relaunch neither asks
        // again nor logs the egg a second time as unanswered.
        guard !cook.feedbackGiven,
              let egg = cook.eggRecord(yolk: yolk, white: white, probe: probe) else { return }
        cook.recordFeedbackGiven()
        Task { await kitchen.record(egg) }
    }

    private func yolkButton(_ label: String, _ value: Feedback) -> some View {
        let given = kitchen.answers?.yolk
        return answerButton(label, chosen: given == value, answered: given != nil) {
            answer(yolk: value, white: nil)
        }
    }

    private func whiteButton(_ label: String, _ value: WhiteReport) -> some View {
        let given = kitchen.answers?.white
        return answerButton(label, chosen: given == value, answered: given != nil) {
            answer(yolk: nil, white: value)
        }
    }

    /// The answer given stays legible, filled; its row goes out of reach.
    @ViewBuilder
    private func answerButton(
        _ label: String, chosen: Bool, answered: Bool, action: @escaping () -> Void
    ) -> some View {
        let button = Button(action: action) {
            Text(label)
                .font(.subheadline)
                .frame(maxWidth: .infinity)
        }
        if chosen {
            button.buttonStyle(.borderedProminent).allowsHitTesting(false)
        } else {
            button.buttonStyle(.bordered).disabled(answered)
        }
    }

    private var calibrationNote: String {
        if kitchen.learning { return tr("feedback.learning") }
        if kitchen.answers != nil { return tr("feedback.thanks") }
        if kitchen.eggsLogged == 0 {
            return tr("feedback.invite")
        }
        return tunedLine
    }

    private var tunedLine: String {
        tr("learned.tuned", ["eggs": .int(kitchen.eggsLogged)])
    }

    // MARK: - The egg's two controls and its sentence

    /// The doneness slider, shaded by the odds, its five words under it, and
    /// its reading: the doneness and the peak yolk it asks for, or, in a bath,
    /// which bath - there is no peak there.
    private var donenessControl: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(tr("controls.doneness"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Slider(value: $kitchen.doneness, in: Limits.doneness, step: 0.01)
                .accessibilityLabel(tr("controls.doneness"))
                .accessibilityValue(kitchen.label)
            // Where this pan works: the odds at each level, in the yolk's
            // colour, and what it cannot deliver (OddsTrack). Inset by half a
            // thumb each side, so a level sits under the thumb that asks for it.
            if !kitchen.isSousVide, let solution = kitchen.solution {
                OddsTrack(solution: solution, profile: kitchen.oddsProfile)
                    .frame(height: 8)
                    .padding(.horizontal, 14)
            }
            ticks
            Text(donenessValue)
                .font(.subheadline.weight(.semibold))
                .padding(.top, 2)
            let note = donenessNote
            if !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The five doneness words, each under the level it names, as the web's
    /// ticks are. The ends are held inside the track.
    private var ticks: some View {
        GeometryReader { geo in
            let inset: CGFloat = 14
            let span = geo.size.width - 2 * inset
            ZStack(alignment: .topLeading) {
                ForEach(donenessAnchors.indices, id: \.self) { i in
                    let anchor = donenessAnchors[i]
                    if i == 0 {
                        Text(tr(anchor.key)).frame(maxWidth: .infinity, alignment: .leading)
                    } else if i == donenessAnchors.count - 1 {
                        Text(tr(anchor.key)).frame(maxWidth: .infinity, alignment: .trailing)
                    } else {
                        Text(tr(anchor.key))
                            .fixedSize()
                            .position(x: inset + CGFloat(anchor.level) * span, y: 8)
                    }
                }
            }
        }
        .frame(height: 16)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    private var donenessValue: String {
        if kitchen.isSousVide {
            return tr("controls.doneness.valueBath", [
                "doneness": .text(kitchen.label), "bath": .text(kitchen.show(.temperature, sousVideBathC)),
            ])
        }
        let yolk = kitchen.solution?.result.peakYolkC ?? targetPeakYolkC(kitchen.doneness)
        return tr("controls.doneness.value", [
            "doneness": .text(kitchen.label), "yolk": .text(kitchen.show(.temperature, yolk)),
        ])
    }

    /// What the yolk and white will be like, or, in a bath, the bath's own
    /// note.
    private var donenessNote: String {
        if kitchen.isSousVide {
            return sousVideCopy(kitchen.sousVide, now: .now, units: kitchen.units).note
        }
        guard let s = kitchen.solution else { return "" }
        return textureNote(peakYolkC: s.result.peakYolkC, peakWhiteC: s.result.peakWhiteC, whiteSets: s.whiteSets)
    }

    /// The setup sentence, and under it the choice of the clause that is open.
    /// A clause the sentence no longer has - sous-vide drops two - closes with
    /// it.
    private var setup: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupSentence(kitchen: kitchen, open: $openClause)
            if let clause = openClause, !(kitchen.isSousVide && (clause == .from || clause == .cooling)) {
                ClausePanel(kitchen: kitchen, clause: clause) {
                    withAnimation(.snappy) { openClause = nil }
                }
                .id(clause)
                .transition(.opacity)
            }
        }
    }

    /// The one place for a longer line (UI.md section 2). While idle: the
    /// refusal, or the sous-vide warning, or, before anything is learned, the
    /// first-egg welcome; and under low odds, the way to Help, which is one
    /// short line and goes under whichever is there.
    @ViewBuilder
    private func slot(_ phase: Cook.Phase, at now: Date) -> some View {
        if phase == .idle {
            VStack(spacing: 10) {
                if kitchen.isSousVide {
                    Text(sousVideCopy(kitchen.sousVide, now: now, units: kitchen.units).warn)
                        .foregroundStyle(.orange)
                } else if !kitchen.refusal.isEmpty {
                    Text(kitchen.refusal)
                        .foregroundStyle(.orange)
                } else if kitchen.eggsLogged == 0 && !kitchen.hasBoilMemory {
                    Text(tr("idle.welcome"))
                        .foregroundStyle(.secondary)
                }
                if adviceLinkShown {
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

    /// The low-odds link (reach.ts): while idle, when the odds at the level on
    /// screen are under 5/10, or 3/10 short of the best level's.
    private var adviceLinkShown: Bool {
        guard !kitchen.isSousVide, kitchen.solution?.whiteSets == true, let d = kitchen.decision else {
            return false
        }
        return adviceWanted(d.oddsTenths, profile: kitchen.oddsProfile)
    }

    /// What Start is about to ask of the cook, above the button.
    private var idleHint: String {
        guard let solution = kitchen.solution else { return " " }
        guard solution.whiteSets else { return tr("action.hint.whiteNeverSets") }
        if kitchen.coldStart { return tr("action.hint.cold") }
        if kitchen.heatOff { return tr("action.hint.hotStanding") }
        return tr("action.hint.hotBoiling", ["time": .text(clockString(solution.result.cookTimeS))])
    }
}

#Preview {
    ContentView()
}
