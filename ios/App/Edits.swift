import Foundation
import Observation
import UIKit
import EggTimerCore
import EggTimerCopy

/// A control a correction can come from, for "another control touched", and
/// the settings and the cook's choices each one makes. The web's `FIELDS`
/// (src/ui/edit.ts), plus the start's time.
enum ControlField: Hashable, CaseIterable {
    case level, mass, eggFrom, customStart, room, start, afterBoil, cooling, water, eggCount, altitude
    /// The start clause's time, which is the cook's own and no setting.
    case startTime
}

/// The controls as the planner holds them, in its own terms: what a
/// correction is measured against (`Edits.base`).
struct Controls: Equatable {
    var doneness: Double
    var sizeIndex: Int
    var weighedMassG: Double
    var startTemp: EggFrom
    var customStartC: Double
    var probe: Bool
    var roomC: Double?
    var start: StartChoice
    var heatOff: Bool
    var cooling: Cooling
    var waterLitres: Double
    var eggCount: Int
    var altitudeM: Double

    @MainActor init(_ p: Planner) {
        doneness = p.doneness
        sizeIndex = p.sizeIndex
        weighedMassG = p.weighedMassG
        startTemp = p.startTemp
        customStartC = p.customStartC
        probe = p.probe
        roomC = p.roomC
        start = p.start
        heatOff = p.heatOff
        cooling = p.cooling
        waterLitres = p.waterLitres
        eggCount = p.eggCount
        altitudeM = p.altitudeM
    }

    /// Whether `field` says the same in both.
    func same(_ field: ControlField, _ o: Controls) -> Bool {
        switch field {
        case .level: doneness == o.doneness
        case .mass: sizeIndex == o.sizeIndex && weighedMassG == o.weighedMassG
        case .eggFrom: startTemp == o.startTemp
        case .customStart: customStartC == o.customStartC
        case .room: probe == o.probe && roomC == o.roomC
        case .start: start == o.start
        case .afterBoil: heatOff == o.heatOff
        case .cooling: cooling == o.cooling
        case .water: waterLitres == o.waterLitres
        case .eggCount: eggCount == o.eggCount
        case .altitude: altitudeM == o.altitudeM
        case .startTime: true
        }
    }

    /// The fields that differ from `o`.
    func changed(from o: Controls) -> [ControlField] {
        ControlField.allCases.filter { !same($0, o) }
    }

    /// `field` as `o` has it.
    mutating func take(_ field: ControlField, from o: Controls) {
        switch field {
        case .level: doneness = o.doneness
        case .mass: sizeIndex = o.sizeIndex; weighedMassG = o.weighedMassG
        case .eggFrom: startTemp = o.startTemp
        case .customStart: customStartC = o.customStartC
        case .room: probe = o.probe; roomC = o.roomC
        case .start: start = o.start
        case .afterBoil: heatOff = o.heatOff
        case .cooling: cooling = o.cooling
        case .water: waterLitres = o.waterLitres
        case .eggCount: eggCount = o.eggCount
        case .altitude: altitudeM = o.altitudeM
        case .startTime: break
        }
    }
}

extension CookChoices {
    /// `field` as `o` has it: the choices each control makes.
    mutating func take(_ field: ControlField, from o: CookChoices) {
        switch field {
        case .level: level = o.level
        case .mass: massKg = o.massKg; massFrom = o.massFrom; sizeTable = o.sizeTable
        case .eggFrom: eggFrom = o.eggFrom
        case .customStart: customStartC = o.customStartC
        case .room: roomC = o.roomC
        case .start: startMode = o.startMode
        case .afterBoil: afterBoil = o.afterBoil
        case .cooling: cooling = o.cooling
        case .water: waterLitres = o.waterLitres
        case .eggCount: eggCount = o.eggCount
        case .altitude: altitudeM = o.altitudeM
        case .startTime: break
        }
    }
}

