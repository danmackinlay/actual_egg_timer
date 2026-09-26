import Foundation

/// Sequential Bayesian calibration from ordinal feedback.
///
/// The model's constants are literature-derived, and the carryover term has no
/// published measurement behind it at all. Rather than guess better, make the
/// uncertainty explicit and let the cook's own eggs resolve it: after each cook
/// they may say how the yolk was ("too soft", "just right", "too firm") and how
/// the white was ("runny", "tender", "firm"), and we update a posterior.
///
/// METHOD: sequential Monte Carlo (a particle filter), NOT variational
/// inference. There are six uncertain scalars here and a cached forward model,
/// so particles give the exact posterior predictive with none of the machinery.
///
/// THE LIKELIHOOD (E2, INFERENCE.md section 3) is an ordered probit. For the
/// yolk, the latent quantity is the delivered log10 dose minus the one the cook
/// wanted; the answer says which side of two cutpoints, at -+`feedbackBand`, it
/// fell, seen through a Gaussian whose sd is the cook's own `noise`. A small
/// `unrelated` share of every answer is uniform over the answers - what the
/// fixed 0.8 / 0.1 of the first filter was standing in for.
///
/// TWO CHANNELS. The white is judged at `yolkRadiusFrac` against two cutpoints
/// of its own: runny | tender at `whiteDoseTarget` shifted by the particle's
/// `whiteOffset`, and tender | firm a learned `whiteFirmGap` above that. On one
/// phone the white offset is the white's lag and the cook's idea of "runny"
/// together (INFERENCE.md section 2).
///
/// This file is a port of src/core/infer.ts, which is the reference and says
/// more; fixtures/calibration.json and fixtures/record.json hold the two
/// together particle by particle.

/// What the cook reports about the YOLK after eating the egg.
public enum Feedback: Int, Sendable, Codable {
    case tooSoft = -1
    case justRight = 0
    case tooHard = 1
}

/// What the cook reports about the WHITE. Three answers since E2. `set` is the
/// two-level answer E1 logged ("set right through"), kept so every egg logged
/// then still loads: it means tender or firm, and is scored as exactly that. No
/// app offers it any more.
public enum WhiteReport: String, Sendable, Codable {
    case runny
    case tender
    case firm
    case set
}

public struct Particle: Sendable, Codable, Equatable {
    public var alphaM2s: Double
    /// The cook's taste relative to the nominal doneness scale, in log10 dose
    /// units. Stored as an OFFSET rather than an absolute target so it carries
    /// across different slider positions.
    public var logDoseOffset: Double
    public var tauAirScale: Double
    /// The sd of the Gaussian every yolk answer is seen through, log10 yolk dose.
    public var noise: Double
    /// Additive shift on the white's runny | tender cutpoint, log10 white dose.
    public var whiteOffset: Double
    /// How far the tender | firm cutpoint sits above the runny | tender one.
    public var whiteFirmGap: Double

    public init(
        alphaM2s: Double, logDoseOffset: Double, tauAirScale: Double,
        noise: Double, whiteOffset: Double, whiteFirmGap: Double
    ) {
        self.alphaM2s = alphaM2s
        self.logDoseOffset = logDoseOffset
        self.tauAirScale = tauAirScale
        self.noise = noise
        self.whiteOffset = whiteOffset
        self.whiteFirmGap = whiteFirmGap
    }
}

public struct Posterior: Sendable, Codable {
    public var particles: [Particle]
    public var weights: [Double]
    public var rng: Int32

    public init(particles: [Particle], weights: [Double], rng: Int32) {
        self.particles = particles
        self.weights = weights
        self.rng = rng
    }
}

/// Half-width of the "just right" band, log10 dose units: the yolk's two
/// cutpoints sit at -+ this.
public let feedbackBand = 0.28

/// The share of answers that have nothing to do with the egg, spread evenly
/// over the answers. No likelihood falls below `unrelated / 3`.
public let unrelated = 0.05

/// The noise scale's prior: lognormal, median `noiseMedian` decades of yolk
/// dose. 0.20 gives "just right" 0.81 at the band's centre and 0.093 one
/// band-width out, where the likelihood it replaces gave 0.8 and 0.1. See
/// src/core/infer.ts for the arithmetic and what it costs.
public let noiseMedian = 0.2
public let noiseLogSd = 0.5

/// The white offset's prior sd, decades of white dose (PLAN.md E3).
public let whiteOffsetSd = 0.5

/// The tender | firm cutpoint's prior: lognormal, median 1.08 decades above the
/// runny | tender one - midway between the reference egg's inner-white dose at
/// Soft and at Jammy (README section 4). See src/core/infer.ts.
public let whiteFirmGapMedian = 1.08
public let whiteFirmGapLogSd = 0.4

