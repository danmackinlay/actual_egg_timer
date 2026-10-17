import Foundation
import Observation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

extension AppSettings {
    /// Whether `group` says the same in both: the settings each group of the
    /// cook's choices is made from (core `HandGroup`).
    func same(_ group: HandGroup, _ o: AppSettings) -> Bool {
        switch group {
        case .level: doneness == o.doneness
        case .mass: sizeIndex == o.sizeIndex && weighedMassG == o.weighedMassG
        case .eggFrom: startTempMode == o.startTempMode
        case .customStart: customStartC == o.customStartC
        case .room: roomC == o.roomC
        case .startMode: startMode == o.startMode
        case .afterBoil: afterBoil == o.afterBoil
        case .cooling: cooling == o.cooling
        case .tapWater: tapWaterC == o.tapWaterC
        case .bowlLitres: bowlLitres == o.bowlLitres
        case .bowlWater: bowlWaterC == o.bowlWaterC
        case .waterLitres: waterLitres == o.waterLitres
        case .eggCount: eggCount == o.eggCount
        case .altitude: altitudeM == o.altitudeM
        case .startedAt: true
        }
    }

    /// The groups whose settings differ from `o`.
    public func changed(from o: AppSettings) -> [HandGroup] {
        HandGroup.allCases.filter { !same($0, o) }
    }

    /// `group`'s settings as `o` has them.
    mutating func take(_ group: HandGroup, from o: AppSettings) {
        switch group {
        case .level: doneness = o.doneness
        case .mass: sizeIndex = o.sizeIndex; weighedMassG = o.weighedMassG
        case .eggFrom: startTempMode = o.startTempMode
        case .customStart: customStartC = o.customStartC
        case .room: roomC = o.roomC
        case .startMode: startMode = o.startMode
        case .afterBoil: afterBoil = o.afterBoil
        case .cooling: cooling = o.cooling
        case .tapWater: tapWaterC = o.tapWaterC
        case .bowlLitres: bowlLitres = o.bowlLitres
        case .bowlWater: bowlWaterC = o.bowlWaterC
        case .waterLitres: waterLitres = o.waterLitres
        case .eggCount: eggCount = o.eggCount
        case .altitude: altitudeM = o.altitudeM
        case .startedAt: break
        }
    }

    /// The settings no group makes, as `o` has them: the kitchen's, not the
    /// egg's.
    mutating func takeNoGroup(from o: AppSettings) {
        unitsChosen = o.unitsChosen
        probe = o.probe
    }
}

extension StartLimit.Kind {
    /// The line under the start that says why it went no further.
    public var key: CopyKey {
        switch self {
        case .now: .`controls.startedAt.latestNow`
        case .boil: .`controls.startedAt.latestBoil`
        case .pull: .`controls.startedAt.latestPull`
        case .earliest: .`controls.startedAt.earliest`
        }
    }
}

/// The correction in hand on this app: its gestures and its lifecycle as
/// core's events (`handStep`, `src/core/hand.ts`), which says when a change
/// is committed, and the timers it asks for run on the cook's clock
/// (`AppClock`), so a test moves them with its own. A commit is core's too
/// (`handChoices`, the aimed-for egg's cook `previewCook`); what is this
/// app's is the controls (the planner's settings, a running cook's own
/// choices, `Planner.adopt`), which group a change of them is, the settings
/// written for the next cook, and the egg drawn.
@Observable
@MainActor
public final class InHand {
    @ObservationIgnored weak var model: AppModel?

    /// What `handStep` holds; nil while idle.
    @ObservationIgnored private var state: HandState?
    /// The controls as last seen, so a change can be put down to its group.
    @ObservationIgnored private var seen: AppSettings?
    /// A timer `handStep` set, and the moment it comes round, epoch s.
    private struct Wait {
        let task: Task<Void, Never>
        let atS: Double
    }
    @ObservationIgnored private var waits: [HandTimer: Wait] = [:]
    /// Bumped at each begin and end, so a timer or a preview landing after
    /// them is dropped.
    @ObservationIgnored private var generation = 0
    /// Previews being planned.
    @ObservationIgnored private var previewing = 0
    #if DEBUG
    /// Whether a preview is being planned, or a timer has reached its moment
    /// and not yet done what it waits for: a step's `idle` waits for it
    /// (`Screenshots.idle(after:)`). A timer whose moment is still to come is
    /// not under way: a frozen clock reaches it only when it is stepped.
    var underWay: Bool {
        let now = AppClock.nowS
        return previewing > 0 || waits.values.contains { $0.atS <= now }
    }
    #endif