/// Corrections mid-cook (DECISIONS.md 96 to 98; design/one-screen.md sections
/// 3 to 5; the web's src/ui/edit.ts): every control stays open after Start,
/// showing the cook's own choices (the planner holds them while a cook runs,
/// `Planner.adopt`), and a change to one is a correction, "it was always like
/// this" - the cook's choices replaced (core `corrected`) and the whole cook
/// planned again from its start.
///
/// A change is not committed at every step (review 2.4): each would stamp
/// the cook, plan again, reschedule the alarms, push the card and write the
/// settings, and a drag through an overdue level would ring mid-drag. While
/// the cook's finger is on a control the change is in hand: the controls and
/// the sentence show it, and the egg in cross-section the egg it aims for,
/// from a plan of the cook as it would be that stores nothing and rings
/// nothing. It is committed
///
/// - on release, for the slider, and for a − or + held long enough to repeat;
/// - after a tap's settle (`settle`, 1.5 s) for anything else - a choice in a
///   panel, a − or + pressed once, a number typed - the settle starting again
///   with each change;
/// - at once when another control is touched, or a button that moves the
///   cook on is pressed.
///
/// Overdue is decided only on commit, by the plan of the committed cook. The
/// aimed-for egg stays for a settle after the last change. A correction is
/// the fields the cook changed, against `base`, laid over the cook's own
/// choices, so a field nobody touched keeps the cook's value to the bit and
/// changing a setting back gives back the old plan exactly; the same fields
/// are written to the settings, for the next cook.
@Observable
@MainActor
final class Edits {
    /// How long a tap's change settles before it is committed, and how long
    /// the aimed-for egg stays after the last change (design section 5).
    static let settle: Duration = .milliseconds(1500)
    /// A − or + held this long has begun to repeat: a hold, committed on
    /// release.
    static let held: Duration = .milliseconds(400)
    /// How long a burst of changes waits before the aimed-for egg is planned.
    static let previewDelay: Duration = .milliseconds(90)

    @ObservationIgnored weak var model: AppModel?

    /// The controls as last drawn from the cook, or committed; nil while
    /// idle. A field that differs from this is one the cook changed.
    @ObservationIgnored private var base: Controls?
    /// The controls as last seen, so a change can be put down to its field.
    @ObservationIgnored private var seen: Controls?
    /// Whether the controls hold a change not yet committed, and from which
    /// control.
    @ObservationIgnored private(set) var pending = false
    @ObservationIgnored private var group: ControlField?
    /// A finger down on a control: when, on which, and whether the slider.
    @ObservationIgnored private var down: (at: ContinuousClock.Instant, group: ControlField, slider: Bool)?
    /// When the last change came.
    @ObservationIgnored private var changedAt = ContinuousClock.now
    /// The slider moved after the pull, previewed and not corrected: it goes
    /// back to the cook's level when the aimed-for egg goes.
    @ObservationIgnored private var previewedLevel = false
    @ObservationIgnored private var settleTask: Task<Void, Never>?
    @ObservationIgnored private var previewTask: Task<Void, Never>?
    @ObservationIgnored private var releaseTask: Task<Void, Never>?
    /// Bumped at each begin and end, so a preview landing after them is
    /// dropped.
    @ObservationIgnored private var generation = 0

    /// When the eggs went in as the start's panel says, while a cook runs:
    /// the cook's own, or a correction of it in hand. Nil while idle.
    private(set) var startInHand: Double?
    /// Why the start's − or + went no further, and the time it stopped at.
    private(set) var startLimit: (kind: StartLimit, atS: Double)?
    /// The slider's reading of a change in hand: its level and peak yolk at
    /// once, and the plan's solution when it lands.
    private(set) var aim: (level: Double, peakYolkC: Double, solution: Solution?)?

    enum StartLimit: Equatable {
        case now, boil, pull, earliest