/// log10 of the dose at which the innermost white is set: the runny | tender
/// cutpoint before any offset.
private let logWhiteTarget = log10(whiteDoseTarget)

/// The white's noise from the yolk's: the same degrees of peak temperature.
private let whiteNoisePerYolk = Constants.zYolk / Constants.zWhite

private let priorOffsetSd = 0.22
/// Deliberately wide: this is the least-verified part of the model.
private let priorTauAirLogSd = 0.35

// MARK: - Deterministic RNG, so calibration is reproducible and portable

/// xorshift32, written to match the reference implementation BIT FOR BIT.
///
/// The TypeScript is written in terms of JavaScript's 32-bit integer operators:
/// `<<` and `^` coerce to a signed 32-bit int, and `>>>` is the UNSIGNED right
/// shift. Swift's fixed-width shifts discard overflow rather than trapping, so
/// doing the arithmetic in `UInt32` and reinterpreting the bits reproduces it
/// exactly. Get this wrong and nothing fails loudly - the filter simply draws a
/// different, equally plausible prior, and the two implementations quietly stop
/// being the same model.
private func nextUniform(_ state: Int32) -> Int32 {
    var x = UInt32(bitPattern: state)
    x ^= x << 13
    x ^= x >> 17
    x ^= x << 5
    return Int32(bitPattern: x)
}

private func toUnit(_ state: Int32) -> Double {
    Double(UInt32(bitPattern: state) % 16_777_216) / 16_777_216.0
}

/// Box-Muller, returning one normal deviate and the advanced state.
private func gaussian(_ state: Int32) -> (value: Double, state: Int32) {
    let s1 = nextUniform(state)
    let s2 = nextUniform(s1)
    let u1 = max(toUnit(s1), 1e-12)
    let u2 = toUnit(s2)
    return (sqrt(-2.0 * log(u1)) * cos(2.0 * Double.pi * u2), s2)
}

// MARK: - Prior

/// Six draws per particle, always in this order, in the prior and in every
/// resample: alpha, taste offset, tauAirScale, noise, white offset, firm gap.
public func createPrior(count: Int, seed: Int32) -> Posterior {
    var particles = [Particle]()
    particles.reserveCapacity(count)
    let weights = [Double](repeating: 1.0 / Double(count), count: count)
    var state = seed
    if state == 0 { state = 1 }
    for _ in 0..<count {
        let a = gaussian(state); state = a.state
        let b = gaussian(state); state = b.state
        let c = gaussian(state); state = c.state
        let d = gaussian(state); state = d.state
        let e = gaussian(state); state = e.state
        let f = gaussian(state); state = f.state
        particles.append(Particle(
            alphaM2s: Constants.alphaDefault * exp(Constants.alphaRelSD * a.value),
            logDoseOffset: priorOffsetSd * b.value,
            tauAirScale: exp(priorTauAirLogSd * c.value),
            noise: noiseMedian * exp(noiseLogSd * d.value),
            whiteOffset: whiteOffsetSd * e.value,
            whiteFirmGap: whiteFirmGapMedian * exp(whiteFirmGapLogSd * f.value)
        ))
    }
    return Posterior(particles: particles, weights: weights, rng: state)
}

// MARK: - The likelihood

/// The standard normal CDF, from the core's own erfc - the one both languages
/// already share - rather than the platform's.
private func normalCdf(_ x: Double) -> Double {
    0.5 * Sphere.complementaryError(-x / 2.0.squareRoot())
}

/// Too soft, just right, too firm, for one particle, before the unrelated share.
private func yolkProbit(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ logNominalTarget: Double
) -> [Double] {
    let latent = lookupLogYolkDose(grid, p.alphaM2s, cookTimeS) - (logNominalTarget + p.logDoseOffset)
    let soft = normalCdf((-feedbackBand - latent) / p.noise)
    let firm = normalCdf((latent - feedbackBand) / p.noise)
    let right = 1.0 - soft - firm
    return [soft, right > 0.0 ? right : 0.0, firm]
}

/// Runny, tender, firm, for one particle, before the unrelated share.
private func whiteProbit(_ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double) -> [Double] {
    let latent = lookupLogWhiteDose(grid, p.alphaM2s, cookTimeS) - (logWhiteTarget + p.whiteOffset)
    let sd = p.noise * whiteNoisePerYolk
    let runny = normalCdf(-latent / sd)
    let firm = normalCdf((latent - p.whiteFirmGap) / sd)
    let tender = 1.0 - runny - firm
    return [runny, tender > 0.0 ? tender : 0.0, firm]
}

// MARK: - The thermometer (E4)

/// A reading at the centre's peak is the peak plus the thermometer's error
/// (Gaussian) minus a handling error (exponential) that reads COLD, because at
/// the peak the centre is the warmest point in space and time. See
/// src/core/infer.ts for the argument and the numbers.
public let probeInstrumentSdC = 1.0
public let probeHandlingMeanC = 0.4
public let probeUnrelated = 0.02
public let probeUnrelatedSpanC = 60.0

