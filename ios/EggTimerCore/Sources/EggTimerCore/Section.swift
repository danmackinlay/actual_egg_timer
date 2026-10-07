import Foundation

/// The egg in cross-section, while it cooks: each ring's temperature and how
/// far it has set, from the centre of the yolk out to the shell, at the moment
/// on the clock. Transliterated from `src/core/section.ts` - see that file for
/// why it runs `simulate`'s loop a tick at a time, and held to it by
/// `fixtures/section.json`.
public enum Section {
    /// Samples across the yolk, centre (x = 0) to edge (x = yolkRadiusFrac).
    public static let yolkSamples = 17
    /// Samples across the white, inner edge (x = yolkRadiusFrac) to the shell.
    /// The yolk's edge is sampled twice, once as yolk and once as white.
    public static let whiteSamples = 17
    /// How far short of its target a white dose still reads as wholly raw, in
    /// decades.
    static let whiteSetDecades = 1.0
}

public struct EggSection: Sendable {
    public private(set) var sphere: SphereState
    /// Seconds since t = 0 of the cook, a whole number of `dtSim` steps.
    public private(set) var tS: Double
    /// When the egg left the water, s since t = 0; nil while it is in. Fixed
    /// the first time a step crosses it.
    public private(set) var outAtS: Double?
    /// The water's temperature as the egg left it: an ice bath or a tap
    /// blends out of it.
    public private(set) var waterAtPullC: Double
    /// Sample radii, r/R: the yolk's from the centre out, then the white's.
    public let x: [Double]
    /// Whether each sample is yolk.
    public let yolk: [Bool]
    /// Each ring's outer edge, r/R.
    public let outer: [Double]
    /// The thermal dose at each sample, at the yolk's or the white's z.
    public private(set) var dose: [Dose]

    /// An egg at the start of a cook, uniformly at its starting temperature.
    public init(egg: Egg, setup: CookSetup, params: ModelParams) {
        let edge = Constants.yolkRadiusFrac
        let yolkLast = Double(Section.yolkSamples - 1)
        let whiteLast = Double(Section.whiteSamples - 1)
        var x: [Double] = []
        var yolk: [Bool] = []
        var outer: [Double] = []
        var dose: [Dose] = []
        for i in 0..<Section.yolkSamples {
            let n = Double(i)
            x.append(edge * n / yolkLast)
            yolk.append(true)
            outer.append(i == Section.yolkSamples - 1 ? edge : edge * (n + 0.5) / yolkLast)
            dose.append(Dose(zK: Constants.zYolk, trefC: Constants.tRefYolkC))
        }
        for j in 0..<Section.whiteSamples {
            let n = Double(j)
            x.append(edge + (1.0 - edge) * n / whiteLast)
            yolk.append(false)
            outer.append(j == Section.whiteSamples - 1 ? 1.0 : edge + (1.0 - edge) * (n + 0.5) / whiteLast)
            dose.append(Dose(zK: Constants.zWhite, trefC: Constants.tRefWhiteC))
        }
        let surface = Protocols.initialSurfaceTemperature(egg, setup)
        self.sphere = SphereState(
            radiusM: egg.radiusM, alphaM2s: params.alphaM2s,
            initialC: setup.eggStartC, surfaceC: surface
        )
        self.tS = 0.0
        self.outAtS = nil
        self.waterAtPullC = surface
        self.x = x
        self.yolk = yolk
        self.outer = outer
        self.dose = dose
    }

    /// Carry the egg forward to `toS`, in whole `dtSim` steps, exactly as
    /// `simulate` does: in the water until `outAtS`, then in whatever it cools
    /// in. `outAtS` is nil while the egg is still in the water, however late;
    /// once a step has crossed it, the section keeps the first value given.
    public mutating func advance(
        egg: Egg, setup: CookSetup, params: ModelParams, toS: Double, outAtS given: Double?
    ) {
        while tS + Constants.dtSim <= toS {
            let tNext = tS + Constants.dtSim
            let out = outAtS ?? given
            let next: Double
            if let out, tNext >= out {
                if outAtS == nil {
                    outAtS = out
                    waterAtPullC = sphere.surfaceC
                }
                next = Protocols.coolingTemperature(
                    sphere: sphere, egg: egg, setup: setup, elapsedSincePullS: tNext - out,
                    dtS: Constants.dtSim, waterAtPullC: waterAtPullC, tauAirScale: params.tauAirScale
                )
            } else {
                next = Protocols.bathTemperature(egg, setup, tS: tNext)
            }
            sphere.step(dtS: Constants.dtSim, nextSurfaceC: next)
            tS = tNext
            for i in 0..<x.count {
                dose[i].accumulate(temperatureC: sphere.temperature(atX: x[i]), dtS: Constants.dtSim)
            }
        }
    }

    /// The section as it stands. `whiteTargetMin` is the white's dose target
    /// for this cook (`calibrationDoneness`).
    public func view(whiteTargetMin: Double) -> SectionView {
        var temperature: [Double] = []
        var set: [Double] = []
        for i in 0..<x.count {
            temperature.append(sphere.temperature(atX: x[i]))
            let minutes = dose[i].minutes
            if !(minutes > 0.0) {
                set.append(0.0)
            } else if yolk[i] {
                set.append(sliderFromYolkDose(minutes))
            } else {
                let f = 1.0 + log10(minutes / whiteTargetMin) / Section.whiteSetDecades
                set.append(f < 0.0 ? 0.0 : (f > 1.0 ? 1.0 : f))
            }
        }
        return SectionView(x: x, yolk: yolk, outer: outer, temperatureC: temperature, set: set)
    }
}

/// What a screen draws: per ring, the temperature now and how far it has set,
/// from 0 to 1 - the yolk on the doneness slider's scale, the white from clear
/// to opaque. Never falls.
public struct SectionView: Sendable {
    public let x: [Double]
    public let yolk: [Bool]
    public let outer: [Double]
    public let temperatureC: [Double]
    public let set: [Double]
}

/// The egg the settings aim for: one egg, at the posterior mean, cooked for
/// `cookTimeS` and shown at the end of the cooling, the egg as eaten, with
/// the whole carryover in. See `previewSection` in `src/core/section.ts`.
public func previewSection(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double, whiteTargetMin: Double
) -> SectionView {
    var s = EggSection(egg: egg, setup: setup, params: params)
    s.advance(egg: egg, setup: setup, params: params, toS: cookTimeS + Constants.carryoverWindow, outAtS: cookTimeS)
    return s.view(whiteTargetMin: whiteTargetMin)
}
