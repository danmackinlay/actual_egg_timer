import Foundation

/// Cached dose surface, so Bayesian calibration is fast enough to run in a UI.
///
/// The particle filter needs the delivered dose for every particle at the cook
/// time actually used. Calling `simulate()` per particle costs ~1.9 ms, so 2000
/// particles is ~3.4 s - far too slow. Precomputing log10(dose) on a grid over
/// (alpha, cook time) and interpolating bilinearly turns each particle lookup
/// into a handful of flops.
///
/// Log dose rather than dose: it spans four orders of magnitude over three
/// minutes of cooking (z ~ 4.65 K makes the kinetics very sharp), so linear
/// interpolation of the raw value would be hopeless. In log space the surface is
/// close to linear, because log10(dose) is roughly T/z and T is smooth.
public struct DoseGrid: Sendable {
    public let logAlphaMin: Double
    public let logAlphaStep: Double
    public let alphaCount: Int
    public let timeMinS: Double
    public let timeStepS: Double
    public let timeCount: Int
    /// log10 equivalent-minutes, row-major [alphaIndex * timeCount + timeIndex].
    public let logYolk: [Double]
    public let logWhite: [Double]

    public init(
        logAlphaMin: Double, logAlphaStep: Double, alphaCount: Int,
        timeMinS: Double, timeStepS: Double, timeCount: Int,
        logYolk: [Double], logWhite: [Double]
    ) {
        self.logAlphaMin = logAlphaMin
        self.logAlphaStep = logAlphaStep
        self.alphaCount = alphaCount
        self.timeMinS = timeMinS
        self.timeStepS = timeStepS
        self.timeCount = timeCount
        self.logYolk = logYolk
        self.logWhite = logWhite
    }
}

private let logFloor = -12.0

private func safeLog10(_ v: Double) -> Double {
    v <= 1e-12 ? logFloor : log10(v)
}

/// Build the surface. Cost is alphaCount * timeCount simulations, so ~1.5 s at
/// the default 21 x 36. Rebuild only when the egg, setup or tauAirScale change,
/// never on every keystroke.
public func buildDoseGrid(
    egg: Egg, setup: CookSetup, tauAirScale: Double,
    alphaMin: Double, alphaMax: Double, alphaCount: Int,
    timeMinS: Double, timeMaxS: Double, timeCount: Int
) -> DoseGrid {
    let logAlphaMin = log(alphaMin)
    let logAlphaStep = (log(alphaMax) - logAlphaMin) / Double(alphaCount - 1)
    let timeStep = (timeMaxS - timeMinS) / Double(timeCount - 1)
    var logYolk = [Double](repeating: 0.0, count: alphaCount * timeCount)
    var logWhite = [Double](repeating: 0.0, count: alphaCount * timeCount)

    for ai in 0..<alphaCount {
        let alpha = exp(logAlphaMin + logAlphaStep * Double(ai))
        for ti in 0..<timeCount {
            let cook = timeMinS + timeStep * Double(ti)
            let r = simulate(
                egg: egg, setup: setup,
                params: ModelParams(alphaM2s: alpha, tauAirScale: tauAirScale),
                cookTimeS: cook
            )
            logYolk[ai * timeCount + ti] = safeLog10(r.yolkDoseMin)
            logWhite[ai * timeCount + ti] = safeLog10(r.whiteDoseMin)
        }
    }
    return DoseGrid(
        logAlphaMin: logAlphaMin, logAlphaStep: logAlphaStep, alphaCount: alphaCount,
        timeMinS: timeMinS, timeStepS: timeStep, timeCount: timeCount,
        logYolk: logYolk, logWhite: logWhite
    )
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

/// log10 of the yolk dose delivered, equivalent minutes at 63 C.
public func lookupLogYolkDose(_ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double) -> Double {
    interpolate(g.logYolk, g, alphaM2s, cookTimeS)
}

/// log10 of the white dose delivered, equivalent minutes at 80 C.
public func lookupLogWhiteDose(_ g: DoseGrid, _ alphaM2s: Double, _ cookTimeS: Double) -> Double {
    interpolate(g.logWhite, g, alphaM2s, cookTimeS)
}

/// Invert the surface: the cook time delivering a given log10 yolk dose.
/// Dose is monotonic in cook time, so bisection on the interpolant is safe.
public func cookTimeForLogYolkDose(
    _ g: DoseGrid, _ alphaM2s: Double, _ logDose: Double
) -> Double {
    var lo = g.timeMinS
    var hi = g.timeMinS + g.timeStepS * Double(g.timeCount - 1)
    for _ in 0..<40 {
        let mid = 0.5 * (lo + hi)
        if lookupLogYolkDose(g, alphaM2s, mid) < logDose { lo = mid } else { hi = mid }
    }
    return 0.5 * (lo + hi)
}