        var key: String {
            switch self {
            case .now: "controls.startedAt.latestNow"
            case .boil: "controls.startedAt.latestBoil"
            case .pull: "controls.startedAt.latestPull"
            case .earliest: "controls.startedAt.earliest"
            }
        }
    }

    /// When the eggs went in as the panel shows it: in hand, or the cook's.
    var shownStart: Double? { startInHand ?? cook?.running?.startedAtS }

    private var planner: Planner? { model?.planner }
    private var cook: Cook? { model?.cook }

    // MARK: - A cook begins and ends

    /// A cook is running and its controls are drawn from it afresh (a start,
    /// a relaunch): nothing is in hand.
    func begin() {
        guard let planner else { return }
        clearTasks()
        generation &+= 1
        previewedLevel = false
        base = Controls(planner)
        seen = base
        pending = false
        group = nil
        down = nil
        startInHand = cook?.running?.startedAtS
        startLimit = nil
        dropAim()
        planner.onEdit = { [weak self] in self?.controlsChanged() }
    }

    /// The cook has ended: whatever was in hand goes with it (committed
    /// first by the caller), and the controls answer to the idle screen again.
    func end() {
        if previewedLevel, let base { restoreLevel(base.doneness) }
        clearTasks()
        generation &+= 1
        previewedLevel = false
        base = nil
        seen = nil
        pending = false
        group = nil
        down = nil
        startInHand = nil
        startLimit = nil
        aim = nil
        model?.aimView = nil
        planner?.onEdit = nil
    }

    private func clearTasks() {
        for t in [settleTask, previewTask, releaseTask] { t?.cancel() }
        settleTask = nil
        previewTask = nil
        releaseTask = nil
    }

    // MARK: - A change, and the gesture making it

    /// A control's value changed while a cook runs (the planner, after the
    /// control has taken it in), or the start's time (`group` given): the
    /// change is in hand until it is committed.
    func controlsChanged(_ given: ControlField? = nil) {
        guard let planner, cook?.running != nil, base != nil else { return }
        let now = Controls(planner)
        let field = given ?? (seen.map { now.changed(from: $0).first } ?? nil)
        seen = now
        // Another control than the one with a change in hand commits it,
        // without this one's change.
        if pending, let group, let field, field != group { commit(except: field) }
        pending = true
        group = field ?? group
        changedAt = .now
        releaseTask?.cancel()
        releaseTask = nil
        #if DEBUG
        Screenshots.log("edit \(group.map { "\($0)" } ?? "-")")
        #endif
        // At once, the slider's own reading; the plan's follows.
        aim = (planner.doneness, targetPeakYolkC(planner.doneness), nil)
        if previewTask == nil {
            let gen = generation
            previewTask = Task { [weak self] in
                try? await Task.sleep(for: Self.previewDelay)
                guard let self, gen == self.generation else { return }
                self.previewTask = nil
                await self.preview()
            }
        }
        if down == nil { settleThenCommit() }
    }

    /// A finger comes down on a control (the slider, a − or +): another
    /// control than the one with a change in hand commits it, and the
    /// gesture begins.
    func fingerDown(_ field: ControlField, slider: Bool = false) {
        guard cook?.running != nil, base != nil else { return }
        if pending, group != field { commit() }
        down = (.now, field, slider)
        settleTask?.cancel()
        settleTask = nil
    }

    /// The finger lifts: a drag of the slider, or a − or + held, commits
    /// now; a tap settles first.
    func fingerUp() {
        guard let d = down else { return }
        down = nil
        guard pending else { return }
        if d.slider || ContinuousClock.now - d.at >= Self.held {
            commit()
        } else {
            settleThenCommit()
        }
    }

    /// Another control touched that is not one of the cook's (a clause, a
    /// button that moves the cook on): what is in hand is committed now.
    func touchedElsewhere() {
        if pending { commit() }
    }

    /// The app leaves the screen (`scenePhase` no longer active): what is in
    /// hand is committed now, so a kill from the app switcher inside the
    /// settle loses nothing (onescreen review 3); a finger down then is gone.
    func leaving() {
        down = nil
        guard pending else { return }
        #if DEBUG
        Screenshots.log("edit leaving")
        #endif
        commit()
    }

