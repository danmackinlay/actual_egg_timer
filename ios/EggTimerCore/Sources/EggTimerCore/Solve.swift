import Foundation
import EggTimerCopy

/// The twin of `src/core/solve.ts`, held to it by `fixtures/scenarios.json`;
/// the TypeScript's comments say what each part is for.

public struct ModelParams: Sendable, Codable, Equatable {
    public var alphaM2s: Double

    public init(alphaM2s: Double = Constants.alphaDefault) {
        self.alphaM2s = alphaM2s
    }

    public static let `default` = ModelParams()

    enum CodingKeys: String, CodingKey {
        case alphaM2s = "alpha_m2s"
    }
}

public struct Doneness: Sendable, Codable {
    public let level: Double
    public let yolkDoseMin: Double
    public let whiteDoseMin: Double

    enum CodingKeys: String, CodingKey {
        case level, yolkDoseMin = "yolkDose_min", whiteDoseMin = "whiteDose_min"
    }
}

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

public func logYolkTarget(_ level: Double) -> Double {
    log10(donenessFromSlider(level).yolkDoseMin)
}

func sliderFromYolkDose(_ yolkDoseMin: Double) -> Double {
    let lo = log10(yolkDoseRunny)
    let hi = log10(yolkDoseHard)
    let level = (log10(yolkDoseMin) - lo) / (hi - lo)
    return level < 0.0 ? 0.0 : (level > 1.0 ? 1.0 : level)
}

/// A labelled slider position.
public struct DonenessAnchor: Sendable, Codable {
    public let key: CopyKey
    public let level: Double
    public let approxPeakYolkC: Double

    enum CodingKeys: String, CodingKey {
        case key, level, approxPeakYolkC = "approxPeakYolk_C"
    }
}

public struct CookResult: Sendable, Codable {
    public let cookTimeS: Double
    public let peakYolkC: Double
    public let peakYolkTimeS: Double
    public let yolkAtPullC: Double
    public let yolkDoseMin: Double
    public let whiteDoseMin: Double
    public let peakWhiteC: Double

    enum CodingKeys: String, CodingKey {
        case cookTimeS = "cookTime_s", peakYolkC = "peakYolk_C", peakYolkTimeS = "peakYolkTime_s"
        case yolkAtPullC = "yolkAtPull_C", yolkDoseMin = "yolkDose_min", whiteDoseMin = "whiteDose_min"
        case peakWhiteC = "peakWhite_C"
    }
}

public func simulate(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double
) -> CookResult {
    let initialSurface = Protocols.initialSurfaceTemperature(egg, setup)
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
    var waterAtPull = initialSurface
    var meanAtPull = setup.eggStartC

    let endTime = cookTimeS + Constants.carryoverWindow
    while t < endTime {
        let tNext = t + Constants.dtSim
        let next: Double
        if tNext < cookTimeS {
            next = Protocols.bathTemperature(egg, setup, tS: tNext)
        } else {
            if !pullRecorded {
                waterAtPull = sphere.surfaceC
                meanAtPull = sphere.meanTemperature
            }
            next = Protocols.coolingTemperature(
                sphere: sphere, egg: egg, setup: setup, elapsedSincePullS: tNext - cookTimeS,
                dtS: Constants.dtSim, waterAtPullC: waterAtPull, meanAtPullC: meanAtPull
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

private func yolkOf(_ r: CookResult) -> Double { r.yolkDoseMin }
private func whiteOf(_ r: CookResult) -> Double { r.whiteDoseMin }

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

private func bisect(
    egg: Egg, setup: CookSetup, params: ModelParams,
    target: Double, metric: (CookResult) -> Double
) -> Double {
    bisectBetween(
        egg: egg, setup: setup, params: params, target: target, metric: metric,
        loS: solveLoS, hiS: solveHiS
    )
}

public struct Solution: Sendable, Codable {
    public let result: CookResult
    public let reachable: Bool
    public let minCookTimeS: Double
    public let softestLevel: Double
    public let hardestLevel: Double
    public let whiteSets: Bool

    enum CodingKeys: String, CodingKey {
        case result, reachable, minCookTimeS = "minCookTime_s", softestLevel, hardestLevel, whiteSets
    }
}

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

private func solveStanding(
    egg: Egg, setup: CookSetup, params: ModelParams, doneness: Doneness
) -> Solution {
    let heatOffS = setup.startMode == .cold ? setup.timeToBoilS : 0.0
    let curve = scanStanding(
        egg: egg, setup: setup, params: params, horizonS: heatOffS + standingHorizonS
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

    let cook = yolkCook > whiteCook ? yolkCook : whiteCook
    return Solution(
        result: simulate(egg: egg, setup: setup, params: params, cookTimeS: cook),
        reachable: true, minCookTimeS: minCook,
        softestLevel: softestLevel, hardestLevel: hardestLevel, whiteSets: whiteSets
    )
}