    /// A correction of when the eggs went in, in hand; nil for none, when
    /// the panel shows the cook's own (`shownStart`).
    private(set) var startInHand: Double?
    /// Why the start's − or + went no further, and the time it stopped at.
    public private(set) var startLimit: StartLimit?
    /// The slider's reading of a change in hand: its level and peak yolk at
    /// once, and the plan's solution when it lands.
    public private(set) var aim: (level: Double, peakYolkC: Double, solution: Solution?)?

    /// Whether a change is in hand, not yet committed.
    public var pending: Bool { state?.hand != nil }

    /// When the eggs went in as the panel shows it: in hand, or the cook's.
    public var shownStart: Double? { startInHand ?? cook?.running?.startedAtS }

    private var planner: Planner? { model?.planner }
    private var cook: Cook? { model?.cook }

    // MARK: - A cook begins and ends

    /// A cook is running and its controls are drawn from it afresh (a start,
    /// a relaunch): nothing is in hand.
    func begin() {
        guard let planner else { return }
        fresh()
        state = nothingInHand()
        seen = planner.settings
        planner.onEdit = { [weak self] in self?.controlsChanged() }
    }

    /// The cook has ended: whatever was in hand goes with it (committed
    /// first by a button, `moveOn`), a level only previewed back at the
    /// cook's, and the controls answer to the idle screen again.
    public func end() {
        restoreRefusedLevel()
        fresh()
        state = nil
        seen = nil
        planner?.onEdit = nil
    }

    /// Core's `fresh`: every timer stopped, and nothing in hand.
    private func fresh() {
        let out = handStep(state ?? nothingInHand(), .fresh(atS: AppClock.nowS))
        generation &+= 1
        for t in out.timers { setTimer(t.timer, t.atS) }
        startInHand = nil
        startLimit = nil
        aim = nil
        model?.aimView = nil
    }

    /// `event` handed to `handStep`, and what it says done: the group it
    /// names committed, first; the aimed-for egg planned, or let go; its
    /// timers set or stopped.
    private func handle(_ event: HandEvent) {
        guard let state else { return }
        let out = handStep(state, event)
        self.state = out.state
        let gen = generation
        if let group = out.commit { commit(group) }
        guard gen == generation else { return }
        switch out.aim {
        case .plan: plan()
        case .letGo: letGo()
        case nil: break
        }
        for t in out.timers { setTimer(t.timer, t.atS) }
    }

    /// A timer set for `atS` on the cook's clock, or stopped with nil: when
    /// it comes round, its event, unless a cook has begun or ended since.
    private func setTimer(_ timer: HandTimer, _ atS: Double?) {
        waits[timer]?.task.cancel()
        waits[timer] = nil
        guard let atS else { return }
        let gen = generation
        let task = Task { [weak self] in
            try? await AppClock.wait(until: atS)
            guard !Task.isCancelled, let self, gen == self.generation else { return }
            self.waits[timer] = nil
            self.handle(.timer(atS: atS, timer: timer))
        }
        waits[timer] = Wait(task: task, atS: atS)
    }

    // MARK: - The gestures

    /// A control's value changed while a cook runs (the planner, after the
    /// control has taken it in), or the start's time (`given`). A change of
    /// no group (the thermometer switch) is another control used, and is
    /// written now, as the units are.
    func controlsChanged(_ given: HandGroup? = nil) {
        guard let planner, cook?.running != nil, state != nil else { return }
        let now = planner.settings
        let group = given ?? (seen.map { now.changed(from: $0).first } ?? nil)
        seen = now
        guard let group else {
            moveOn(.setting)
            SettingsStore.save(planner, groups: [])
            return
        }
        handle(.change(atS: AppClock.nowS, group: group))
        Screenshots.log(.edit(group: group.rawValue))
        // At once, the slider's own reading; the plan's follows.
        aim = (planner.settings.doneness, targetPeakYolkC(planner.settings.doneness), nil)
    }

    /// A finger comes down on a control of `group` (the slider, a − or +).
    public func fingerDown(_ group: HandGroup) {
        guard cook?.running != nil else { return }
        handle(.down(atS: AppClock.nowS, group: group))
    }

    /// The finger lifts.
    public func fingerUp() {
        handle(.up(atS: AppClock.nowS))
    }

    /// A control of no group used, or a button that moves the cook on: what
    /// is in hand is committed now, before it acts.
    public func moveOn(_ control: HandControl) {
        handle(.moveOn(atS: AppClock.nowS, control: control))
    }

