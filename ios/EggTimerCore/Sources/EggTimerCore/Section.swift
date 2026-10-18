import Foundation

/// The twin of `src/core/section.ts`, held to it by `fixtures/section.json`;
/// the TypeScript's comments say what each part is for. Its `createSection`,
/// `advanceSection` and `sectionView` are this struct's `init`, mutating
/// `advance` and `view`, and its sample counts are `Section`'s.
public struct EggSection: Sendable, Codable {
    public private(set) var sphere: SphereState
    public private(set) var tS: Double
    public private(set) var outAtS: Double?
    public private(set) var waterAtPullC: Double
    public private(set) var meanAtPullC: Double
    public let x: [Double]
    public let yolk: [Bool]
    public let outer: [Double]
    public private(set) var dose: [Dose]

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
        self.meanAtPullC = setup.eggStartC
        self.x = x
        self.yolk = yolk
        self.outer = outer
        self.dose = dose
    }

    public mutating func advance(
        egg: Egg, setup: CookSetup, toS: Double, outAtS given: Double?
    ) {
        while tS + Constants.dtSim <= toS {
            let tNext = tS + Constants.dtSim
            let out = outAtS ?? given
            let next: Double
            if let out, tNext >= out {
                if outAtS == nil {
                    outAtS = out
                    waterAtPullC = sphere.surfaceC
                    meanAtPullC = sphere.meanTemperature
                }
                next = Protocols.coolingTemperature(
                    sphere: sphere, egg: egg, setup: setup, elapsedSincePullS: tNext - out,
                    dtS: Constants.dtSim, waterAtPullC: waterAtPullC, meanAtPullC: meanAtPullC
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

    enum CodingKeys: String, CodingKey {
        case sphere, tS = "t_s", outAtS = "outAt_s", waterAtPullC = "waterAtPull_C"
        case meanAtPullC = "meanAtPull_C", x, yolk, outer, dose
    }
}

public struct SectionView: Sendable, Codable {
    public let x: [Double]
    public let yolk: [Bool]
    public let outer: [Double]
    public let temperatureC: [Double]
    public let set: [Double]

    enum CodingKeys: String, CodingKey {
        case x, yolk, outer, temperatureC = "temperature_C", set
    }
}

public func previewSection(
    egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double, whiteTargetMin: Double
) -> SectionView {
    var s = EggSection(egg: egg, setup: setup, params: params)
    s.advance(egg: egg, setup: setup, toS: cookTimeS + carryoverWindowS(setup.cooling), outAtS: cookTimeS)
    return s.view(whiteTargetMin: whiteTargetMin)
}