    private func settleThenCommit() {
        settleTask?.cancel()
        let gen = generation
        settleTask = Task { [weak self] in
            try? await Task.sleep(for: Self.settle)
            guard !Task.isCancelled, let self, gen == self.generation else { return }
            self.settleTask = nil
            self.commit()
        }
    }

    // MARK: - The correction

    /// The choices the controls say, laid over the cook's own: each field
    /// the cook changed (against `base`), but those in `except`, and the
    /// cook's for the rest.
    private func choicesInHand(
        _ cook: RunningCook, _ base: Controls, except: Set<ControlField> = []
    ) -> (choices: CookChoices, touched: [ControlField]) {
        guard let planner else { return (cook.choices, []) }
        let now = Controls(planner)
        let said = planner.choices
        var next = cook.choices
        let touched = now.changed(from: base).filter { !except.contains($0) }
        for f in touched { next.take(f, from: said) }
        return (next, touched)
    }

    /// The cook as the change in hand would make it, for its preview: a
    /// correction; but after the pull a new level only previews (DECISIONS.md
    /// 98), the egg that level aims for in this pot, so it is planned as if
    /// not yet pulled.
    private func cookInHand(_ cook: RunningCook, _ choices: CookChoices, nowS: Double) -> RunningCook {
        var c = cook
        if let start = startInHand, start != c.startedAtS {
            c = startCorrected(c, startedAtS: start, nowS: nowS) ?? c
        }
        if c.events.pulled != nil, choices.level != c.choices.level { return levelPreview(c, choices: choices) }
        return corrected(c, choices: choices, nowS: nowS)
    }

    /// The egg the change in hand aims for, and the slider's reading for it:
    /// planned off the main actor, held on the drawing, stored nowhere.
    private func preview() async {
        guard let model, let cook = model.cook.running, let plan = model.cook.plan, let base,
              pending || down != nil else { return }
        let gen = generation
        let nowS = AppClock.now.timeIntervalSince1970
        let hand = cookInHand(cook, choicesInHand(cook, base).choices, nowS: nowS)
        let calibration = model.planner.calibration
        let ran = asRanShown(cook, plan: plan)
        let made = await model.cook.previewPlan(hand, nowS: nowS)
        guard gen == generation, pending || down != nil else { return }
        let pulled = hand.events.pulled
        let params = pulled != nil ? ran?.params ?? calibrationParams(calibration) : calibrationParams(calibration)
        let timeS = pulled.map { $0.outS - hand.startedAtS } ?? made.cookTimeS
        let white = calibrationDoneness(calibration, level: made.answer.level).whiteDoseMin
        let view = await Task.detached(priority: .userInitiated) {
            previewSection(egg: made.egg, setup: made.setup, params: params, cookTimeS: timeS, whiteTargetMin: white)
        }.value
        guard gen == generation, pending || down != nil else { return }
        aim = (made.answer.level, made.solution.result.peakYolkC, made.solution)
        model.aimView = view
    }

