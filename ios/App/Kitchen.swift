import Foundation
import Observation
import EggTimerCore

/// Every input the solver has, and the answer it last gave.
///
/// The solve is roughly a dozen full simulations of ten thousand steps each, so
/// it does not belong on the main actor while a finger is on the slider. The
/// pattern here is the smallest one that is actually correct: each change starts
/// a fresh task and cancels the one in flight, and a result is only published if
/// it is still the answer to the current question.
@Observable
@MainActor
final class Kitchen {
    // MARK: - Inputs

    var doneness: Double = 0.41 { didSet { changed() } }
    var eggMassG: Double = 62.3 { didSet { changed() } }
    var fromFridge: Bool = true { didSet { changed() } }
    var cooling: Cooling = .ice { didSet { changed() } }
    /// Cold start: egg into cold water, and the heating ramp is part of the
    /// cook. Hot start: into water already at a rolling boil.
    ///
    /// Cold is the default because it is the better way to boil an egg: the
    /// shell is never thermally shocked, and the app can MEASURE the ramp
    /// instead of assuming it. The cost is that it needs you to tap the boil.
    var coldStart: Bool = true { didSet { changed() } }
    /// The standing method - heat off at the boil, lid on. The pan coasts down
    /// and the cook is whatever the stored heat can still do.
    var heatOff: Bool = false { didSet { changed() } }
    var altitudeM: Double = 0 { didSet { changed() } }
    var waterLitres: Double = 2 { didSet { changed() } }
    var eggCount: Double = 4 { didSet { changed() } }

    // MARK: - Outputs

    private(set) var solution: Solution?
    private(set) var solving = false
    /// What this kitchen has learned from its own eggs. Before any feedback it
    /// is the prior, whose mean IS the literature value - so calibration is
    /// purely additive and the app is fully useful on day one.
    private(set) var calibration = Calibrations.load()
    /// True while the dose surface is being rebuilt after an outcome.
    private(set) var learning = false
    /// Why the requested doneness was refused, in words, or empty. The point is
    /// to teach the constraint rather than merely to block the control.
    private(set) var refusal = ""

    private var task: Task<Void, Never>?
    /// Set while the solver is moving the slider itself, so that snapping to a
    /// reachable position does not start another solve.
    private var applying = false
    private var boilMemory = BoilMemory.load()

    init() {
        // Load with saving suppressed. Each assignment below would otherwise
        // fire `changed()` and write the WHOLE settings object back - including
        // the properties not yet loaded, still sitting at their defaults - so
        // restoring `doneness` would overwrite the stored altitude with zero
        // before the next line ever got to read it.
        applying = true
        Settings.load(into: self)
        applying = false
        recompute()
    }

    // MARK: - Derived setup

    var egg: Egg { Geometry.eggFromMass(eggMassG / 1000.0) }

    var eggStartC: Double { fromFridge ? 4 : 20 }

    /// The room, as far as the model is concerned.
    ///
    /// There is no separate input for it, and there should not be: on the
    /// default path - eggs into boiling water, straight into an ice bath - the
    /// room is worth nothing at all, and on a cold start about two seconds per
    /// degree. It earns its keep resting on the counter and standing with the
    /// heat off, and in both the user has usually already said: an egg that has
    /// been sitting out IS at room temperature. A fridge egg says nothing about
    /// the room, so that case keeps the default.
    var ambientC: Double { eggStartC >= 15 ? eggStartC : 20 }

    var boilingC: Double { Thermo.boilingPointAtAltitude(altitudeM) }

    /// Time to a rolling boil, s - the pan's one measured number. Remembered
    /// per water volume, because the same pan on the same hob gives the same
    /// answer next time. Note the solver wants it on a HOT start too: with the
    /// heat off it is the pan's loss time constant, which is the only
    /// measurement of the pan there is.
    var timeToBoilS: Double { boilMemory.estimate(litres: waterLitres) }

    var hasBoilMemory: Bool { boilMemory.isEmpty == false }

    var setup: CookSetup {
        setup(timeToBoilS: timeToBoilS)
    }

    func setup(timeToBoilS: Double) -> CookSetup {
        CookSetup(
            startMode: coldStart ? .cold : .hot,
            eggStartC: eggStartC,
            ambientC: ambientC,
            boilingC: boilingC,
            timeToBoilS: timeToBoilS,
            cooling: cooling,
            waterLitres: waterLitres,
            afterBoil: heatOff ? .off : .hold,
            eggCount: eggCount,
            eggMassKg: egg.massKg
        )
    }

    /// The label moves with the finger; the numbers follow when the solve lands.
    var label: String { Self.anchorNear(doneness).label }