/// The density of `predicted - reading`: an exponentially modified Gaussian,
/// with the erfc inside the exponent so a reading far over the peak is a small
/// number rather than infinity times zero.
public func probeShortfallDensity(_ shortfallC: Double) -> Double {
    let sigma = probeInstrumentSdC
    let rate = 1.0 / probeHandlingMeanC
    let tail = Sphere.complementaryError(
        (rate * sigma * sigma - shortfallC) / (2.0.squareRoot() * sigma)
    )
    if !(tail > 0.0) { return 0.0 }
    return 0.5 * rate
        * exp(0.5 * rate * rate * sigma * sigma - rate * shortfallC + log(tail))
}

/// The likelihood of a probe reading under one particle, against its own peak.
public func probeLikelihood(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ readingC: Double
) -> Double {
    let predicted = lookupPeakYolkC(grid, p.alphaM2s, cookTimeS)
    return (1.0 - probeUnrelated) * probeShortfallDensity(predicted - readingC)
        + probeUnrelated / probeUnrelatedSpanC
}

/// The likelihood of one egg's answers under one particle: the product of the
/// yolk's, the white's and the thermometer's, any of which may be missing.
public func answerLikelihood(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ logNominalTarget: Double,
    yolk: Feedback?, white: WhiteReport?, probeC: Double? = nil
) -> Double {
    var l = 1.0
    if let probeC { l *= probeLikelihood(grid, p, cookTimeS, probeC) }
    if let yolk {
        let probs = yolkProbit(grid, p, cookTimeS, logNominalTarget)
        l *= (1.0 - unrelated) * probs[yolk.rawValue + 1] + unrelated / 3.0
    }
    if let white {
        let probs = whiteProbit(grid, p, cookTimeS)
        switch white {
        case .set:
            l *= (1.0 - unrelated) * (probs[1] + probs[2]) + 2.0 * unrelated / 3.0
        case .runny:
            l *= (1.0 - unrelated) * probs[0] + unrelated / 3.0
        case .tender:
            l *= (1.0 - unrelated) * probs[1] + unrelated / 3.0
        case .firm:
            l *= (1.0 - unrelated) * probs[2] + unrelated / 3.0
        }
    }
    return l
}

public func effectiveSampleSize(_ post: Posterior) -> Double {
    var s = 0.0
    for i in 0..<post.weights.count { s += post.weights[i] * post.weights[i] }
    return s <= 0.0 ? 0.0 : 1.0 / s
}

/// Fold in one egg, both of its answers and a probe reading, any of which may
/// be nil. ONE fold per egg: the posterior depends on what was said, not on the
/// order it was tapped in. See src/core/infer.ts.
public func updatePosterior(
    _ post: inout Posterior, grid: DoseGrid,
    cookTimeS: Double, logNominalTarget: Double, yolk: Feedback?, white: WhiteReport?,
    probeC: Double? = nil
) {
    if yolk == nil && white == nil && probeC == nil { return }
    let n = post.particles.count
    var total = 0.0
    for i in 0..<n {
        post.weights[i] *= answerLikelihood(
            grid, post.particles[i], cookTimeS, logNominalTarget, yolk: yolk, white: white,
            probeC: probeC
        )
        total += post.weights[i]
    }
    if total <= 0.0 {
        // Cannot happen - the unrelated share keeps every factor above zero -
        // but a NaN weight must never reach a solve.
        for i in 0..<n { post.weights[i] = 1.0 / Double(n) }
        return
    }
    for i in 0..<n { post.weights[i] /= total }
    if effectiveSampleSize(post) < Double(n) / 2.0 { resample(&post) }
}

// MARK: - The predictive

/// Posterior predictive probabilities of too soft, just right and too firm.
public func yolkAnswerProbabilities(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double, _ logNominalTarget: Double
) -> [Double] {
    var out = [0.0, 0.0, 0.0]
    var total = 0.0
    for i in 0..<post.particles.count {
        let probs = yolkProbit(grid, post.particles[i], cookTimeS, logNominalTarget)
        let w = post.weights[i]
        for k in 0..<3 { out[k] += w * ((1.0 - unrelated) * probs[k] + unrelated / 3.0) }
        total += w
    }
    for k in 0..<3 { out[k] = total <= 0.0 ? 1.0 / 3.0 : out[k] / total }
    return out
}

/// Posterior predictive probabilities of runny, tender and firm.
public func whiteAnswerProbabilities(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double
) -> [Double] {
    var out = [0.0, 0.0, 0.0]
    var total = 0.0
    for i in 0..<post.particles.count {
        let probs = whiteProbit(grid, post.particles[i], cookTimeS)
        let w = post.weights[i]
        for k in 0..<3 { out[k] += w * ((1.0 - unrelated) * probs[k] + unrelated / 3.0) }
        total += w
    }
    for k in 0..<3 { out[k] = total <= 0.0 ? 1.0 / 3.0 : out[k] / total }
    return out
}

