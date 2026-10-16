import Foundation

/// The twin of `src/core/sousvide.ts`, held to it by `fixtures/sousvide.json`;
/// the TypeScript's comments say what each part is for, and why
/// `equilibrateS` is too long below 60 C.

public struct SousVideEstimate: Sendable, Codable {
    public let bathC: Double
    public let equilibrateS: Double
    public let yolkHoldS: Double
    public let whiteHoldS: Double
    public let totalS: Double
    public let whiteBound: Bool

    enum CodingKeys: String, CodingKey {
        case bathC = "bath_C", equilibrateS = "equilibrate_s", yolkHoldS = "yolkHold_s"
        case whiteHoldS = "whiteHold_s", totalS = "total_s", whiteBound
    }
}

public func equilibrationTime(radiusM: Double, alphaM2s: Double) -> Double {
    var lo = 1e-4
    var hi = 4.0
    for _ in 0..<120 {
        let mid = 0.5 * (lo + hi)
        if Sphere.seriesTheta(x: 0.0, fourier: mid) > equilibrationGap { lo = mid } else { hi = mid }
    }
    return 0.5 * (lo + hi) * radiusM * radiusM / alphaM2s
}

public func sousVideEstimate(
    radiusM: Double, alphaM2s: Double, bathC: Double,
    yolkDoseMin: Double, whiteDoseMin: Double
) -> SousVideEstimate {
    let equilibrateS = equilibrationTime(radiusM: radiusM, alphaM2s: alphaM2s)
    let yolkHoldS = Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC)
        .holdTimeForDose(doseMinutes: yolkDoseMin, heldC: bathC) * 60.0
    let whiteHoldS = Dose(zK: Constants.zWhite, trefC: Constants.tRefWhiteC)
        .holdTimeForDose(doseMinutes: whiteDoseMin, heldC: bathC) * 60.0
    let boundS = yolkHoldS > whiteHoldS ? yolkHoldS : whiteHoldS
    return SousVideEstimate(
        bathC: bathC,
        equilibrateS: equilibrateS,
        yolkHoldS: yolkHoldS,
        whiteHoldS: whiteHoldS,
        totalS: equilibrateS + boundS,
        // Not `!(yolkHoldS > whiteHoldS)` spelled differently: an exact tie
        // reports the white as binding, and `boundS` above picks the white for
        // the same tie, so the two never disagree about which hold is on screen.
        whiteBound: whiteHoldS >= yolkHoldS
    )
}
