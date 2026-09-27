import SwiftUI
import EggTimerCore
import EggTimerCopy

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
    /// The probe reading as typed, in the cook's units, and what was said
    /// back about it (E4).
    @State private var probeText = ""
    @State private var probeNote = ""
    /// True while "Eggs in" waits on a solve for the inputs as they now stand,
    /// so a second tap cannot start a second cook.
    @State private var starting = false
    /// The two disclosures under the odds: why they start low, and how to make
    /// this cook more reliable. Both open in place.
    @State private var showWhy = false
    @State private var showAdvice = false

    var body: some View {
        // One clock read for everything outside the timeline. `cook.phase(at:)`
        // takes the instant rather than sampling `Date.now` itself, so a phase
        // boundary cannot land between two reads and leave the label describing
        // one phase while the button below it describes the next.
        let outerPhase = cook.phase(at: .now)

        return NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // The readout and the action button are functions of the
                    // CLOCK, not of any stored property, so nothing the
                    // observation system watches ever changes while a cook
                    // counts down. TimelineView is what redraws them: it asks
                    // for a new body once a second, and hands over the date it
                    // drew for - which is the date the phase is computed from.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let phase = cook.phase(at: context.date)
                        VStack(spacing: 24) {
                            // Sous-vide is answered honestly and separately: no
                            // cook to run, no clock to start, and a start time
                            // that has already been and gone. It branches FIRST,
                            // before any of the pan readout - the web app used
                            // to branch only at the point of painting, after a
                            // full hot-start solve it discarded and after the
                            // stats row had already been written, so it left
                            // half of that answer on screen beside its own.
                            if kitchen.isSousVide && phase == .idle {
                                sousVideReadout(at: context.date)
                            } else {
                                readout(phase)
                                action(phase)
                                if phase != .idle && phase != .done { probeOffer }
                                // Inside the TimelineView for the same reason as
                                // the readout: reaching DONE changes no stored
                                // property, so nothing outside would redraw and
                                // the question would never appear.
                                if phase == .done { feedback }
                            }
                        }
                    }
                    if outerPhase == .idle {
                        controls
                    } else {
                        cookNote
                    }
                    idleCalibrationLine(outerPhase)
                    colophon
                }
                .padding(20)
            }
            .navigationTitle(tr("app.name"))
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog(
                tr("learned.confirm.title"), isPresented: $confirmReset, titleVisibility: .visible
            ) {
                Button(tr("learned.confirm.forget"), role: .destructive) { kitchen.resetCalibration() }
                Button(tr("learned.confirm.keep"), role: .cancel) {}
            } message: {
                Text(tr("learned.confirm.message"))
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

    private func readout(_ phase: Cook.Phase) -> some View {
        VStack(spacing: 6) {
            Text(phaseLabel(phase))
                .font(.caption.smallCaps())
                .foregroundStyle(phase == .pull ? .orange : .secondary)
                .multilineTextAlignment(.center)

            Text(bigTime(phase))
                .font(.system(size: 76, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .animation(.snappy, value: bigTime(phase))

            Text(subline(phase))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            // E5: the odds of the time on screen, and "still learning" for a
            // cook's first few eggs. The line keeps its height while the
            // choice is being made, so nothing below it moves when it lands.
            let odds = oddsLine(phase)
            HStack(spacing: 10) {
                Text(odds.hit ?? " ")
                    .font(.footnote.weight(.semibold))
                if odds.hit != nil {
                    // Why the odds start low, opened in place under this line.
                    Button {
                        withAnimation(.snappy) { showWhy.toggle() }
                    } label: {
                        Image(systemName: showWhy ? "info.circle.fill" : "info.circle")
                            .font(.footnote)
                            .frame(minWidth: 28, minHeight: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(tr("odds.info"))
                    .accessibilityValue(tr(showWhy ? "odds.shown" : "odds.hidden"))
                }
                if odds.learning {
                    Text(tr("odds.stillLearning"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.center)

            if showWhy && odds.hit != nil {
                Text(tr("odds.why"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
            }

            // Under low odds, the changes that would help this setup. Inline
            // and closed until asked for: discoverable, not intrusive.
            if phase == .idle && !kitchen.advice.isEmpty {
                DisclosureGroup(isExpanded: $showAdvice) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(kitchen.advice, id: \.self) { key in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Circle()
                                    .frame(width: 4, height: 4)
                                    .alignmentGuide(.firstTextBaseline) { $0[.bottom] + 4 }
                                Text(tr(key))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
                } label: {
                    Text(tr("advice.toggle"))
                        .font(.footnote)
                }
                .padding(.top, 2)
            }

            // The COOK's own record once one is running, not the live inputs:
            // what is in the pan cannot change after "Eggs in", and answering
            // "how was it?" re-solves for the NEXT egg - which must not rewrite
            // the numbers describing the one just eaten.
            if let peaks = peaks {
                HStack(spacing: 24) {
                    stat(tr("readout.stat.peakYolk"), kitchen.show(.temperature, peaks.yolk))
                    stat(tr("readout.stat.peakWhite"), kitchen.show(.temperature, peaks.white))
                    if cook.ticket?.coldStart ?? kitchen.coldStart {
                        stat(tr("readout.stat.afterBoil"), clockString(afterBoilSeconds(phase)))
                    }
                }
                .padding(.top, 10)

                Text(textureNote(peakYolkC: peaks.yolk, peakWhiteC: peaks.white))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }

            if !kitchen.refusal.isEmpty && phase == .idle {
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
    private func afterBoilSeconds(_ phase: Cook.Phase) -> Double {
        if phase == .idle {
            return (kitchen.solution?.result.cookTimeS ?? 0) - kitchen.timeToBoilS
        }
        return cook.secondsAfterBoil
    }

    private func phaseLabel(_ phase: Cook.Phase) -> String {
        switch phase {
        case .idle: tr(kitchen.coldStart ? "readout.phase.totalLidOn" : "readout.phase.total")
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
            tr(kitchen.coldStart ? "readout.sub.idleCold" : "readout.sub.idleHot")
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

    // MARK: - Sous-vide

    /// The sous-vide readout: hold times from the isothermal limit, and the plain
    /// statement that you should have started yesterday.
    ///
    /// The one number on screen from the bath is the BATH temperature, and it is
    /// labelled as such. The web app printed it under "peak yolk", which said
    /// something false about the egg - in a bath held at 58 °C the yolk does end
    /// up at 58 °C, which is the whole point, but the label still has to say
    /// which number it is.
    private func sousVideReadout(at now: Date) -> some View {
        let est = kitchen.sousVide
        let copy = sousVideCopy(est, now: now, units: kitchen.units)
        return VStack(spacing: 24) {
            VStack(spacing: 6) {
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

                // One stat, where a cook gets three. `equilibrate_s` is the
                // obvious candidate for the empty slots and is deliberately not
                // there: it is the one number in the estimate the module's own
                // caveat disowns - conduction only, and the white below 60 °C is
                // liquid and convecting, so it is too long by an unknown amount.
                // The holds are the numbers that make the answer what it is, and
                // they are in the line above as the total.
                stat(tr("readout.stat.bath"), kitchen.show(.temperature, est.bathC))
                    .padding(.top, 10)

                Text(copy.note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)

                Text(copy.warn)
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .padding(.horizontal, 12)
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))

            VStack(spacing: 6) {
                // Dead rather than absent. There is nothing to start, and a
                // button that has gone missing looks like a layout accident
                // where one that will not press is the answer.
                Button {} label: {
                    Text(tr("action.eggsIn")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(true)

                Text(copy.hint)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
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
    private func action(_ phase: Cook.Phase) -> some View {
        switch phase {
        case .idle:
            Button {
                guard !starting else { return }
                starting = true
                Task { await startCook() }
            } label: {
                Text(tr(kitchen.coldStart ? "action.eggsInHeatOn" : "action.eggsIn"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(starting || kitchen.solution == nil || kitchen.solution?.whiteSets == false)

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

    // MARK: - Controls

    private var controls: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                LabeledContent(tr("controls.doneness")) {
                    // The slider's plain reading is a PAN number - a peak yolk
                    // temperature something in water gets to. In a bath there is
                    // no peak, so the reading says which bath instead.
                    Text(kitchen.isSousVide
                         ? tr("controls.doneness.valueBath", [
                            "doneness": .text(kitchen.label), "bath": .text(kitchen.show(.temperature, sousVideBathC)),
                         ])
                         : kitchen.label)
                        .foregroundStyle(.secondary)
                }
                Slider(value: $kitchen.doneness, in: Limits.doneness, step: 0.01)
                // Where this pan works: the odds at each level, and what it
                // cannot deliver (OddsTrack). Inset by half a thumb each side,
                // so a level sits under the thumb that asks for it.
                if !kitchen.isSousVide, let solution = kitchen.solution {
                    OddsTrack(solution: solution, profile: kitchen.oddsProfile)
                        .frame(height: 8)
                        .padding(.horizontal, 14)
                }
                HStack {
                    Text(tr("doneness.runny"))
                    Spacer()
                    Text(tr("doneness.hard"))
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 6) {
                // The carton's classes for this region, as on the web. The
                // slider below is the scale: moving it makes the egg Weighed,
                // and choosing a class moves it to that class's mass.
                LabeledContent(tr("controls.egg")) {
                    Picker(tr("controls.egg"), selection: Binding(
                        get: { kitchen.sizeIndex },
                        set: { kitchen.chooseSize($0) }
                    )) {
                        ForEach(kitchen.sizeClasses.indices, id: \.self) { i in
                            Text(sizeLabel(kitchen.sizeClasses[i])).tag(i)
                        }
                        Text(tr("controls.size.weighed", [
                            "mass": .text(kitchen.show(.mass, kitchen.weighedMassG)),
                        ])).tag(-1)
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    // "Extra large — 76 g" otherwise wraps onto two lines.
                    .fixedSize()
                }
                // The table, not a narrower guess at it. This said 42...80,
                // so a stored mass that Settings.load had faithfully clamped to
                // Limits could not be represented by the control that set it -
                // in a file whose own comment promises every control reads the
                // same numbers. In the cook's units now: the bounds are the
                // limits rounded inward to the step, so every position is a
                // mass the model allows, and it reads the stored mass rounded
                // to the step - see `measuredSlider`.
                measuredSlider(kitchen.measure(.mass), get: { kitchen.eggMassG }, set: { kitchen.weigh($0) })
            }

            // Rendered from the constants, so a button cannot say one thing
            // and the model another. The web app learned this the hard way.
            if !kitchen.isSousVide {
                Picker(tr("controls.eggFrom"), selection: $kitchen.fromFridge) {
                    Text(tr("controls.eggFrom.fridgeAt", ["temp": .text(kitchen.show(.temperature, StartTempPresets.fridgeC))])).tag(true)
                    Text(tr("controls.eggFrom.roomAt", ["temp": .text(kitchen.show(.temperature, StartTempPresets.roomC))])).tag(false)
                }
                .pickerStyle(.segmented)
            }

            // Three positions, and the third one is rendered from the constant
            // like the egg-temperature presets above it, so the button cannot
            // name a bath the model is not computing.
            Picker(tr("controls.start"), selection: $kitchen.start) {
                Text(tr("controls.start.hot")).tag(StartChoice.hot)
                Text(tr("controls.start.cold")).tag(StartChoice.cold)
                Text(tr("controls.start.sousVide", ["bath": .text(kitchen.show(.temperature, sousVideBathC))])).tag(StartChoice.sousVide)
            }
            .pickerStyle(.segmented)

            // A control is shown when the answer depends on it.
            //
            // `sousVideEstimate` takes a radius, an alpha, a bath temperature
            // and the two dose targets - so in sous-vide the only live inputs
            // are the egg's size and the doneness slider above. The cooling
            // method, the boil, the water, the eggs in the pan and the altitude
            // are all pan arithmetic, and leaving them on screen implies they
            // do something. Same rule as the web app's `.pan-only` class: a new
            // input to `sousVideEstimate` is the signal to bring one back.
            if !kitchen.isSousVide {
                Picker(tr("controls.then"), selection: $kitchen.cooling) {
                    Text(tr("controls.then.ice")).tag(Cooling.ice)
                    Text(tr("controls.then.tap")).tag(Cooling.tap)
                    Text(tr("controls.then.counter")).tag(Cooling.counter)
                }
                .pickerStyle(.segmented)

                // E4. Off by default; offered once during a cook, and changed here.
                VStack(alignment: .leading, spacing: 4) {
                    Toggle(tr("controls.probe"), isOn: Binding(
                        get: { kitchen.probe },
                        set: { kitchen.setProbe($0) }
                    ))
                    .font(.subheadline)
                    Text(tr("controls.probe.hint"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                pan
            } else {
                // Said out loud, so a shorter form reads as deliberate rather
                // than as lost settings.
                Text(tr("controls.start.hintSousVide"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Last, and outside the pan's fold, because a bath has a
            // temperature too. One row, like the egg's size: the default
            // follows the phone, and most people never touch it.
            LabeledContent(tr("controls.units")) {
                Picker(tr("controls.units"), selection: Binding(
                    get: { kitchen.units },
                    set: { kitchen.chooseUnits($0) }
                )) {
                    Text(tr("controls.units.metric")).tag(UnitSystem.metric)
                    Text(tr("controls.units.imperial")).tag(UnitSystem.imperial)
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .fixedSize()
            }
            .font(.subheadline)
        }
    }

    /// The pan, the kitchen and the hob. Folded away because the defaults are
    /// right for most people most mornings, and a first-time user should not
    /// have to answer six questions to boil an egg.
    private var pan: some View {
        DisclosureGroup(tr("controls.pan"), isExpanded: $showPan) {
            VStack(alignment: .leading, spacing: 20) {
                Picker(tr("controls.afterTheBoil"), selection: $kitchen.heatOff) {
                    Text(tr("controls.afterBoil.keepBoiling")).tag(false)
                    Text(tr("controls.afterBoil.heatOff")).tag(true)
                }
                .pickerStyle(.segmented)

                Text(tr(kitchen.heatOff ? "controls.afterBoil.explainHeatOff" : "controls.afterBoil.explainHold"))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                stepperRow(tr("controls.water"), kitchen.measure(.water), value: $kitchen.waterLitres)
                countRow(tr("controls.eggsInPan"), value: $kitchen.eggCount, range: Limits.eggCount)
                stepperRow(tr("controls.altitude"), kitchen.measure(.altitude), value: $kitchen.altitudeM)

                LabeledContent(tr("pan.waterBoilsAt")) {
                    Text(kitchen.show(.boilingPoint, kitchen.boilingC))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.footnote)

                LabeledContent(tr("pan.timeToBoil")) {
                    Text(kitchen.hasBoilMemory
                         ? clockString(kitchen.timeToBoilS)
                         : tr("pan.timeToBoil.assumed", ["time": .text(clockString(kitchen.timeToBoilS))]))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.footnote)

                Text(tr(kitchen.hasBoilMemory ? "pan.measured" : "pan.unmeasured"))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                // Offered whenever there is anything to forget - a measured pan
                // counts, not just logged eggs. The button clears both, as the
                // web app's does, so gating it on eggs alone would leave someone
                // who had only ever timed a boil with no way to take it back.
                if kitchen.eggsLogged > 0 || kitchen.hasBoilMemory {
                    Divider()
                    // No "tuned on N eggs" here: that line sits under the
                    // controls, where it is visible without opening anything.
                    // This section only carries the thing you came here for.
                    Button(tr("learned.forget"), role: .destructive) {
                        confirmReset = true
                    }
                    .font(.footnote)

                    Text(tr("learned.forgetExplain"))
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
                Text(countText(Double(value.wrappedValue)))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }

    /// A stored SI value on a stepper, in the cook's units. The stepper steps
    /// the DISPLAYED value, from inside bounds that are the limits rounded
    /// inward to the step, and writes back only when tapped - the round trip
    /// in `Units.swift`, so a quart stays a quart and never becomes 1.99.
    private func stepperRow(_ label: String, _ m: Measure, value: Binding<Double>) -> some View {
        Stepper(value: measured(m, value), in: m.bounds ?? 0...0, step: m.step) {
            LabeledContent(label) {
                Text(kitchen.show(m.quantity, value.wrappedValue))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }

    /// A slider over a stored SI value, in the cook's units, on the same terms
    /// as `stepperRow`.
    private func measuredSlider(
        _ m: Measure, get: @escaping () -> Double, set: @escaping (Double) -> Void
    ) -> some View {
        Slider(value: measured(m, Binding(get: get, set: set)), in: m.bounds ?? 0...0, step: m.step)
    }

    /// An SI binding seen through a measure: it reads the stored value as
    /// displayed, and a control's value as SI, clamped by the limit.
    private func measured(_ m: Measure, _ si: Binding<Double>) -> Binding<Double> {
        Binding(
            get: { display(m, si.wrappedValue) },
            set: { if let stored = parse(m, $0) { si.wrappedValue = stored } }
        )
    }

    /// A size class's name and its mass, in the cook's units.
    private func sizeLabel(_ c: SizeClass) -> String {
        let label = sizeClassLabel(c, system: kitchen.units)
        return tr(label.key, ["mass": .text(tr(label.mass.key, ["value": .fixed(label.mass.value)]))])
    }

    @ViewBuilder
    private func idleCalibrationLine(_ phase: Cook.Phase) -> some View {
        // Not on the sous-vide screen. What the filter learned is a correction to
        // alpha, and alpha only reaches the bath answer through the equilibration
        // - the number that screen deliberately does not show. A "tuned on 3
        // eggs" line under an answer nothing tuned would be claiming credit.
        if phase == .idle && !kitchen.isSousVide && kitchen.eggsLogged > 0 {
            Text(tunedLine)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    private var colophon: some View {
        Text(tr("colophon.ios"))
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ContentView()
}
