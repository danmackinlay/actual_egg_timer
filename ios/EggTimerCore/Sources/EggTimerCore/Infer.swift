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
/// TWO CHANNELS. The yolk answer ("too soft / just right / too hard") is scored
/// against the yolk dose the user asked for; the white answer ("runny / set") is
/// scored against the fixed `whiteDoseTarget`. They are two observations of two
/// different quantities, sampled at two different radii - the yolk at the centre,
/// the white at `yolkRadiusFrac` - so they respond differently to alpha and are
/// not redundant. The white was computed for every grid cell and thrown away
/// until September 2026; see the caveat below for what it costs to read it.
///
/// IDENTIFIABILITY - stated honestly:
///  - Ordinal feedback is worth 1-2 bits per egg. The posterior on alpha
///    plateaus around 3%: repeated "just right" answers are consistent with a
///    range, so learning correctly stops rather than falsely converging.
///  - alpha and the taste offset are confounded at a fixed protocol IN THE YOLK
///    CHANNEL: the offset is free to absorb any shift in alpha, so only the
///    combination is identified. Separating them needs variation - different egg
///    sizes or cooling methods - or an observable the offset cannot absorb.
///  - The white channel is meant to be that observable. `logDoseOffset` is
///    defined on the yolk axis only, so scoring the white against its fixed
///    target constrains alpha with no free parameter in the way. Whether this
///    breaks the confound in practice is an empirical question that wants real
///    eggs: it is the reason for the channel, not a measured result.
///  - CAVEAT, and it is not small. The white is sampled much nearer the surface
///    than the yolk centre, so it is the more sensitive of the two to error in
///    H_EFF - which README 11.2 records as about twice the only published
///    measurement. A white answer therefore partly measures that error and
///    attributes it to alpha. The channel is down-weighted for exactly this
///    reason (see `pWhiteAgree`); down-weighting bounds the damage rather than
///    removing it.
///  - tauAirScale is only identifiable if the user actually varies the cooling
///    protocol. Otherwise it stays at its prior, which is correct behaviour.

/// What the user reports about the YOLK after eating the egg.
public enum Feedback: Int, Sendable, Codable {
    case tooSoft = -1
    case justRight = 0
    case tooHard = 1
}

