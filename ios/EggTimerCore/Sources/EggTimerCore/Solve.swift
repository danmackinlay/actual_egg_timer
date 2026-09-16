import Foundation

/// Putting it together: simulate a cook, and invert for the cook time that hits
/// a doneness target. Transliterated from `src/core/solve.ts`.

/// The calibratable parameters. Everything else is fixed physics.
public struct ModelParams: Sendable {
    /// Thermal diffusivity, m^2/s. Absorbs all geometry and property error,
    /// since only tau = R^2/alpha is identifiable.
    public var alphaM2s: Double
    /// Multiplier on the still-air cooling time constant.
    public var tauAirScale: Double

    public init(alphaM2s: Double = Constants.alphaDefault, tauAirScale: Double = 1.0) {
        self.alphaM2s = alphaM2s
        self.tauAirScale = tauAirScale
    }

    public static let `default` = ModelParams()
}

/// Dose target for the white, equivalent minutes at 80 C, read at the yolk
/// boundary - the innermost white is the last to set.
public let whiteDoseTarget = 0.05

/// Yolk dose targets at the ends of the slider, equivalent minutes at 63 C.
public let yolkDoseRunny = 0.05
public let yolkDoseHard = 2000.0

public struct Doneness: Sendable {
    public let level: Double
    public let yolkDoseMin: Double
    public let whiteDoseMin: Double
}

/// Map the single slider to a yolk dose target. Logarithmic, which - because
/// dose goes as 10^(T/z) - makes the slider linear in peak yolk temperature.
public func donenessFromSlider(_ level: Double) -> Doneness {
    let clamped = level < 0.0 ? 0.0 : (level > 1.0 ? 1.0 : level)
    let lo = log10(yolkDoseRunny)
    let hi = log10(yolkDoseHard)
    return Doneness(
        level: clamped,
        yolkDoseMin: pow(10.0, lo + (hi - lo) * clamped),
        whiteDoseMin: whiteDoseTarget
    )
}

public func sliderFromYolkDose(_ yolkDoseMin: Double) -> Double {
    let lo = log10(yolkDoseRunny)
    let hi = log10(yolkDoseHard)
    let level = (log10(yolkDoseMin) - lo) / (hi - lo)
    return level < 0.0 ? 0.0 : (level > 1.0 ? 1.0 : level)
}

public struct DonenessAnchor: Sendable {
    public let label: String
    public let level: Double
    public let approxPeakYolkC: Double
}

public let donenessAnchors: [DonenessAnchor] = [
    DonenessAnchor(label: "Runny", level: 0.00, approxPeakYolkC: 56),
    DonenessAnchor(label: "Soft", level: 0.22, approxPeakYolkC: 61),
    DonenessAnchor(label: "Jammy", level: 0.41, approxPeakYolkC: 65),
    DonenessAnchor(label: "Fudgy", level: 0.62, approxPeakYolkC: 70),
    DonenessAnchor(label: "Hard", level: 1.00, approxPeakYolkC: 77),
]

public struct CookResult: Sendable {
    public let cookTimeS: Double
    /// Highest temperature the yolk centre ever reaches, carryover included.
    public let peakYolkC: Double
    public let peakYolkTimeS: Double
    /// Yolk centre at the moment the egg leaves the water.
    public let yolkAtPullC: Double
    public let yolkDoseMin: Double
    public let whiteDoseMin: Double
    public let peakWhiteC: Double
}

/// Run one cook and report what it does to the egg.
public func simulate(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double
) -> CookResult {
    let initialSurface = Protocols.initialSurfaceTemperature(setup)
    var sphere = SphereState(
        radiusM: egg.radiusM, alphaM2s: params.alphaM2s,
        initialC: setup.eggStartC, surfaceC: initialSurface
    )
    var yolkDose = Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC)
    var whiteDose = Dose(zK: Constants.zWhite, trefC: Constants.tRefWhiteC)

    var t = 0.0
    var peakYolk = setup.eggStartC
    var peakYolkTime = 0.0
    var peakWhite = setup.eggStartC
    var yolkAtPull = setup.eggStartC
    var pullRecorded = false
    var prevYolk = setup.eggStartC
    var peakDoseRate = 0.0
    // Captured when the egg leaves the water: a lumped egg in air relaxes from
    // its own volume-average temperature, the ceiling on carryover.
    var meanAtPull = setup.eggStartC
    var waterAtPull = initialSurface

    let endTime = cookTimeS + Constants.carryoverWindow
    while t < endTime {
        let tNext = t + Constants.dtSim
        let next: Double
        if tNext < cookTimeS {
            next = Protocols.bathTemperature(setup, tS: tNext)
        } else {
            if !pullRecorded {
                meanAtPull = sphere.meanTemperature
                waterAtPull = sphere.surfaceC
            }
            next = Protocols.coolingTemperature(
                setup: setup, elapsedSincePullS: tNext - cookTimeS,
                waterAtPullC: waterAtPull, meanAtPullC: meanAtPull,
                tauAirScale: params.tauAirScale
            )
        }
        sphere.step(dtS: Constants.dtSim, nextSurfaceC: next)
        t = tNext

        let yolkCentre = sphere.centreTemperature
        let whiteInner = sphere.temperature(atX: Constants.yolkRadiusFrac)
        yolkDose.accumulate(temperatureC: yolkCentre, dtS: Constants.dtSim)
        whiteDose.accumulate(temperatureC: whiteInner, dtS: Constants.dtSim)

        if yolkCentre > peakYolk {
            peakYolk = yolkCentre
            peakYolkTime = t
        }
        if whiteInner > peakWhite { peakWhite = whiteInner }
        if !pullRecorded && t >= cookTimeS {
            yolkAtPull = yolkCentre
            pullRecorded = true
        }

        // Stop once the egg is past its peak and the remaining dose rate is a
        // millionth of the peak: further integration cannot change the answer.
        let rate = pow(10.0, (yolkCentre - Constants.tRefYolkC) / Constants.zYolk)
        if rate > peakDoseRate { peakDoseRate = rate }
        if t > cookTimeS && yolkCentre < prevYolk && rate < 1e-6 * peakDoseRate { break }
        prevYolk = yolkCentre
    }

    return CookResult(
        cookTimeS: cookTimeS,
        peakYolkC: peakYolk,
        peakYolkTimeS: peakYolkTime,
        yolkAtPullC: yolkAtPull,
        yolkDoseMin: yolkDose.minutes,
        whiteDoseMin: whiteDose.minutes,
        peakWhiteC: peakWhite
    )
}