/// Systematic resampling - lower variance than multinomial and O(n) - followed
/// by a small jitter so the set does not collapse to duplicates.
private func resample(_ post: inout Posterior) {
    let n = post.particles.count
    var cumulative = [Double](repeating: 0.0, count: n)
    var acc = 0.0
    for i in 0..<n { acc += post.weights[i]; cumulative[i] = acc }

    var state = nextUniform(post.rng)
    let start = toUnit(state) / Double(n)
    var picked = [Particle]()
    picked.reserveCapacity(n)
    var j = 0
    for i in 0..<n {
        let u = start + Double(i) / Double(n)
        while j < n - 1 && cumulative[j] < u { j += 1 }
        picked.append(post.particles[j])
    }
    for i in 0..<n {
        let a = gaussian(state); state = a.state
        let b = gaussian(state); state = b.state
        let c = gaussian(state); state = c.state
        let d = gaussian(state); state = d.state
        let e = gaussian(state); state = e.state
        let f = gaussian(state); state = f.state
        let q = picked[i]
        post.particles[i] = Particle(
            alphaM2s: q.alphaM2s * exp(0.02 * a.value),
            logDoseOffset: q.logDoseOffset + 0.015 * b.value,
            tauAirScale: q.tauAirScale * exp(0.03 * c.value),
            noise: q.noise * exp(0.03 * d.value),
            whiteOffset: q.whiteOffset + 0.015 * e.value,
            whiteFirmGap: q.whiteFirmGap * exp(0.03 * f.value)
        )
        post.weights[i] = 1.0 / Double(n)
    }
    post.rng = state
}

// MARK: - Readout

public func posteriorParams(_ post: Posterior) -> ModelParams {
    var alpha = 0.0
    var tauAir = 0.0
    for i in 0..<post.particles.count {
        alpha += post.weights[i] * post.particles[i].alphaM2s
        tauAir += post.weights[i] * post.particles[i].tauAirScale
    }
    return ModelParams(alphaM2s: alpha, tauAirScale: tauAir)
}

public func posteriorMeanOffset(_ post: Posterior) -> Double {
    var v = 0.0
    for i in 0..<post.particles.count {
        v += post.weights[i] * post.particles[i].logDoseOffset
    }
    return v
}

/// The posterior mean of the white offset: where the runny | tender cutpoint
/// now sits, in decades above `whiteDoseTarget`.
public func posteriorMeanWhiteOffset(_ post: Posterior) -> Double {
    var v = 0.0
    for i in 0..<post.particles.count {
        v += post.weights[i] * post.particles[i].whiteOffset
    }
    return v
}

/// Standard deviation of alpha, as a fraction of its mean - the honest measure
/// of how much the cook's eggs have actually taught us.
public func posteriorAlphaRelSd(_ post: Posterior) -> Double {
    let mean = posteriorParams(post).alphaM2s
    var v = 0.0
    for i in 0..<post.particles.count {
        let d = post.particles[i].alphaM2s - mean
        v += post.weights[i] * d * d
    }
    return sqrt(v) / mean
}

public struct CookTimePrediction: Sendable {
    public let medianS: Double
    public let lowS: Double
    public let highS: Double
}

/// Posterior predictive cook time for a nominal doneness, as a median and an
/// 80% credible interval.
public func predictCookTime(
    _ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double
) -> CookTimePrediction {
    let n = post.particles.count
    var times = [Double](repeating: 0.0, count: n)
    for i in 0..<n {
        let p = post.particles[i]
        times[i] = cookTimeForLogYolkDose(grid, p.alphaM2s, logNominalTarget + p.logDoseOffset)
    }
    // Sorted by time, ties broken by original position. JavaScript's sort is
    // required to be stable and Swift's is not, so without the tie-break two
    // particles with identical predicted times could be ordered differently and
    // the weighted quantile could step at a different particle.
    var order = Array(0..<n)
    order.sort { lhs, rhs in
        times[lhs] == times[rhs] ? lhs < rhs : times[lhs] < times[rhs]
    }
    return CookTimePrediction(
        medianS: weightedQuantile(order, times, post.weights, 0.5),
        lowS: weightedQuantile(order, times, post.weights, 0.1),
        highS: weightedQuantile(order, times, post.weights, 0.9)
    )
}

private func weightedQuantile(
    _ order: [Int], _ times: [Double], _ weights: [Double], _ q: Double
) -> Double {
    var acc = 0.0
    for index in order {
        acc += weights[index]
        if acc >= q { return times[index] }
    }
    return times[order[order.count - 1]]
}