/// What the user reports about the WHITE, when asked.
///
/// Two answers and not three, because the white's criterion is a THRESHOLD and
/// not a band: `whiteDoseTarget` is the dose at which the innermost white has
/// set, and the model carries no ceiling above which a white is overdone. A third
/// "rubbery" answer would need such a ceiling, and inventing one would put an
/// unmeasured constant into the likelihood, so the question stops at the
/// distinction the model can actually score.
///
/// There is deliberately NO per-user offset on this channel, and that is the
/// point of it. "Runny or set" is a statement about the egg rather than about
/// anyone's taste, so the white is scored against the fixed target with no free
/// parameter to absorb the discrepancy - which is what lets it say something
/// about alpha that the yolk channel cannot.
public enum WhiteReport: String, Sendable, Codable {
    case runny
    case set
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

/// Half-width of the zone around the white's threshold in which either answer is
/// plausible, log10 dose units.
///
/// This is the same 1.3 C of peak temperature as `feedbackBand`, converted
/// through Z_WHITE instead of Z_YOLK: 0.28 * 4.65 / 4.97 = 0.262. Matched in
/// degrees rather than in decades, because degrees are what a person is judging.
/// Two effects argue in opposite directions about tuning it further - "runny or
/// set" is a sharper distinction than a yolk doneness gradation, which would
/// narrow it, while `whiteDoseTarget`'s own position is calibrated rather than
/// measured, which would widen it - so it is left at the temperature-matched
/// value rather than nudged to a preference.
public let whiteFeedbackBand = 0.26

/// log10 of the dose at which the innermost white is set. The white has one
/// target for everybody, unlike the yolk, whose target moves with the slider and
/// then again with the user's own taste.
private let logWhiteTarget = log10(whiteDoseTarget)

/// The white answer is binary, so these are a proper pair over the two answers
/// rather than the yolk's three-way split.
///
/// The contrast is deliberately far weaker than the yolk's 0.8 / 0.1: a likelihood
/// ratio of 1.9 against the yolk's 8, so one white answer carries about a third of
/// the evidence of one yolk answer. That discount is the H_EFF caveat in the
/// header made arithmetic - the white is the channel more likely to be measuring
/// the wrong thing, so it is allowed to move the posterior more slowly. The size
/// of the discount is a judgement, not a measurement.
private let pWhiteAgree = 0.65
private let pWhiteDisagree = 0.35
/// A particle whose predicted white sits inside the band predicts neither answer,
/// and scores the average of the two - exactly the likelihood of a particle that
/// calls the answer a coin flip. So hedging cannot beat being right and cannot be
/// beaten by being wrong. Scoring it as agreement instead would make the filter
/// quietly prefer particles sitting on the boundary, which is a preference nobody
/// has a reason to hold.
private let pWhiteEither = 0.5

/// How much doubt is worth a second question.
///
/// 0.1 was a judgement, and it was too high. The argument for it - that a model
/// sure of the answer cannot learn from it - is exactly true at P = 0 and P = 1
/// and not before. Folding a "runny" report the gate would have suppressed,
/// against a fresh prior, 68 g, hot start, ice:
///
///     level  P(runny)   alpha if "runny"   if "set"
///      0.22   0.12950            -1.699%    +1.081%
///      0.41   0.02300            -0.446%    +0.247%
///      0.50   0.00750            -0.163%    +0.089%
///      0.62   0.00000            -0.000%    -0.000%
///
/// 0.02 keeps the question while an answer can still move alpha by about 0.4%,
/// a fifth of the ~2% the posterior can resolve, and drops it below that. The
/// cost: the default jammy position sits inside the gate, so the common path is
/// two questions. See src/core/infer.ts for the full table.
public let whiteAskMinP = 0.02

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

/// What this particle predicts the user would have said about the YOLK.
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

/// Fold in one YOLK observation: the user cooked for `cookTimeS` aiming at a
/// nominal yolk dose of 10^`logNominalTarget`, and reported `feedback`. Reweights,
/// then resamples with jitter if the particle set has degenerated.
///
/// What the user said about the white, if they were asked, goes in separately
/// through `updateWhite` - it is scored against a different target at a different
/// radius, and it arrives at a different moment.
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

// MARK: - The white channel

/// What this particle predicts the user would have said about the WHITE, or
/// `either` when its predicted dose sits close enough to the threshold that both
/// answers are consistent with it.
private enum WhitePrediction {
    case runny
    case set
    case either
}

private func predictedWhite(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double
) -> WhitePrediction {
    let delivered = lookupLogWhiteDose(grid, p.alphaM2s, cookTimeS)
    if delivered < logWhiteTarget - whiteFeedbackBand { return .runny }
    if delivered > logWhiteTarget + whiteFeedbackBand { return .set }
    return .either
}

/// Fold in one answer about the white of the egg cooked for `cookTimeS`.
///
/// A second fold rather than a sixth argument to `updatePosterior`, because the
/// two answers arrive at two different moments: the yolk answer is folded the
/// instant it is given, and the white is only asked about afterwards, once the
/// model has decided the answer would move something. Folding them jointly would
/// mean holding the yolk answer unrecorded until the second tap, and then an egg
/// abandoned between the two taps would teach nothing at all.
///
/// Statistically they are one observation each of two different quantities, so
/// folding them in sequence multiplies the same two likelihoods; the only
/// difference is that a resample may fall between them, which is what this filter
/// does between eggs in any case.
public func updateWhite(
    _ post: inout Posterior, grid: DoseGrid, cookTimeS: Double, white: WhiteReport
) {
    let n = post.particles.count
    var total = 0.0
    for i in 0..<n {
        let p: Double
        switch predictedWhite(grid, post.particles[i], cookTimeS) {
        case .either: p = pWhiteEither
        case .runny: p = white == .runny ? pWhiteAgree : pWhiteDisagree
        case .set: p = white == .set ? pWhiteAgree : pWhiteDisagree
        }
        post.weights[i] *= p
        total += post.weights[i]
    }
    if total <= 0.0 {
        // Cannot happen from this channel alone, since the smallest factor above
        // is 0.35 - but the guard matches `updatePosterior`, because what must
        // never happen here is a NaN weight reaching a solve.
        for i in 0..<n { post.weights[i] = 1.0 / Double(n) }
        return
    }
    for i in 0..<n { post.weights[i] /= total }
    if effectiveSampleSize(post) < Double(n) / 2.0 { resample(&post) }
}

/// Posterior predictive probability that this cook's white came out runny. A
/// particle inside the band counts a half, which is the same coin flip that
/// `pWhiteEither` scores it at.
public func whiteRunnyProbability(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double
) -> Double {
    var p = 0.0
    var total = 0.0
    for i in 0..<post.particles.count {
        let share: Double
        switch predictedWhite(grid, post.particles[i], cookTimeS) {
        case .runny: share = 1.0
        case .either: share = 0.5
        case .set: share = 0.0
        }
        p += post.weights[i] * share
        total += post.weights[i]
    }
    return total <= 0.0 ? 0.0 : p / total
}

/// Whether asking about the white can teach anything about this egg.
///
/// The question is worth asking exactly when the particles DISAGREE about the
/// answer, and that is not a heuristic. If every particle predicts the same thing,
/// then whichever answer comes back multiplies every weight by the same factor,
/// and normalising restores the posterior unchanged: a unanimous model learns
/// nothing from either answer, so asking would spend a tap for nothing. Two taps
/// at breakfast is a real cost, so the second question appears only when there is
/// something behind it.
///
/// THIS DOES NOT BIAS THE POSTERIOR, which is the non-obvious part and the reason
/// it is spelled out here. The decision reads only the posterior, the grid and the
/// cook time - all of them known before the answer exists - so the probability of
/// having asked is the same for every particle and cancels in the normalisation.
/// Deciding from the answer itself, or from anything that depends on it, would not
/// be safe: it would make the likelihood conditional on the selection, and the
/// filter has no term for that.
public func shouldAskAboutWhite(
    _ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double
) -> Bool {
    let p = whiteRunnyProbability(post, grid, cookTimeS)
    return p >= whiteAskMinP && p <= 1.0 - whiteAskMinP
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