// MARK: - search

private let solveLoS = 20.0
private let solveHiS = 3600.0
private let solveTolS = 1.0

private func yolkOf(_ r: CookResult) -> Double { r.yolkDoseMin }
private func whiteOf(_ r: CookResult) -> Double { r.whiteDoseMin }

/// Cook time in [lo, hi] at which `metric` first reaches `target`, assuming the
/// metric is monotonic across that bracket. Returns the UPPER end of the final
/// bracket: the shortest cook known to meet the target. The midpoint would be
/// as accurate but could sit a hair short, and callers compare the dose at the
/// answer against the target.
private func bisectBetween(
    egg: Egg, setup: CookSetup, params: ModelParams,
    target: Double, metric: (CookResult) -> Double, loS: Double, hiS: Double
) -> Double {
    var lo = loS
    var hi = hiS
    while hi - lo > solveTolS {
        let mid = 0.5 * (lo + hi)
        if metric(simulate(egg: egg, setup: setup, params: params, cookTimeS: mid)) < target {
            lo = mid
        } else {
            hi = mid
        }
    }
    return hi
}

/// Bisect the whole range. Both doses increase monotonically with cook time
/// while the water is held at the boil, so this is exact there.
private func bisect(
    egg: Egg, setup: CookSetup, params: ModelParams,
    target: Double, metric: (CookResult) -> Double
) -> Double {
    bisectBetween(
        egg: egg, setup: setup, params: params, target: target, metric: metric,
        loS: solveLoS, hiS: solveHiS
    )
}

public struct Solution: Sendable {
    public let result: CookResult
    /// False when the requested doneness cannot be reached without leaving the
    /// white undercooked.
    public let reachable: Bool
    /// Shortest cook that still sets the white.
    public let minCookTimeS: Double
    /// Softest yolk doneness achievable, as a slider position.
    public let softestLevel: Double
    /// Hardest achievable. 1 whenever the water stays at the boil; less when
    /// the heat is off and the pan runs out before the yolk gets there.
    public let hardestLevel: Double
    /// False when the white never sets at all - only possible with the heat
    /// off, where the water can fall past the white's target while the egg is
    /// still in it.
    public let whiteSets: Bool
}

/// Solve for the cook time that delivers the requested doneness.
public func solveCookTime(
    egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness
) -> Solution {
    if setup.afterBoil == .off {
        return solveStanding(egg: egg, setup: setup, params: params, doneness: doneness)
    }

    let minCook = bisect(
        egg: egg, setup: setup, params: params, target: doneness.whiteDoseMin, metric: whiteOf
    )
    let atMin = simulate(egg: egg, setup: setup, params: params, cookTimeS: minCook)
    let softestLevel = sliderFromYolkDose(atMin.yolkDoseMin)
    let whiteSets = atMin.whiteDoseMin >= doneness.whiteDoseMin

    if atMin.yolkDoseMin >= doneness.yolkDoseMin {
        // Even the shortest white-setting cook overcooks the yolk.
        return Solution(
            result: atMin, reachable: false, minCookTimeS: minCook,
            softestLevel: softestLevel, hardestLevel: 1.0, whiteSets: whiteSets
        )
    }

    let cook = bisect(
        egg: egg, setup: setup, params: params, target: doneness.yolkDoseMin, metric: yolkOf
    )
    return Solution(
        result: simulate(egg: egg, setup: setup, params: params, cookTimeS: cook),
        reachable: true, minCookTimeS: minCook,
        softestLevel: softestLevel, hardestLevel: 1.0, whiteSets: whiteSets
    )
}