    /// Commit the change in hand: the cook corrected, and the fields it
    /// changed written to the settings for the next cook. After the pull the
    /// level is not corrected (DECISIONS.md 98): the slider only previewed,
    /// and goes back to the level the egg was pulled at; nothing is written
    /// for it. The aimed-for egg stays until a settle after the last change.
    func commit(except: ControlField? = nil) {
        settleTask?.cancel()
        settleTask = nil
        guard pending, let model, let planner, let running = model.cook.running, let base else { return }
        pending = false
        group = nil
        let skip: Set<ControlField> = except.map { [$0] } ?? []
        var (choices, touched) = choicesInHand(running, base, except: skip)
        var next = Controls(planner)
        for f in skip { next.take(f, from: base) }
        if running.events.pulled != nil, choices.level != running.choices.level {
            choices.level = running.choices.level
            touched.removeAll { $0 == .level }
            next.doneness = base.doneness
            previewedLevel = true
        }
        let start = startInHand.flatMap { $0 != running.startedAtS ? $0 : nil }
        #if DEBUG
        Screenshots.log("edit committed \(touched.map { "\($0)" }.joined(separator: ",")) start \(start.map { String($0) } ?? "-")")
        #endif
        if start != nil || choices != running.choices { model.correct(choices, startedAtS: start) }
        // The start as the cook now has it: a correction refused leaves the
        // cook's.
        startInHand = model.cook.running?.startedAtS
        self.base = next
        if !touched.isEmpty {
            SettingsStore.save(planner, fields: Set(touched), level: next.doneness)
            if touched.contains(.room) { model.cook.probeSettingChanged() }
        }
        letAimGo()
    }

    /// The aimed-for egg goes a settle after the last change, unless a
    /// finger is down or another change is in hand by then.
    private func letAimGo() {
        releaseTask?.cancel()
        let left = max(.zero, Self.settle - (ContinuousClock.now - changedAt))
        let gen = generation
        releaseTask = Task { [weak self] in
            try? await Task.sleep(for: left)
            guard !Task.isCancelled, let self, gen == self.generation else { return }
            self.releaseTask = nil
            guard !self.pending, self.down == nil else { return }
            self.dropAim()
        }
    }

    /// The aimed-for egg goes, and a level the slider only previewed after
    /// the pull goes back to the cook's.
    private func dropAim() {
        if previewedLevel, let base, !pending {
            previewedLevel = false
            restoreLevel(base.doneness)
        }
        if aim != nil { aim = nil }
        if model?.aimView != nil { model?.aimView = nil }
    }

    /// The slider back at `level`, without it counting as a change.
    private func restoreLevel(_ level: Double) {
        guard let planner else { return }
        planner.applying = true
        planner.doneness = level
        planner.applying = false
        seen = Controls(planner)
    }

    // MARK: - The start

    /// The start a minute earlier or later, as far as the cook allows (core
    /// `earliestStartS`, `latestStartS`): a correction in hand like any
    /// other, committed the same way. Whether it moved.
    @discardableResult
    func stepStart(up: Bool) -> Bool {
        guard let running = cook?.running, base != nil else { return false }
        let from = startInHand ?? running.startedAtS
        let nowS = AppClock.now.timeIntervalSince1970
        let earliest = earliestStartS(running)
        let latest = latestStartS(running, nowS: nowS)
        var next = from + (up ? 60 : -60)
        var limit: (kind: StartLimit, atS: Double)?
        if next >= latest {
            next = latest
            limit = (Self.latestLimit(running, latest), latest)
        }
        if next <= earliest {
            next = earliest
            limit = (.earliest, earliest)
        }
        startLimit = limit
        #if DEBUG
        if let limit { Screenshots.log("start limit \(limit.kind) \(limit.atS)") }
        #endif
        // The line under the start says why it went no further; VoiceOver
        // says it too, at each press it stops (the web's line is
        // `aria-live`), since the value it reads has not changed.
        if let limit {
            let said = tr(limit.kind.key, ["time": .text(timeOfDay(Date(timeIntervalSince1970: limit.atS)))])
            UIAccessibility.post(notification: .announcement, argument: said)
            #if DEBUG
            Screenshots.log("announce \(said)")
            #endif
        }
        guard next != from else { return false }
        startInHand = next
        controlsChanged(.startTime)
        return true
    }

    /// Which of the cook's limits `latest` is: the boil pressed, the pull,
    /// or now (`latestStartS`).
    private static func latestLimit(_ cook: RunningCook, _ latest: Double) -> StartLimit {
        let e = cook.events
        if e.boilAtS == latest { return .boil }
        if e.pulled?.dueS == latest || e.cooledAtS == latest { return .pull }
        return .now
    }
}
