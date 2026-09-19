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

// MARK: - The units

/*
 * Two formatters, here rather than in the app, and the distinction is worth
 * stating because this file is otherwise physics.
 *
 * These are not sentences. They are UNIT CHOICES - when minutes stop being a
 * useful unit and become hours, when hours become days, when a date stops being
 * a weekday and becomes "N weeks ago". Both apps have to bucket an estimate
 * identically or the same number reads differently on each, which is precisely
 * what happened: they were transliterated by hand and at a 58 C bath only two of
 * the six branches below are ever reached, so four of them were ported and never
 * once executed in either language.
 *
 * The words are here because a number and its unit are one thing. Splitting
 * "22 h 43 min" across two languages is the mistake, not the fix.
 */

/// "45 min", "22 h 43 min", "3 days", "5 weeks". Minutes and seconds stop being
/// a useful unit somewhere around the point this app stops being useful.
public func formatLongDuration(_ seconds: Double) -> String {
    let minutes = Int((seconds / 60.0).rounded())
    if minutes < 90 { return "\(minutes) min" }
    let hours = minutes / 60
    let rest = minutes % 60
    if hours < 48 { return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min" }
    let days = Int((Double(hours) / 24.0).rounded())
    if days < 14 { return "\(days) days" }
    return "\(Int((Double(days) / 7.0).rounded())) weeks"
}

/// How long ago the cook should have started, in words: "Today", "Yesterday",
/// "Last Tuesday", "Last week", "3 weeks ago", "4 months ago".
///
/// Takes the day count and the weekday NAME rather than a date, so it is pure
/// and so the calendar arithmetic stays where it belongs. Counting whole days
/// across a local midnight is a platform job - `Calendar` does it correctly
/// here, and the web normalises to midnight and divides - and neither should be
/// reimplemented in this package. Passing the weekday in also makes the one real
/// difference between the apps visible instead of hidden: this side reads it
/// from a locale-aware formatter and the web from an English table, so a
/// non-English phone says "Last mardi". That is the better answer here, and it
/// is now a deliberate difference rather than an accident.
public func startPhrase(daysAgo: Int, weekday: String) -> String {
    if daysAgo <= 0 { return "Today" }
    if daysAgo == 1 { return "Yesterday" }
    if daysAgo < 7 { return "Last \(weekday)" }
    if daysAgo < 14 { return "Last week" }
    if daysAgo < 60 { return "\(Int((Double(daysAgo) / 7.0).rounded())) weeks ago" }
    return "\(Int((Double(daysAgo) / 30.0).rounded())) months ago"
}
