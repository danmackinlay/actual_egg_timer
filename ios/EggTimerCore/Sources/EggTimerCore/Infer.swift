import Foundation

/// Sequential Bayesian calibration from ordinal feedback.
///
/// The model's constants are literature-derived, and the carryover term has no
/// published measurement behind it at all. Rather than guess better, make the
/// uncertainty explicit and let the user's own eggs resolve it: after each cook
/// they say "too soft", "just right" or "too hard", and we update a posterior.
///
/// METHOD: sequential Monte Carlo (a particle filter), NOT variational
/// inference. VI buys scalability in high dimensions at the cost of gradients,
/// an optimiser, and an approximation gap. There are three uncertain scalars
/// here and a cached forward model, so particles give the exact posterior
/// predictive with none of that machinery.
///
/// There is also a structural reason no approximation of the temperature FIELD
/// is needed: the modal scheme represents it as mode amplitudes whose dynamics
/// are linear, so conditional on the parameters the field is exact. All the
/// uncertainty lives in the parameters. The spread across particles is the
/// posterior over egg temperature.
///
/// IDENTIFIABILITY - stated honestly:
///  - Ordinal feedback is worth 1-2 bits per egg. The posterior on alpha
///    plateaus around 3%: repeated "just right" answers are consistent with a
///    range, so learning correctly stops rather than falsely converging.
///  - alpha and the taste offset are confounded at a fixed protocol. Separating
///    them needs variation - different egg sizes or cooling methods.
///  - tauAirScale is only identifiable if the user actually varies the cooling
///    protocol. Otherwise it stays at its prior, which is correct behaviour.

/// What the user reports after eating the egg.
public enum Feedback: Int, Sendable, Codable {
    case tooSoft = -1
    case justRight = 0
    case tooHard = 1
}

public struct Particle: Sendable, Codable, Equatable {
    public var alphaM2s: Double
    /// The user's taste relative to the nominal doneness scale, in log10 dose
    /// units. Stored as an OFFSET rather than an absolute target so it carries
    /// across different slider positions.
    public var logDoseOffset: Double
    public var tauAirScale: Double

    public init(alphaM2s: Double, logDoseOffset: Double, tauAirScale: Double) {
        self.alphaM2s = alphaM2s
        self.logDoseOffset = logDoseOffset
        self.tauAirScale = tauAirScale
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

/// Half-width of the "just right" band, log10 dose units. 0.28 decades is about
/// 1.3 C of peak yolk temperature - roughly the finest distinction anyone can
/// actually make by eating an egg.
public let feedbackBand = 0.28

/// Probability the user's report matches what the model predicts for a
/// particle. The remainder is split between the two other answers, which keeps
/// a single surprising report from killing an otherwise good particle.
private let pAgree = 0.8
private let pDisagree = 0.1

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
        particles.append(Particle(
            alphaM2s: Constants.alphaDefault * exp(Constants.alphaRelSD * a.value),
            logDoseOffset: priorOffsetSd * b.value,
            tauAirScale: exp(priorTauAirLogSd * c.value)
        ))
    }
    return Posterior(particles: particles, weights: weights, rng: state)
}

// MARK: - Update

/// What this particle predicts the user would have said.
private func predictedFeedback(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ logNominalTarget: Double
) -> Feedback {
    let delivered = lookupLogYolkDose(grid, p.alphaM2s, cookTimeS)
    let wanted = logNominalTarget + p.logDoseOffset
    if delivered < wanted - feedbackBand { return .tooSoft }
    if delivered > wanted + feedbackBand { return .tooHard }
    return .justRight
}

public func effectiveSampleSize(_ post: Posterior) -> Double {
    var s = 0.0
    for i in 0..<post.weights.count { s += post.weights[i] * post.weights[i] }
    return s <= 0.0 ? 0.0 : 1.0 / s
}

/// Fold in one observation: the user cooked for `cookTimeS` aiming at a nominal
/// yolk dose of 10^`logNominalTarget`, and reported `feedback`. Reweights, then
/// resamples with jitter if the particle set has degenerated.
public func updatePosterior(
    _ post: inout Posterior, grid: DoseGrid,
    cookTimeS: Double, logNominalTarget: Double, feedback: Feedback
) {
    let n = post.particles.count
    var total = 0.0
    for i in 0..<n {
        let pred = predictedFeedback(grid, post.particles[i], cookTimeS, logNominalTarget)
        post.weights[i] *= pred == feedback ? pAgree : pDisagree
        total += post.weights[i]
    }
    if total <= 0.0 {
        // Every particle was contradicted. Refuse to produce NaNs: fall back to
        // a uniform reweight, which keeps the prior rather than inventing a
        // posterior.
        for i in 0..<n { post.weights[i] = 1.0 / Double(n) }
        return
    }
    for i in 0..<n { post.weights[i] /= total }
    if effectiveSampleSize(post) < Double(n) / 2.0 { resample(&post) }
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
        post.particles[i] = Particle(
            alphaM2s: picked[i].alphaM2s * exp(0.02 * a.value),
            logDoseOffset: picked[i].logDoseOffset + 0.015 * b.value,
            tauAirScale: picked[i].tauAirScale * exp(0.03 * c.value)
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

/// Standard deviation of alpha, as a fraction of its mean - the honest measure
/// of how much the user's eggs have actually taught us.
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
/// 80% credible interval. Reporting the interval rather than a point is the
/// honest thing to do, and it makes calibration legible without a settings
/// screen: the interval visibly narrows as the posterior tightens.
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
