import Foundation

/// The twin of `src/core/infer.ts`, held to it particle by particle by
/// `fixtures/calibration.json` and `fixtures/record.json`; the TypeScript's
/// comments say what each part is for.

/// What the cook reports about the yolk: the yolk they got, in the slider's
/// five words.
public enum YolkWord: String, Sendable, Codable, CaseIterable {
    case runny
    case soft
    case jammy
    case fudgy
    case hard

    /// The TypeScript's `yolkWordIndex`.
    public var index: Int {
        switch self {
        case .runny: return 0
        case .soft: return 1
        case .jammy: return 2
        case .fudgy: return 3
        case .hard: return 4
        }
    }
}

public enum WhiteReport: String, Sendable, Codable {
    case runny
    case tender
    case firm
}

public struct Particle: Sendable, Codable, Equatable {
    public var alphaM2s: Double
    public var logDoseOffset: Double
    public var noise: Double
    public var whiteOffset: Double
    public var whiteFirmGap: Double

    public init(
        alphaM2s: Double, logDoseOffset: Double,
        noise: Double, whiteOffset: Double, whiteFirmGap: Double
    ) {
        self.alphaM2s = alphaM2s
        self.logDoseOffset = logDoseOffset
        self.noise = noise
        self.whiteOffset = whiteOffset
        self.whiteFirmGap = whiteFirmGap
    }

    enum CodingKeys: String, CodingKey {
        case alphaM2s = "alpha_m2s", logDoseOffset, noise, whiteOffset, whiteFirmGap
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

func withUnrelated(_ p: Double) -> Double {
    (1.0 - unrelated) * p + unrelated / 3.0
}

func withUnrelatedWord(_ p: Double) -> Double {
    (1.0 - unrelated) * p + unrelated / 5.0
}

// MARK: - Deterministic RNG, so calibration is reproducible and portable

/// xorshift32, written to match the TypeScript BIT FOR BIT.
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

private func gaussian(_ state: Int32) -> (value: Double, state: Int32) {
    let s1 = nextUniform(state)
    let s2 = nextUniform(s1)
    let u1 = max(toUnit(s1), 1e-12)
    let u2 = toUnit(s2)
    return (sqrt(-2.0 * log(u1)) * cos(2.0 * Double.pi * u2), s2)
}

// MARK: - The population

/// A lognormal spread: its median, and the sd of its natural log.
public struct LogNormal: Sendable, Codable, Equatable {
    public var median: Double
    public var logSd: Double
    public init(median: Double, logSd: Double) {
        self.median = median
        self.logSd = logSd
    }
}

/// A normal spread.
public struct Normal: Sendable, Codable, Equatable {
    public var mean: Double
    public var sd: Double
    public init(mean: Double, sd: Double) {
        self.mean = mean
        self.sd = sd
    }
}

/// What a new cook's prior is drawn from: one spread per particle dimension.
public struct Population: Sendable, Equatable, Codable {
    public var id: String
    public var alphaM2s: LogNormal
    public var logDoseOffset: Normal
    public var noise: LogNormal
    public var whiteOffset: Normal
    public var whiteFirmGap: LogNormal

    public init(
        id: String, alphaM2s: LogNormal, logDoseOffset: Normal,
        noise: LogNormal, whiteOffset: Normal, whiteFirmGap: LogNormal
    ) {
        self.id = id
        self.alphaM2s = alphaM2s
        self.logDoseOffset = logDoseOffset
        self.noise = noise
        self.whiteOffset = whiteOffset
        self.whiteFirmGap = whiteFirmGap
    }