    var eggsLogged: Int { calibration.eggsLogged }
    var calibrationSpread: Double { Calibrations.spread(calibration) }

    /// log10 of the yolk dose the slider is currently asking for. This is what
    /// the filter treats as the nominal target, and the user's taste offset is
    /// learned relative to it, so it carries across slider positions.
    var logNominalTarget: Double { log10(donenessFromSlider(doneness).yolkDoseMin) }

    // MARK: - Solving

    private func changed() {
        guard !applying else { return }
        Settings.save(self)
        recompute()
    }

    private func recompute() {
        task?.cancel()
        solving = true
        let level = doneness
        let setup = setup
        let egg = egg
        let params = Calibrations.params(calibration)
        task = Task {
            let answer = await Self.solve(egg: egg, setup: setup, level: level, params: params)
            guard !Task.isCancelled else { return }
            self.apply(answer)
            self.solving = false
        }
    }

    /// Solve, then clamp the slider to what is physically achievable.
    /// `reachable == false` happens two ways, and they snap in opposite
    /// directions: too soft for the white (snap up), or harder than a cooling
    /// pan can manage (snap down).
    private nonisolated static func solve(
        egg: Egg, setup: CookSetup, level: Double, params: ModelParams
    ) async -> Answer {
        await Task.detached(priority: .userInitiated) {
            var result = solveCookTime(
                egg: egg, setup: setup, params: params, doneness: donenessFromSlider(level)
            )
            if result.reachable {
                return Answer(solution: result, refusal: "", snapTo: nil)
            }

            if !result.whiteSets {
                // Nothing to snap to: the slider has no reachable position at
                // all. The numbers shown are the furthest this pan goes, which
                // is the only honest thing left to put on screen.
                return Answer(solution: result, refusal: whiteNeverSetsText(), snapTo: nil)
            }

            if level > result.hardestLevel {
                // No re-solve: the solver already answered with the furthest
                // this pan goes, so the numbers on screen are the only cook on
                // offer.
                let capped = snapDown(result.hardestLevel)
                return Answer(
                    solution: result,
                    refusal: standingRefusalText(level, result.hardestLevel, setup),
                    snapTo: capped < level ? capped : nil
                )
            }

            let text = refusalText(level, result.softestLevel, setup.cooling)
            let snapped = snapUp(result.softestLevel)
            if snapped > level {
                // Re-solve at the snapped position, so the numbers on screen are
                // the numbers for the cook now being offered.
                let retry = solveCookTime(
                    egg: egg, setup: setup, params: params,
                    doneness: donenessFromSlider(snapped)
                )
                if retry.reachable { result = retry }
                return Answer(solution: result, refusal: text, snapTo: snapped)
            }
            return Answer(solution: result, refusal: text, snapTo: nil)
        }.value
    }

    /// Re-solve for a different time to boil, answering with the total cook
    /// time. This is what a cold start calls when the boil is tapped, and again
    /// whenever a slow hob forces the estimate out.
    func cookTime(timeToBoilS: Double) async -> Double? {
        let answer = await Self.solve(
            egg: egg, setup: setup(timeToBoilS: timeToBoilS), level: doneness,
            params: Calibrations.params(calibration)
        )
        solution = answer.solution
        refusal = answer.refusal
        return answer.solution.result.cookTimeS
    }

    private func apply(_ answer: Answer) {
        solution = answer.solution
        refusal = answer.refusal
        if let snapTo = answer.snapTo, snapTo != doneness {
            applying = true
            doneness = snapTo
            applying = false
            Settings.save(self)
        }
    }

    private struct Answer: Sendable {
        var solution: Solution
        var refusal: String
        /// Where the slider must move to, if anywhere.
        var snapTo: Double?
    }

    // MARK: - Learning from an egg

    /// Fold in one outcome and re-solve with what was learned.
    ///
    /// The grid build is roughly a second of arithmetic, so it goes to a
    /// detached task. It happens once, after the egg has been eaten, and never
    /// while anything is being adjusted - which is the whole reason the surface
    /// is cached rather than simulated per particle.
    func record(feedback: Feedback, cookTimeS: Double, logNominalTarget: Double) async {
        guard !learning else { return }
        learning = true
        let current = calibration
        let egg = egg
        let setup = setup
        let updated = await Task.detached(priority: .userInitiated) {
            Calibrations.recordOutcome(
                current, egg: egg, setup: setup,
                cookTimeS: cookTimeS, logNominalTarget: logNominalTarget, feedback: feedback
            )
        }.value
        calibration = updated
        Calibrations.save(updated)
        learning = false
        // The egg just eaten keeps the numbers it was cooked with; the new
        // ones show up on the next cook.
        recompute()
    }