    /// The app leaves the screen (`scenePhase` no longer active).
    public func leaving() {
        handle(.leave(atS: AppClock.nowS))
    }

    // MARK: - The commit and the aimed-for egg

    /// Commit `group`'s change: the cook corrected, and the group's settings
    /// written for the next cook. A change no correction can make (the level
    /// after the pull, core `handChoices`) is neither. The start is the
    /// cook's own: a correction of it, and then the start the cook has, so
    /// one refused leaves the cook's.
    private func commit(_ group: HandGroup) {
        guard let model, let planner, let running = model.cook.running else { return }
        if group == .startedAt {
            let start = startInHand.flatMap { $0 != running.startedAtS ? $0 : nil }
            Screenshots.log(.editCommitted(fields: [], start: start))
            if let start { model.correct(running.choices, startedAtS: start) }
            startInHand = nil
            return
        }
        guard let choices = handChoices(running, said: planner.choices, group: group) else {
            Screenshots.log(.editCommitted(fields: [], start: nil))
            return
        }
        Screenshots.log(.editCommitted(fields: [group.rawValue], start: nil))
        if choices != running.choices { model.correct(choices, startedAtS: nil) }
        SettingsStore.save(planner, groups: [group])
        if group == .room { model.cook.probeSettingChanged() }
    }

    /// The egg the change in hand aims for, and the slider's reading for it:
    /// planned off the main actor, held on the drawing, stored nowhere.
    private func plan() {
        previewing += 1
        Task {
            defer { previewing -= 1 }
            await preview()
        }
    }

    private func preview() async {
        guard let model, let cook = model.cook.running, let plan = model.cook.plan, let group = state?.hand else { return }
        let gen = generation
        let nowS = AppClock.nowS
        let hand = previewCook(
            cook, said: model.planner.choices, group: group, startS: startInHand ?? cook.startedAtS, nowS: nowS
        )
        let calibration = model.planner.calibration
        let ran = asRanShown(cook, plan: plan)
        let made = await model.cook.previewPlan(hand, nowS: nowS)
        guard gen == generation, pending else { return }
        let pulled = hand.events.pulled
        let params = pulled != nil ? ran?.params ?? calibrationParams(calibration) : calibrationParams(calibration)
        let timeS = pulled.map { $0.outS - hand.startedAtS } ?? made.cookTimeS
        let white = calibrationDoneness(calibration, level: made.answer.level).whiteDoseMin
        let view = await Task.detached(priority: .userInitiated) {
            previewSection(egg: made.egg, setup: made.setup, params: params, cookTimeS: timeS, whiteTargetMin: white)
        }.value
        guard gen == generation, pending else { return }
        aim = (made.answer.level, made.solution.result.peakYolkC, made.solution)
        model.aimView = view
    }

    /// The aimed-for egg goes, and a level the slider only previewed after
    /// the pull goes back to the cook's.
    private func letGo() {
        restoreRefusedLevel()
        if aim != nil { aim = nil }
        if model?.aimView != nil { model?.aimView = nil }
    }

    /// The slider back at the cook's level, without it counting as a
    /// change, when the level it shows is one a correction cannot make
    /// (after the pull, core `handChoices`). A level a correction can make
    /// stays: a commit may not have reached the cook yet, since the step
    /// runs off the main actor.
    private func restoreRefusedLevel() {
        guard let planner, let running = cook?.running,
              handChoices(running, said: planner.choices, group: .level) == nil else { return }
        planner.applying = true
        planner.settings.doneness = running.choices.level
        planner.applying = false
        seen = planner.settings
    }

    // MARK: - The start

    /// The start a minute earlier or later, as far as the cook allows (core
    /// `startStepped`): a correction in hand like any other, committed the
    /// same way. Whether it moved.
    @discardableResult
    public func stepStart(up: Bool) -> Bool {
        guard let running = cook?.running, state != nil else { return false }
        let from = startInHand ?? running.startedAtS
        let stepped = startStepped(running, fromS: from, up: up, nowS: AppClock.nowS)
        startLimit = stepped.limit
        // The line under the start says why it went no further; VoiceOver
        // says it too, at each press it stops (the web's line is
        // `aria-live`), since the value it reads has not changed.
        if let limit = stepped.limit {
            let said = trChosen(limit.kind.key, ["time": .text(timeOfDay(Date(timeIntervalSince1970: limit.atS)))])
            Services.announce(said)
        }
        guard stepped.startS != from else { return false }
        startInHand = stepped.startS
        controlsChanged(.startedAt)
        return true
    }
}