    enum CodingKeys: String, CodingKey {
        case id, alphaM2s = "alpha_m2s", logDoseOffset, noise, whiteOffset, whiteFirmGap
    }
}

// MARK: - Prior

public func createPrior(count: Int, seed: Int32, population pop: Population = literaturePopulation) -> Posterior {
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
        particles.append(Particle(
            alphaM2s: pop.alphaM2s.median * exp(pop.alphaM2s.logSd * a.value),
            logDoseOffset: pop.logDoseOffset.mean + pop.logDoseOffset.sd * b.value,
            noise: pop.noise.median * exp(pop.noise.logSd * c.value),
            whiteOffset: pop.whiteOffset.mean + pop.whiteOffset.sd * d.value,
            whiteFirmGap: pop.whiteFirmGap.median * exp(pop.whiteFirmGap.logSd * e.value)
        ))
    }
    return Posterior(particles: particles, weights: weights, rng: state)
}

// MARK: - The likelihood

func yolkProbit(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ logNominalTarget: Double
) -> [Double] {
    let latent = lookupLogYolkDose(grid, p.alphaM2s, cookTimeS) - (logNominalTarget + p.logDoseOffset)
    let soft = normalCdf((-feedbackBand - latent) / p.noise)
    let firm = normalCdf((latent - feedbackBand) / p.noise)
    let right = 1.0 - soft - firm
    return [soft, right > 0.0 ? right : 0.0, firm]
}

func yolkWordProbit(_ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double) -> [Double] {
    yolkWordBands(lookupLogYolkDose(grid, p.alphaM2s, cookTimeS) - p.logDoseOffset, p.noise)
}

func yolkWordBands(_ latent: Double, _ noise: Double) -> [Double] {
    var out = [Double](repeating: 0.0, count: 5)
    var below = 0.0
    for k in 0..<4 {
        let upTo = normalCdf((yolkWordCuts[k] - latent) / noise)
        let pk = upTo - below
        out[k] = pk > 0.0 ? pk : 0.0
        below = upTo
    }
    out[4] = normalCdf((latent - yolkWordCuts[3]) / noise)
    return out
}

func yolkWordProbabilities(_ post: Posterior, _ grid: DoseGrid, _ cookTimeS: Double) -> [Double] {
    var out = [Double](repeating: 0.0, count: 5)
    var total = 0.0
    for i in 0..<post.particles.count {
        let probs = yolkWordProbit(grid, post.particles[i], cookTimeS)
        let w = post.weights[i]
        for k in 0..<5 { out[k] += w * withUnrelatedWord(probs[k]) }
        total += w
    }
    for k in 0..<5 { out[k] = total <= 0.0 ? 1.0 / 5.0 : out[k] / total }
    return out
}

func whiteProbit(_ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double) -> [Double] {
    let latent = lookupLogWhiteDose(grid, p.alphaM2s, cookTimeS) - (logWhiteTarget + p.whiteOffset)
    let sd = p.noise * whiteNoisePerYolk
    let runny = normalCdf(-latent / sd)
    let firm = normalCdf((latent - p.whiteFirmGap) / sd)
    let tender = 1.0 - runny - firm
    return [runny, tender > 0.0 ? tender : 0.0, firm]
}

// MARK: - The thermometer

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

public func probeLikelihood(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double, _ readingC: Double
) -> Double {
    let predicted = lookupPeakYolkC(grid, p.alphaM2s, cookTimeS)
    return (1.0 - probeUnrelated) * probeShortfallDensity(predicted - readingC)
        + probeUnrelated / probeUnrelatedSpanC
}

public func answerLikelihood(
    _ grid: DoseGrid, _ p: Particle, _ cookTimeS: Double,
    yolkWord: YolkWord?, white: WhiteReport?, probeC: Double? = nil
) -> Double {
    var l = 1.0
    if let probeC { l *= probeLikelihood(grid, p, cookTimeS, probeC) }
    if let yolkWord {
        let probs = yolkWordProbit(grid, p, cookTimeS)
        l *= withUnrelatedWord(probs[yolkWord.index])
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

public func updatePosterior(
    _ post: inout Posterior, grid: DoseGrid,
    cookTimeS: Double, yolkWord: YolkWord?, white: WhiteReport?, probeC: Double? = nil
) {
    if white == nil && probeC == nil && yolkWord == nil { return }
    let n = post.particles.count
    var total = 0.0
    for i in 0..<n {
        post.weights[i] *= answerLikelihood(
            grid, post.particles[i], cookTimeS, yolkWord: yolkWord, white: white, probeC: probeC
        )
        total += post.weights[i]
    }
    if total <= 0.0 {
        for i in 0..<n { post.weights[i] = 1.0 / Double(n) }
        return
    }
    for i in 0..<n { post.weights[i] /= total }
    if effectiveSampleSize(post) < Double(n) / 2.0 { resample(&post) }
}

private func kernelCoords(_ p: Particle) -> [Double] {
    [log(p.alphaM2s), p.logDoseOffset, log(p.noise), p.whiteOffset, log(p.whiteFirmGap)]
}

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

/// The same five normal draws per particle, in the same order, as the
/// TypeScript.
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
            alphaM2s: exp(y[0]), logDoseOffset: y[1],
            noise: exp(y[2]), whiteOffset: y[3], whiteFirmGap: exp(y[4])
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
    for i in 0..<post.particles.count {
        alpha += post.weights[i] * post.particles[i].alphaM2s
    }
    return ModelParams(alphaM2s: alpha)
}

public func posteriorMeanWhiteOffset(_ post: Posterior) -> Double {
    var v = 0.0
    for i in 0..<post.particles.count {
        v += post.weights[i] * post.particles[i].whiteOffset
    }
    return v
}

public struct CookTimePrediction: Sendable, Codable {
    public let medianS: Double
    public let lowS: Double
    public let highS: Double

    enum CodingKeys: String, CodingKey {
        case medianS = "median_s", lowS = "low_s", highS = "high_s"
    }
}

public func predictCookTime(
    _ post: Posterior, _ grid: DoseGrid, _ logNominalTarget: Double,
    lowQ: Double = 0.1, highQ: Double = 0.9
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
        lowS: weightedQuantile(order, times, post.weights, lowQ),
        highS: weightedQuantile(order, times, post.weights, highQ)
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
