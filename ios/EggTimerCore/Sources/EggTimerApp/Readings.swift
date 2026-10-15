import Foundation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

// What the egg screen's views say and draw, worked out here so that the
// tests read the same values the screen shows: the readout's lines, the slot,
// the slider's reading and its bracket, the egg in cross-section, and when
// the egg's page comes back. The views (ios/App) lay them out.

// MARK: - The readout

/// What the readout says at one moment (`ReadoutView`): the phase's label,
/// the time and the line under it, and how sure I am of the time with what
/// pressing that line opens; then whether the white's caveat shows.
@MainActor
public struct ReadoutWords {
    /// A running cook's readout at the moment (core's `readoutAt`); nil idle.
    public let readout: Readout?
    /// The phase label's key.
    public let label: CopyKey
    /// The web's clock face in every phase: the countdown (the time heated,
    /// counting up, once the slow hob has lengthened the guess), how late the
    /// pull is running while the eggs wait to come out, and at the end the
    /// time the egg was in the water.
    public let big: String
    /// The line under the clock: core's key, with this phase's arguments.
    /// While a cook runs every number it takes is a time, as a clock.
    public let sub: String
    /// How sure I am, in this phase: while idle, the choice on screen's;
    /// while the egg is in, its plan's, where the white sets; after the
    /// pull, nothing.
    public let certainty: CertaintyReading?
    /// What pressing the certainty line opens (`opened`); empty with none.
    public let opened: [String]
    /// Whether to say the white might still be runny (`whiteRunny`).
    public let whiteRunny: Bool

    public init(_ model: AppModel, phase: Phase, nowS: Double) {
        let planner = model.planner
        let cook = model.cook
        let idle = phase == .idle
        let r = idle ? nil : cook.readout(atS: nowS)
        readout = r
        label = r?.label ?? model.keys(phase).label
        if let r {
            big = r.sign + clockString(r.clockS)
            sub = trChosen(r.subline.key, r.subline.args.mapValues { .text(clockString($0)) })
        } else {
            big = planner.solution.map { clockString($0.result.cookTimeS) } ?? "--:--"
            sub = trChosen(model.keys(.idle).subline, [
                "boil": .text(clockString(planner.timeToBoilS)),
                "water": .text(planner.show(.water, planner.settings.waterLitres)),
            ])
        }
        let sure: CertaintyReading? = switch phase {
        case .idle: planner.heldCertainty
        case .heating, .cooking: cook.plan?.solution.whiteSets == true ? cook.heldCertainty : nil
        case .pull, .cooling, .done: nil
        }
        certainty = sure
        opened = sure.map { Self.opened($0, cook: idle ? nil : cook) } ?? []
        // Never under "Are the eggs still in the water?": not a caveat about
        // the pull the question doubts. Once the egg is out, the forecast as
        // it ran (`Cook.asRan`), not a plan made since on a posterior that
        // has learned from this egg.
        if r?.asking == true {
            whiteRunny = false
        } else if !idle, let ran = cook.asRan {
            whiteRunny = forecastWhiteAtRisk(ran.forecast)
        } else {
            whiteRunny = (idle ? planner.heldOutcome : cook.outcome).map(whiteAtRisk) ?? false
        }
    }

    /// The grace ran out unanswered, so I assumed the eggs came out, and a
    /// correction since would cook them longer: the plan asks whether they
    /// are still in the water.
    public var asking: Bool { readout?.asking == true }

    /// Whether "Most likely" shows under the certainty word, unpressed.
    public var likelyShown: Bool { certainty.map { mostLikelyShown($0.words) } ?? false }

    /// The likely time range pressing the line opens, its last line; nil
    /// with no certainty.
    public var range: String? { certainty.map { _ in opened.last ?? "" } }

    /// What pressing the certainty line opens: the interval, "most likely"
    /// when it is not already said, and the likely time range in the clock's
    /// own terms (core `timeRangeWords`): while idle whole times, m:ss as the
    /// clock shows them; once a cook runs (`running`), the times of day to
    /// take the eggs out, not whole times under a clock counting down, and
    /// for a reading held over a plan that has moved since (a slow hob's
    /// lengthening guess) about the plan's time now.
    private static func opened(_ sure: CertaintyReading, cook: Cook?) -> [String] {
        var lines = [renderedWords(intervalWords(sure.words))]
        if mostLikelyOpened(sure.words) { lines.append(renderedWords(mostLikelyWords(sure.words))) }
        let range = timeRangeWords(
            sure, startedAtS: cook?.running?.startedAtS, cookTimeS: cook?.plan?.cookTimeS ?? 0
        )
        let said = { (s: Double) in
            range.ofDay ? timeOfDay(Date(timeIntervalSince1970: s)) : clockString(s)
        }
        lines.append(tr(range.key, ["low": .text(said(range.lowS)), "high": .text(said(range.highS))]))
        return lines
    }
}

