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

/// What the cook reports about the WHITE: three answers since E2.
public enum WhiteReport: String, Sendable, Codable {
    case runny
    case tender
    case firm
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

/// One answer's probability `p` with the unrelated share mixed in: the chance
/// the cook gives that answer, whatever the egg did.
func withUnrelated(_ p: Double) -> Double {
    (1.0 - unrelated) * p + unrelated / 3.0
}

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
let logWhiteTarget = log10(whiteDoseTarget)

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

/// Too soft, just right, too firm, for one particle, before the unrelated share.
/// Internal rather than private: the decision (Decide.swift) scores candidate
/// times with the same arithmetic the filter learns with.
func yolkProbit(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ logNominalTarget: Double
) -> [Double] {
    let latent = lookupLogYolkDose(grid, p.alphaM2s, cookTimeS) - (logNominalTarget + p.logDoseOffset)
    let soft = normalCdf((-feedbackBand - latent) / p.noise)
    let firm = normalCdf((latent - feedbackBand) / p.noise)
    let right = 1.0 - soft - firm
    return [soft, right > 0.0 ? right : 0.0, firm]
}

/// Runny, tender, firm, for one particle, before the unrelated share.
func whiteProbit(_ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double) -> [Double] {
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
        l *= withUnrelated(probs[yolk.rawValue + 1])
    }
    if let white {
        let probs = whiteProbit(grid, p, cookTimeS)
        switch white {
        case .runny:
            l *= withUnrelated(probs[0])
        case .tender:
            l *= withUnrelated(probs[1])
        case .firm:
            l *= withUnrelated(probs[2])
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
/// be nil, and resample through Liu and West's kernel if the set has
/// degenerated. ONE fold per egg: the posterior depends on what was said, not
/// on the order it was tapped in. See src/core/infer.ts.
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

/// The resample's kernel: Liu and West's shrinkage, with discount
/// `kernelDiscount`. Each resampled particle is shrunk toward the weighted mean
/// and moved by a draw from the weighted covariance, in coordinates where every
/// dimension is additive, so the posterior's mean and covariance survive the
/// resample. It replaced a fixed jitter (2% on alpha) that widened the
/// posterior at every resample; see src/core/infer.ts for what that cost.
public let kernelDiscount = 0.98
private let kernelShrink = (3.0 * kernelDiscount - 1.0) / (2.0 * kernelDiscount)
private let kernelSpread = (1.0 - kernelShrink * kernelShrink).squareRoot()
private let kernelDims = 6

private func kernelCoords(_ p: Particle) -> [Double] {
    [log(p.alphaM2s), p.logDoseOffset, log(p.tauAirScale), log(p.noise), p.whiteOffset, log(p.whiteFirmGap)]
}

/// Lower-triangular Cholesky factor; a pivot that is not positive gets a zero
/// column, as in the TypeScript.
private func cholesky(_ cov: [[Double]]) -> [[Double]] {
    var L = [[Double]](repeating: [Double](repeating: 0.0, count: kernelDims), count: kernelDims)
    for k in 0..<kernelDims {
        for l in 0...k {
            var s = cov[k][l]
            for m in 0..<l { s -= L[k][m] * L[l][m] }
            if k == l {
                L[k][k] = s > 0.0 ? s.squareRoot() : 0.0
            } else {
                L[k][l] = L[l][l] > 0.0 ? s / L[l][l] : 0.0
            }
        }
    }
    return L
}

/// Systematic resampling, then Liu and West's kernel. The same six normal draws
/// per particle, in the same order, as the TypeScript.
private func resample(_ post: inout Posterior) {
    let n = post.particles.count
    var cumulative = [Double](repeating: 0.0, count: n)
    var acc = 0.0
    for i in 0..<n { acc += post.weights[i]; cumulative[i] = acc }

    let x = post.particles.map(kernelCoords)
    var mean = [Double](repeating: 0.0, count: kernelDims)
    for i in 0..<n {
        for k in 0..<kernelDims { mean[k] += post.weights[i] * x[i][k] }
    }
    for k in 0..<kernelDims { mean[k] /= acc }
    var cov = [[Double]](repeating: [Double](repeating: 0.0, count: kernelDims), count: kernelDims)
    for i in 0..<n {
        for k in 0..<kernelDims {
            let dk = x[i][k] - mean[k]
            for l in 0...k { cov[k][l] += post.weights[i] * dk * (x[i][l] - mean[l]) }
        }
    }
    for k in 0..<kernelDims {
        for l in 0...k {
            cov[k][l] /= acc
            cov[l][k] = cov[k][l]
        }
    }
    let L = cholesky(cov)

    var state = nextUniform(post.rng)
    let start = toUnit(state) / Double(n)
    var picked = [Int](repeating: 0, count: n)
    var j = 0
    for i in 0..<n {
        let u = start + Double(i) / Double(n)
        while j < n - 1 && cumulative[j] < u { j += 1 }
        picked[i] = j
    }
    var z = [Double](repeating: 0.0, count: kernelDims)
    var y = [Double](repeating: 0.0, count: kernelDims)
    var next = [Particle]()
    next.reserveCapacity(n)
    for i in 0..<n {
        for k in 0..<kernelDims {
            let g = gaussian(state)
            state = g.state
            z[k] = g.value
        }
        let q = x[picked[i]]
        for k in 0..<kernelDims {
            var noise = 0.0
            for l in 0...k { noise += L[k][l] * z[l] }
            y[k] = kernelShrink * q[k] + (1.0 - kernelShrink) * mean[k] + kernelSpread * noise
        }
        next.append(Particle(
            alphaM2s: exp(y[0]), logDoseOffset: y[1], tauAirScale: exp(y[2]),
            noise: exp(y[3]), whiteOffset: y[4], whiteFirmGap: exp(y[5])
        ))
    }
    for i in 0..<n {
        post.particles[i] = next[i]
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

/// The posterior mean of the white offset: where the runny | tender cutpoint
/// now sits, in decades above `whiteDoseTarget`.
public func posteriorMeanWhiteOffset(_ post: Posterior) -> Double {
    var v = 0.0
    for i in 0..<post.particles.count {
        v += post.weights[i] * post.particles[i].whiteOffset
    }
    return v
}

public struct CookTimePrediction: Sendable {
    public let medianS: Double
    public let lowS: Double
    public let highS: Double
}

/// The posterior over the right cook time for a nominal doneness, as a median
/// and an 80% credible interval: for each particle, the LATER of the time its
/// yolk reaches the middle of "just right" and the time its white reaches its
/// own runny | tender cutpoint. See src/core/infer.ts.
public func predictCookTime(
    _ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double
) -> CookTimePrediction {
    let n = post.particles.count
    var times = [Double](repeating: 0.0, count: n)
    for i in 0..<n {
        let p = post.particles[i]
        let yolk = cookTimeForLogYolkDose(grid, p.alphaM2s, logNominalTarget + p.logDoseOffset)
        let white = cookTimeForLogWhiteDose(grid, p.alphaM2s, logWhiteTarget + p.whiteOffset)
        times[i] = yolk > white ? yolk : white
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
