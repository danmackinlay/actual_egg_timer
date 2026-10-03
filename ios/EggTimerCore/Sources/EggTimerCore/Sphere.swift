import Foundation

/// Transient heat conduction in a sphere, solved in the eigenmode basis.
/// Transliterated from `src/core/sphere.ts` - see that file for why modes and
/// not finite differences, and for the boundary-condition caveats.
public struct SphereState: Sendable {
    public let radiusM: Double
    /// Decay rate of each mode, 1/s.
    public private(set) var lambda: [Double]
    /// Duhamel coupling of each mode to the surface drive.
    public private(set) var coef: [Double]
    /// Mode amplitudes: the actual state.
    public private(set) var amp: [Double]
    /// Current surface temperature, C.
    public private(set) var surfaceC: Double

    /// A sphere at uniform `initialC` whose surface is held at `surfaceC`.
    public init(radiusM: Double, alphaM2s: Double, initialC: Double, surfaceC: Double) {
        self.radiusM = radiusM
        self.surfaceC = surfaceC
        var lambda = [Double](repeating: 0.0, count: Constants.modeCount)
        var coef = [Double](repeating: 0.0, count: Constants.modeCount)
        var amp = [Double](repeating: 0.0, count: Constants.modeCount)
        for i in 0..<Constants.modeCount {
            let n = Double(i + 1)
            let k = n * Double.pi / radiusM
            lambda[i] = alphaM2s * k * k
            coef[i] = 2.0 * radiusM * ((i + 1) % 2 == 1 ? 1.0 : -1.0) / (n * Double.pi)
            amp[i] = coef[i] * (initialC - surfaceC)
        }
        self.lambda = lambda
        self.coef = coef
        self.amp = amp
    }

    /// Advance by `dtS`, ramping the surface linearly to `nextSurfaceC`.
    /// Exact for a linear surface ramp over the step.
    public mutating func step(dtS: Double, nextSurfaceC: Double) {
        let slope = (nextSurfaceC - surfaceC) / dtS
        for i in 0..<Constants.modeCount {
            let decay = exp(-lambda[i] * dtS)
            amp[i] = amp[i] * decay - coef[i] * slope * (1.0 - decay) / lambda[i]
        }
        surfaceC = nextSurfaceC
    }

    /// Temperature at normalised radius x = r/R, in [0, 1].
    public func temperature(atX x: Double) -> Double {
        if x < 1e-9 { return centreTemperature }
        let r = x * radiusM
        var sum = 0.0
        for i in 0..<Constants.modeCount {
            sum += amp[i] * sin(Double(i + 1) * Double.pi * r / radiusM)
        }
        return surfaceC + sum / r
    }

    /// The sin(n*pi*r/R)/r factor tends to n*pi/R at the centre.
    public var centreTemperature: Double {
        var sum = 0.0
        for i in 0..<Constants.modeCount {
            sum += Double(i + 1) * amp[i]
        }
        return surfaceC + Double.pi * sum / radiusM
    }

    /// Volume-average temperature, C: the ceiling on carryover, and the heat
    /// Newton's law at the shell draws down on the counter.
    public var meanTemperature: Double {
        var sum = 0.0
        for i in 0..<Constants.modeCount {
            sum += amp[i] * coef[i]
        }
        return surfaceC + 1.5 * sum / (radiusM * radiusM)
    }

    /// The surface temperature to step to over the next `dtS` for a sphere
    /// losing heat by Newton's law at its own surface (a Robin boundary),
    /// written as the heat balance on its mean:
    /// dTavg/dt = -(Ts - Ta)/tau - `lossC` over the step. The mean after a
    /// linear surface ramp is linear in the new surface temperature, so the
    /// balance fixes it. sphere.ts has the derivation.
    public func robinSurface(dtS: Double, ambientC: Double, tauS: Double, lossC: Double) -> Double {
        var now = 0.0
        var held = 0.0
        var gain = 0.0
        for i in 0..<Constants.modeCount {
            let decay = exp(-lambda[i] * dtS)
            now += amp[i] * coef[i]
            held += amp[i] * coef[i] * decay
            gain += coef[i] * coef[i] * (1.0 - decay) / (lambda[i] * dtS)
        }
        let w = 1.5 / (radiusM * radiusM)
        let ts = surfaceC
        let a = dtS / tauS
        let g = w * gain
        return (ts + w * now - a * (0.5 * ts - ambientC) - lossC - g * ts - w * held)
            / (1.0 - g + 0.5 * a)
    }
}

public enum Sphere {
    /// Closed form for a step change: theta/theta0 = (T - Ts)/(T0 - Ts).
    public static func seriesTheta(x: Double, fourier: Double) -> Double {
        var sum = 0.0
        for n in 1...Constants.modeCount {
            let sign = n % 2 == 1 ? 1.0 : -1.0
            let u = Double(n) * Double.pi * x
            let sinc = u < 1e-12 ? 1.0 : sin(u) / u
            let nd = Double(n)
            sum += sign * sinc * exp(-nd * nd * Double.pi * Double.pi * fourier)
        }
        return 2.0 * sum
    }

    /// Complementary error function, Chebyshev form (Numerical Recipes).
    ///
    /// Swift HAS `erfc` in Foundation, and it is more accurate than this. It is
    /// deliberately not used: the fixtures were generated from the JavaScript,
    /// which has no erf at all, and a port that silently swapped in a better
    /// implementation would diverge from its reference by more than the
    /// tolerance - quietly, and only in the fourth decimal place.
    public static func complementaryError(_ x: Double) -> Double {
        let cof: [Double] = [
            -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
            -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
            4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
            1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
            6.529054439e-9, 5.059343495e-9, -9.91364156e-10,
            -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
            -6.886027e-12, 8.94487e-13, 3.13092e-13,
            -1.12708e-13, 3.81e-16, 7.106e-15,
        ]
        let z = abs(x)
        let t = 2.0 / (2.0 + z)
        let ty = 4.0 * t - 2.0
        var d = 0.0
        var dd = 0.0
        var j = cof.count - 1
        while j > 0 {
            let tmp = d
            d = ty * d - dd + cof[j]
            dd = tmp
            j -= 1
        }
        let ans = t * exp(-z * z + 0.5 * (cof[0] + ty * d) - dd)
        return x >= 0.0 ? ans : 2.0 - ans
    }
}

/// The standard normal CDF, from the core's own erfc - the one both languages
/// already share - rather than the platform's.
func normalCdf(_ x: Double) -> Double {
    0.5 * Sphere.complementaryError(-x / 2.0.squareRoot())
}