// MARK: - standing

/// Fraction of the best available dose that counts as "as far as this pan
/// goes". The maximum sits on a plateau, so the time worth printing is the
/// start of it, not its peak.
private let standingKnee = 0.99

/// How long past the boil it is worth looking with the heat off.
private let standingHorizonS = 1800.0

/// Coarse step for the standing scan: fine enough that the bracket it hands to
/// the bisection is locally monotonic, coarse enough to stay cheap.
private let scanStepS = 30.0

/// Both doses sampled at every scan step. One pass answers every question the
/// standing solver has.
private struct DoseCurve {
    var timesS: [Double] = []
    var yolk: [Double] = []
    var white: [Double] = []
}

private func scanStanding(
    egg: Egg, setup: CookSetup, params: ModelParams, horizonS: Double
) -> DoseCurve {
    var curve = DoseCurve()
    var t = solveLoS
    while t <= horizonS {
        let r = simulate(egg: egg, setup: setup, params: params, cookTimeS: t)
        curve.timesS.append(t)
        curve.yolk.append(r.yolkDoseMin)
        curve.white.append(r.whiteDoseMin)
        t += scanStepS
    }
    return curve
}

private func indexOfMax(_ values: [Double]) -> Int {
    var best = 0
    for i in 1..<values.count where values[i] > values[best] { best = i }
    return best
}

/// First cook time at which a sampled dose reaches `target`, WITHOUT assuming
/// monotonicity - or -1 if it never does.
///
/// With the heat off, pulling later means pulling from cooler water, so the
/// carryover that follows is smaller and past a point the total dose FALLS with
/// a longer cook. Bisection on that does not lose accuracy, it lands anywhere.
/// So: walk the samples to the first crossing, then bisect inside that one
/// step, where the function is still rising.
private func firstCrossing(
    egg: Egg, setup: CookSetup, params: ModelParams,
    curve: DoseCurve, values: [Double], target: Double, metric: (CookResult) -> Double
) -> Double {
    for i in 0..<values.count {
        if values[i] < target { continue }
        if i == 0 { return curve.timesS[0] }
        return bisectBetween(
            egg: egg, setup: setup, params: params, target: target, metric: metric,
            loS: curve.timesS[i - 1], hiS: curve.timesS[i]
        )
    }
    return -1.0
}

/// The same question with the heat off, where neither dose is monotonic in cook
/// time and every shortcut above stops being valid. The scan runs to the
/// horizon regardless of where the target is crossed, so `hardestLevel` is the
/// true ceiling of this pan and not merely "at least what was asked".
private func solveStanding(
    egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness
) -> Solution {
    let curve = scanStanding(
        egg: egg, setup: setup, params: params, horizonS: setup.timeToBoilS + standingHorizonS
    )
    let whiteCook = firstCrossing(
        egg: egg, setup: setup, params: params, curve: curve, values: curve.white,
        target: doneness.whiteDoseMin, metric: whiteOf
    )
    let yolkCook = firstCrossing(
        egg: egg, setup: setup, params: params, curve: curve, values: curve.yolk,
        target: doneness.yolkDoseMin, metric: yolkOf
    )

    let peak = indexOfMax(curve.yolk)
    let maxDose = curve.yolk[peak]
    let maxAt = curve.timesS[peak]
    let hardestLevel = sliderFromYolkDose(maxDose)
    let whiteSets = whiteCook > 0
    let minCook = whiteSets ? whiteCook : maxAt
    let atMin = simulate(egg: egg, setup: setup, params: params, cookTimeS: minCook)
    let softestLevel = sliderFromYolkDose(atMin.yolkDoseMin)

    if !whiteSets || yolkCook < 0 {
        // Either the water never gets the white where it needs to go, or it
        // runs out before the yolk does. Answer with the furthest this pan
        // goes - but the START of the plateau, since waiting past it achieves
        // nothing.
        let knee = firstCrossing(
            egg: egg, setup: setup, params: params, curve: curve, values: curve.yolk,
            target: standingKnee * maxDose, metric: yolkOf
        )
        let at = knee > 0 ? knee : maxAt
        return Solution(
            result: simulate(egg: egg, setup: setup, params: params, cookTimeS: at),
            reachable: false, minCookTimeS: minCook,
            softestLevel: softestLevel, hardestLevel: hardestLevel, whiteSets: whiteSets
        )
    }

    if atMin.yolkDoseMin >= doneness.yolkDoseMin {
        return Solution(
            result: atMin, reachable: false, minCookTimeS: minCook,
            softestLevel: softestLevel, hardestLevel: hardestLevel, whiteSets: whiteSets
        )
    }

    // Both constraints have to hold at the same pull: take the later crossing.
    let cook = yolkCook > whiteCook ? yolkCook : whiteCook
    return Solution(
        result: simulate(egg: egg, setup: setup, params: params, cookTimeS: cook),
        reachable: true, minCookTimeS: minCook,
        softestLevel: softestLevel, hardestLevel: hardestLevel, whiteSets: whiteSets
    )
}
