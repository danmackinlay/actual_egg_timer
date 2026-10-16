import Foundation

/// The twin of `src/core/doseGrid.ts`; the TypeScript's comments say what each
/// part is for.

/// The cached dose surface, log10 equivalent minutes on a grid over (alpha,
/// cook time).
public struct DoseGrid: Sendable, Codable {
    public let logAlphaMin: Double
    public let logAlphaStep: Double
    public let alphaCount: Int
    public let timeMinS: Double
    public let timeStepS: Double
    public let timeCount: Int
    /// log10 equivalent-minutes, row-major [alphaIndex * timeCount + timeIndex].
    public let logYolk: [Double]
    public let logWhite: [Double]
    /// Same layout, in C.
    public let peakYolkC: [Double]

    public init(
        logAlphaMin: Double, logAlphaStep: Double, alphaCount: Int,
        timeMinS: Double, timeStepS: Double, timeCount: Int,
        logYolk: [Double], logWhite: [Double], peakYolkC: [Double]
    ) {
        self.logAlphaMin = logAlphaMin
        self.logAlphaStep = logAlphaStep
        self.alphaCount = alphaCount
        self.timeMinS = timeMinS
        self.timeStepS = timeStepS
        self.timeCount = timeCount
        self.logYolk = logYolk
        self.logWhite = logWhite
        self.peakYolkC = peakYolkC
    }

    enum CodingKeys: String, CodingKey {
        case logAlphaMin, logAlphaStep, alphaCount, timeMinS = "timeMin_s", timeStepS = "timeStep_s"
        case timeCount, logYolk, logWhite, peakYolkC = "peakYolk_C"
    }
}

private func safeLog10(_ v: Double) -> Double {
    v <= 1e-12 ? logFloor : log10(v)
}

/// The dose surface's extent and resolution.
public struct GridSpec: Sendable, Codable {
    public let alphaMin: Double
    public let alphaMax: Double
    public let alphaCount: Int
    public let timeMinS: Double
    public let timeMaxS: Double
    public let timeCount: Int

    enum CodingKeys: String, CodingKey {
        case alphaMin, alphaMax, alphaCount, timeMinS = "timeMin_s", timeMaxS = "timeMax_s", timeCount
    }
}

/// Production is `calibrationGrid` (Record.swift); fixtures and tests pass a
/// coarser one.
public typealias GridPolicy = @Sendable (Double, Double) -> GridSpec

/// Everything a dose-surface build needs.
public struct GridRequest: Sendable, Codable {
    public let egg: Egg
    public let setup: CookSetup
    public let spec: GridSpec
}

public func buildDoseGrid(egg: Egg, setup: CookSetup, spec: GridSpec) -> DoseGrid {
    let (alphaMin, alphaMax, alphaCount) = (spec.alphaMin, spec.alphaMax, spec.alphaCount)
    let (timeMinS, timeMaxS, timeCount) = (spec.timeMinS, spec.timeMaxS, spec.timeCount)
    let logAlphaMin = log(alphaMin)
    let logAlphaStep = (log(alphaMax) - logAlphaMin) / Double(alphaCount - 1)
    let timeStep = (timeMaxS - timeMinS) / Double(timeCount - 1)
    var logYolk = [Double](repeating: 0.0, count: alphaCount * timeCount)
    var logWhite = [Double](repeating: 0.0, count: alphaCount * timeCount)
    var peakYolk = [Double](repeating: 0.0, count: alphaCount * timeCount)

    for ai in 0..<alphaCount {
        let alpha = exp(logAlphaMin + logAlphaStep * Double(ai))
        for ti in 0..<timeCount {
            let cook = timeMinS + timeStep * Double(ti)
            let r = simulate(
                egg: egg, setup: setup,
                params: ModelParams(alphaM2s: alpha),
                cookTimeS: cook
            )
            logYolk[ai * timeCount + ti] = safeLog10(r.yolkDoseMin)
            logWhite[ai * timeCount + ti] = safeLog10(r.whiteDoseMin)
            peakYolk[ai * timeCount + ti] = r.peakYolkC
        }
    }
    return DoseGrid(
        logAlphaMin: logAlphaMin, logAlphaStep: logAlphaStep, alphaCount: alphaCount,
        timeMinS: timeMinS, timeStepS: timeStep, timeCount: timeCount,
        logYolk: logYolk, logWhite: logWhite, peakYolkC: peakYolk
    )
}

public func buildRequestedGrid(_ q: GridRequest) -> DoseGrid {
    buildDoseGrid(egg: q.egg, setup: q.setup, spec: q.spec)
}

private func interpolate(
    _ table: [Double], _ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double
) -> Double {
    var a = (log(alphaM2s) - g.logAlphaMin) / g.logAlphaStep
    var t = (cookTimeS - g.timeMinS) / g.timeStepS
    if a < 0.0 { a = 0.0 }
    if a > Double(g.alphaCount - 1) { a = Double(g.alphaCount - 1) }
    if t < 0.0 { t = 0.0 }
    if t > Double(g.timeCount - 1) { t = Double(g.timeCount - 1) }

    let ai = min(Int(a.rounded(.down)), g.alphaCount - 2)
    let ti = min(Int(t.rounded(.down)), g.timeCount - 2)
    let fa = a - Double(ai)
    let ft = t - Double(ti)

    let v00 = table[ai * g.timeCount + ti]
    let v01 = table[ai * g.timeCount + ti + 1]
    let v10 = table[(ai + 1) * g.timeCount + ti]
    let v11 = table[(ai + 1) * g.timeCount + ti + 1]
    return v00 * (1 - fa) * (1 - ft) + v10 * fa * (1 - ft)
        + v01 * (1 - fa) * ft + v11 * fa * ft
}

public func lookupLogYolkDose(_ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double) -> Double {
    interpolate(g.logYolk, g, alphaM2s, cookTimeS)
}

public func lookupLogWhiteDose(_ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double) -> Double {
    interpolate(g.logWhite, g, alphaM2s, cookTimeS)
}

public func lookupPeakYolkC(_ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double) -> Double {
    interpolate(g.peakYolkC, g, alphaM2s, cookTimeS)
}

private func cookTimeFor(_ table: [Double], _ g: DoseGrid, _ alphaM2s: Double, _ logDose: Double) -> Double {
    var lo = g.timeMinS
    var hi = g.timeMinS + g.timeStepS * Double(g.timeCount - 1)
    for _ in 0..<40 {
        let mid = 0.5 * (lo + hi)
        if interpolate(table, g, alphaM2s, mid) < logDose { lo = mid } else { hi = mid }
    }
    return 0.5 * (lo + hi)
}

public func cookTimeForLogYolkDose(_ g: DoseGrid, _ alphaM2s: Double, _ logDose: Double) -> Double {
    cookTimeFor(g.logYolk, g, alphaM2s, logDose)
}

func cookTimeForLogWhiteDose(_ g: DoseGrid, _ alphaM2s: Double, _ logDose: Double) -> Double {
    cookTimeFor(g.logWhite, g, alphaM2s, logDose)
}