/// A key with its counts and its doneness words, rendered.
public func renderedWords(_ ref: WordsRef) -> String {
    var args: CopyArgs = [:]
    for (name, value) in ref.args { args[name] = .number(value) }
    for (name, key) in ref.words { args[name] = .text(tr(key)) }
    return trChosen(ref.key, args)
}

// MARK: - The slot

extension AppModel {
    /// The running plan's warning, for the slot while a cook runs: a
    /// refusal, or a wild guess at the level, in its own pot's words. A
    /// correction that leaves the white unset gets the longest time this pan
    /// can give, and this says so.
    public var runningWarning: String? {
        guard let plan = cook.plan else { return nil }
        let a = plan.answer
        return warningText(
            a.verdict, lowOdds: a.lowOdds, level: a.level, setup: plan.setup,
            water: planner.show(.water, plan.setup.waterLitres)
        )
    }
}

// MARK: - The slider

/// What the slider shows: the controls' answer while idle, the running
/// cook's plan while one runs (the web's `renderIdle` and `renderRunning`).
@MainActor
public struct SliderReading {
    /// The pan's limits, for the stripes and the struck words; nil in
    /// sous-vide and before the first answer.
    public var solution: Solution?
    /// The shading: this pot's odds at every level.
    public var profile: OddsProfile?
    /// The bracket: how sure I am, in the slider's words.
    public var words: WordCertainty?
    /// The heading's peak yolk, C, and the level it is for.
    public var peakYolkC: Double
    public var level: Double
    /// What the texture note describes.
    public var noteSolution: Solution?
    public var sousVide = false

    public init(_ model: AppModel, phase: Phase) {
        let planner = model.planner
        let cook = model.cook
        if phase != .idle, let running = cook.running, let plan = cook.plan {
            let whiteSets = plan.solution.whiteSets
            // Until the pull; then the time they were about has passed.
            let before = phase == .heating || phase == .cooking
            // Once the egg is out, as it ran (`asRanShown`).
            let ran = asRanShown(running, plan: plan)
            solution = plan.solution
            profile = whiteSets && before ? cook.heldProfile : nil
            words = whiteSets && before ? cook.heldCertainty?.words : nil
            peakYolkC = ran?.peakYolkC ?? plan.solution.result.peakYolkC
            level = ran?.level ?? plan.answer.level
            // The note too, once the egg is out (`Cook.ranSolution`): beside
            // the peak, not from a plan made since on a
            // posterior that has folded this egg's answer.
            noteSolution = ran != nil ? cook.ranSolution ?? plan.solution : plan.solution
            // A change in hand: the heading and the texture are its own
            // (the readout keeps the committed plan's time).
            if let aim = model.edits.aim {
                peakYolkC = aim.peakYolkC
                level = aim.level
                noteSolution = aim.solution ?? plan.solution
            }
            return
        }
        sousVide = planner.isSousVide
        solution = sousVide ? nil : planner.solution
        profile = sousVide ? nil : planner.shownProfile
        words = sousVide ? nil : planner.heldCertainty?.words
        peakYolkC = planner.solution?.result.peakYolkC ?? targetPeakYolkC(planner.settings.doneness)
        level = planner.settings.doneness
        noteSolution = planner.solution
    }

    /// What the yolk and white will be like, or, in a bath, the bath's own
    /// note; empty before the first answer.
    public func note(_ planner: Planner) -> String {
        if sousVide {
            return sousVideCopy(planner.sousVide, now: AppClock.now, units: planner.units).note
        }
        guard let s = noteSolution else { return "" }
        return textureNote(peakYolkC: s.result.peakYolkC, peakWhiteC: s.result.peakWhiteC, whiteSets: s.whiteSets)
    }
}

/// Where the bracket under the slider lies, as slider levels (core's
/// `wordBracket`), and the stretch of it drawn heavy: the most likely word's
/// band, which is one of the interval's words, so inside it.
public struct BracketLevels {
    public let low: Double
    public let high: Double
    public let likelyLow: Double
    public let likelyHigh: Double

    public init(_ words: WordCertainty) {
        let b = wordBracket(words)
        low = b.low
        high = b.high
        likelyLow = min(max(wordBandLow(words.mostLikely), b.low), b.high)
        likelyHigh = min(max(wordBandHigh(words.mostLikely), likelyLow), b.high)
    }
}

// MARK: - The egg in cross-section

/// Which egg the drawing is (the web's `data-egg`): `aim`, the egg the
/// settings on screen aim for, as eaten at the end of the cooling; `live`,
/// the egg in the water now; `ran`, at Done, the egg as it ran, eaten.
public enum EggReading: String {
    case aim, live, ran
}