    /// Re-solve for the inputs as they stand.
    ///
    /// Needed after a cancel. A cold start's boil tap re-solves with the
    /// MEASURED ramp and leaves that answer in `solution`; without this, the
    /// idle screen goes on showing the cook that was just abandoned, which
    /// reads as a Cancel button that did not work.
    func refresh() {
        recompute()
    }

    func resetCalibration() {
        Calibrations.reset()
        calibration = Calibrations.fresh()
        recompute()
    }

    // MARK: - Measuring the boil

    /// Record a measured time to a rolling boil and remember it for this
    /// volume. Blended with whatever was already known, so one odd run - lid
    /// off, pan half empty - does not dominate.
    func rememberBoil(seconds: Double) {
        boilMemory.remember(litres: waterLitres, seconds: seconds)
    }

    // MARK: - Slider arithmetic

    /// Positions per unit of slider travel, so a snapped level always lands
    /// where the thumb can sit.
    private nonisolated static let sliderSteps = 100.0

    /// Round away from the unreachable side. The nudge keeps a level already on
    /// the grid from being pushed a whole step by floating-point noise.
    fileprivate nonisolated static func snapUp(_ level: Double) -> Double {
        min(1, max(0, (level * sliderSteps - 1e-9).rounded(.up) / sliderSteps))
    }

    fileprivate nonisolated static func snapDown(_ level: Double) -> Double {
        min(1, max(0, (level * sliderSteps + 1e-9).rounded(.down) / sliderSteps))
    }

    nonisolated static func anchorNear(_ level: Double) -> DonenessAnchor {
        var best = donenessAnchors[0]
        for anchor in donenessAnchors
        where abs(anchor.level - level) < abs(best.level - level) {
            best = anchor
        }
        return best
    }
}

// MARK: - Refusals, in words

private func refusalText(_ wanted: Double, _ softest: Double, _ cooling: Cooling) -> String {
    let wantedLabel = Kitchen.anchorNear(wanted).label.lowercased()
    let softestLabel = Kitchen.anchorNear(softest).label.lowercased()
    // A sliver of unreachable track at the runny end is normal and not worth a
    // sentence; only explain a refusal the user can actually feel.
    if wantedLabel == softestLabel { return "" }
    switch cooling {
    case .counter:
        return "Resting on the counter keeps cooking the yolk — \(wantedLabel) isn't reachable. "
            + "Softest here is \(softestLabel). Use an ice bath."
    case .tap:
        return "A cold tap doesn't pull the heat out fast enough — \(wantedLabel) isn't reachable. "
            + "Softest here is \(softestLabel). Ice water gets you further."
    case .ice:
        return "Any shorter and the white is still raw — \(wantedLabel) isn't reachable for this egg. "
            + "Softest here is \(softestLabel)."
    }
}

/// The standing method's worst failure: the water falls past the temperature
/// the white needs before the white has had it, so there is no cook here at all
/// - not a soft one, not a hard one.
private func whiteNeverSetsText() -> String {
    "With the heat off this pan never sets the white: the water falls below what the "
        + "white needs while the egg is still in it. Nothing on the slider is reachable. "
        + "More water, a slower boil, or keep it boiling."
}

/// The standing method's own failure: the pan cools off before the yolk gets
/// where it was asked to go, and no amount of waiting fixes it.
private func standingRefusalText(_ wanted: Double, _ hardest: Double, _ setup: CookSetup) -> String {
    let wantedLabel = Kitchen.anchorNear(wanted).label.lowercased()
    let hardestLabel = Kitchen.anchorNear(hardest).label.lowercased()
    if wantedLabel == hardestLabel { return "" }
    let litres = setup.waterLitres
    let volume = litres == litres.rounded() ? String(Int(litres)) : String(format: "%.1f", litres)
    return "With the heat off, the water runs out before the yolk gets there — "
        + "\(wantedLabel) isn't reachable in \(volume) L. "
        + "Hardest here is \(hardestLabel). More water, or keep it boiling."
}

// MARK: - Presentation helpers

/// One line on what the model expects of this cook - the same wording the web
/// app uses, because it is the same model saying it.
func textureNote(peakYolkC: Double, peakWhiteC: Double) -> String {
    let white = peakWhiteC < 71 ? "white just set" : (peakWhiteC < 82 ? "white set" : "white firm")
    let yolk: String
    switch peakYolkC {
    case ..<58: yolk = "yolk liquid"
    case ..<63: yolk = "yolk soft, barely thickened"
    case ..<68: yolk = "yolk jammy"
    case ..<73: yolk = "yolk fudgy"
    default: yolk = "yolk fully set"
    }
    return "\(white), \(yolk)"
}

func clockString(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded()))
    return String(format: "%d:%02d", total / 60, total % 60)
}
