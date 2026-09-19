import Foundation

/// The isothermal limit: put the egg into a bath already at the target
/// temperature and wait. Transliterated from `src/core/sousvide.ts`.
///
/// This needs no integration. The centre equilibrates on the sphere's own
/// timescale, and everything after that accumulates dose at a single constant
/// rate, so a hold time answers it directly. Two hold times come out, and the
/// interesting one is not the yolk's.
///
/// READ THIS BEFORE BELIEVING THE OUTPUT. The model behind it is conduction
/// only. Below about 60 C the albumen never sets, stays liquid, and convects:
/// Denys et al. (2004) measure buoyancy-driven flow in liquid albumen strong
/// enough to move the cold spot, and Vega & Mercade-Prieto (2011) need
/// alpha > 2e-7 m^2/s to fit a 6X C cook with a conduction model. So
/// `equilibrateS` below is too long, probably by a lot.
///
/// The HOLD times are unaffected by any of that - they depend only on the bath
/// temperature and the dose targets - and they are the numbers that make the
/// answer what it is.

/// The bath temperature the app offers. 58 C is squarely inside the range the
/// low-temperature literature argues about, which is the point.
public let sousVideBathC = 58.0

/// How close the centre must come to the bath before it counts as "at
/// temperature": within 2% of the original gap.
private let equilibrationGap = 0.02

public struct SousVideEstimate: Sendable {
    public let bathC: Double
    /// Time for the yolk centre to reach the bath temperature.
    public let equilibrateS: Double
    /// Hold at the bath temperature that the yolk dose target needs.
    public let yolkHoldS: Double
    /// Hold that the white dose target needs. Usually the binding one, and
    /// usually by a factor of tens.
    public let whiteHoldS: Double
    /// Equilibration plus whichever hold binds.
    public let totalS: Double
    /// True when the white is what makes the answer absurd.
    public let whiteBound: Bool
}

/// Seconds for the centre of a sphere to close all but `equilibrationGap` of a
/// step change at its surface. Bisection on the Fourier number.
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
        .holdTime(doseMinutes: yolkDoseMin, heldC: bathC) * 60.0
    let whiteHoldS = Dose(zK: Constants.zWhite, trefC: Constants.tRefWhiteC)
        .holdTime(doseMinutes: whiteDoseMin, heldC: bathC) * 60.0
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