extension AppModel {
    /// What the egg in cross-section draws in `phase` at `nowS`, and which
    /// reading it is (`EggSectionView`):
    ///
    /// - idle, the controls' egg at the time on screen (`aim`);
    /// - during a cook, while a control is held and for a moment after,
    ///   the egg the correction in hand would cook (`aim`);
    /// - the egg in the water now, carried forward a tick at a time and
    ///   replayed from raw when the cook's pot or start changes, on through
    ///   the cooling (`live`);
    /// - at Done, the egg as it ran: the time that ran, to the egg out, with
    ///   the model's parameters it ran under (`ran`).
    public func section(phase: Phase, nowS: Double, cache: SectionCache) -> (view: SectionView?, reading: EggReading) {
        let calibration = planner.calibration
        guard phase != .idle, let running = cook.running, let plan = cook.plan else {
            // Idle: the egg the controls aim for, at the time on screen.
            guard !planner.isSousVide, let solution = planner.solution else { return (nil, .aim) }
            let level = planner.settings.doneness
            return (cache.preview(
                egg: planner.egg, setup: planner.setup, params: calibrationParams(calibration),
                cookTimeS: solution.result.cookTimeS,
                whiteTargetMin: calibrationDoneness(calibration, level: level).whiteDoseMin
            ), .aim)
        }
        // A change in hand: the egg it aims for.
        if let aim = aimView { return (aim, .aim) }
        // Once the egg is out, under the model and at the level it ran with
        // (`asRanShown`), not a posterior that has since learned from it.
        let ran = asRanShown(running, plan: plan)
        let params = ran?.params ?? calibrationParams(calibration)
        let whiteTarget = calibrationDoneness(calibration, level: ran?.level ?? plan.answer.level).whiteDoseMin
        let start = running.startedAtS
        if phase == .done, let pulled = running.events.pulled {
            return (cache.preview(
                egg: plan.egg, setup: plan.setup, params: params, cookTimeS: pulled.outS - start,
                whiteTargetMin: whiteTarget
            ), .ran)
        }
        // In the water until the cook said the eggs were out, or until the
        // grace ran out with nobody saying, and on through the carryover.
        let assumedOut = plan.deadlines.cookEndS + pullGraceSeconds
        let out = running.events.pulled?.outS ?? (nowS >= assumedOut ? assumedOut : nil)
        let outS = out.map { $0 - start }
        let elapsedS = nowS - start
        return (cache.live(
            egg: plan.egg, setup: plan.setup, startedAtS: start, params: params,
            toS: outS.map { min(elapsedS, $0 + Constants.carryoverWindow) } ?? elapsedS,
            outAtS: outS, whiteTargetMin: whiteTarget
        ), .live)
    }
}

/// How set the drawing's yolk is, its rings' mean, to a thousandth; nil with
/// no egg drawn.
public func yolkSet(_ view: SectionView?) -> Double? {
    guard let view else { return nil }
    let yolk = view.set.indices.filter { view.yolk[$0] }.map { view.set[$0] }
    let mean = yolk.isEmpty ? 0 : yolk.reduce(0, +) / Double(yolk.count)
    return (mean * 1000).rounded() / 1000
}

/// The live section carried forward between ticks, so each second costs two
/// steps rather than a replay. A new egg, water, start or model - the boil
/// tapped, a slow hob, a restore, a correction - replays it from t = 0, since
/// the water it has been in changed. And the last preview worked out, which
/// is a few thousand steps, so once for each thing it is of.
@MainActor
public final class SectionCache {
    private var section: EggSection?
    private var key = ""
    private var preview: SectionView?
    private var previewKey = ""

    public init() {}

    func live(
        egg: Egg, setup: CookSetup, startedAtS: Double, params: ModelParams,
        toS: Double, outAtS: Double?, whiteTargetMin: Double
    ) -> SectionView {
        let k = "\(egg)|\(setup)|\(startedAtS)|\(params)"
        if section == nil || key != k {
            section = EggSection(egg: egg, setup: setup, params: params)
            key = k
        }
        section!.advance(egg: egg, setup: setup, toS: toS, outAtS: outAtS)
        return section!.view(whiteTargetMin: whiteTargetMin)
    }

    /// `previewSection`, the egg as eaten for a pot, a time in the water and
    /// a white's target.
    func preview(
        egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double, whiteTargetMin: Double
    ) -> SectionView {
        let k = "\(egg)|\(setup)|\(params)|\(cookTimeS)|\(whiteTargetMin)"
        if let preview, previewKey == k { return preview }
        let view = previewSection(
            egg: egg, setup: setup, params: params, cookTimeS: cookTimeS, whiteTargetMin: whiteTargetMin
        )
        preview = view
        previewKey = k
        return view
    }
}

// MARK: - The egg's page

/// Whether this phase brings the egg's page back, from Settings or Help:
/// the pull, when the eggs must come out.
public func bringsEggBack(_ phase: Phase) -> Bool { phase == .pull }
