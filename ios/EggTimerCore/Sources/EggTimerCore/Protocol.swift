import Foundation

/// The twin of `src/core/protocol.ts`, held to it by `fixtures/core.json`; the
/// TypeScript's comments say what each part is for, and give the physics. Its
/// schedule functions are `Protocols`' statics.

public enum StartMode: String, Sendable, Codable {
    case cold, hot
}

public enum Cooling: String, Sendable, Codable, CaseIterable {
    case ice, tap, bowl, counter, eggCup
}

public func restsInAir(_ cooling: Cooling) -> Bool {
    cooling == .counter || cooling == .eggCup
}

public func countsDown(_ cooling: Cooling) -> Bool {
    cooling != .counter
}

public func carryoverWindowS(_ cooling: Cooling) -> Double {
    cooling == .eggCup ? Constants.eggCupOpenedS : Constants.carryoverWindow
}

public enum HeatAfterBoil: String, Sendable, Codable {
    case hold, off
}

public struct CookSetup: Sendable, Codable, Equatable {
    public var startMode: StartMode
    public var eggStartC: Double
    public var ambientC: Double
    public var boilingC: Double
    public var timeToBoilS: Double
    public var cooling: Cooling
    public var waterLitres: Double
    /// The TypeScript leaves this optional and treats absent as `hold`; here
    /// the default does the same job.
    public var afterBoil: HeatAfterBoil
    public var eggCount: Double
    public var coolingWaterC: Double?
    public var bowlLitres: Double?

    public init(
        startMode: StartMode, eggStartC: Double, ambientC: Double, boilingC: Double,
        timeToBoilS: Double, cooling: Cooling, waterLitres: Double,
        afterBoil: HeatAfterBoil = .hold, eggCount: Double,
        coolingWaterC: Double? = nil, bowlLitres: Double? = nil
    ) {
        self.startMode = startMode
        self.eggStartC = eggStartC
        self.ambientC = ambientC
        self.boilingC = boilingC
        self.timeToBoilS = timeToBoilS
        self.cooling = cooling
        self.waterLitres = waterLitres
        self.afterBoil = afterBoil
        self.eggCount = eggCount
        self.coolingWaterC = coolingWaterC
        self.bowlLitres = bowlLitres
    }

    enum CodingKeys: String, CodingKey {
        case startMode, eggStartC = "eggStart_C", ambientC = "ambient_C", boilingC = "boiling_C"
        case timeToBoilS = "timeToBoil_s", cooling, waterLitres, afterBoil, eggCount
        case coolingWaterC = "coolingWater_C", bowlLitres
    }

    /// As the TypeScript reads one: no `afterBoil` is `hold`.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            startMode: try c.decode(StartMode.self, forKey: .startMode), eggStartC: try c.decode(Double.self, forKey: .eggStartC),
            ambientC: try c.decode(Double.self, forKey: .ambientC), boilingC: try c.decode(Double.self, forKey: .boilingC),
            timeToBoilS: try c.decode(Double.self, forKey: .timeToBoilS), cooling: try c.decode(Cooling.self, forKey: .cooling),
            waterLitres: try c.decode(Double.self, forKey: .waterLitres),
            afterBoil: try c.decodeIfPresent(HeatAfterBoil.self, forKey: .afterBoil) ?? .hold,
            eggCount: try c.decode(Double.self, forKey: .eggCount),
            coolingWaterC: try c.decodeIfPresent(Double.self, forKey: .coolingWaterC),
            bowlLitres: try c.decodeIfPresent(Double.self, forKey: .bowlLitres)
        )
    }
}

public enum Protocols {
    static func rampTemperature(
        tS: Double, timeToBoilS: Double, ambientC: Double, boilingC: Double
    ) -> Double {
        if tS >= timeToBoilS { return boilingC }
        let tau = timeToBoilS / log(Constants.rampR / (Constants.rampR - 1.0))
        let t = ambientC + Constants.rampR * (boilingC - ambientC) * (1.0 - exp(-tS / tau))
        return t > boilingC ? boilingC : t
    }

    public static func dipMagnitude(_ egg: Egg, _ setup: CookSetup) -> Double {
        let waterCapacity = setup.waterLitres * Constants.cWater
        let eggCapacity = setup.eggCount * egg.massKg * Constants.cEgg
        let total = waterCapacity + eggCapacity
        if total <= 0.0 { return 0.0 }
        return eggCapacity * (setup.boilingC - setup.eggStartC) / total
    }

    public static func panTimeConstant(_ waterLitres: Double) -> Double {
        if !(waterLitres > 0.0) { return 0.0 }
        return Constants.tauStandingScale * Constants.tauStandingRefS
            * pow(waterLitres / Constants.standingRefLitres, Constants.standingVolumeExponent)
    }

    static func standingTemperature(
        elapsedSinceOffS: Double, fromC: Double, ambientC: Double, waterLitres: Double
    ) -> Double {
        let tau = panTimeConstant(waterLitres)
        if !(tau > 0.0) { return fromC }
        return ambientC + (fromC - ambientC) * exp(-elapsedSinceOffS / tau)
    }

    public static func airTimeConstant(_ egg: Egg) -> Double {
        egg.massKg * Constants.cEgg / (Constants.hAir * 4.0 * Double.pi * egg.radiusM * egg.radiusM)
    }

    public static func wetShellDropC(_ egg: Egg) -> Double {
        let area = 4.0 * Double.pi * egg.radiusM * egg.radiusM
        return Constants.wetShellKgM2 * area * Constants.latentHeatWater / (egg.massKg * Constants.cEgg)
    }

    public static func bowlTemperature(_ egg: Egg, _ setup: CookSetup, meanAtPullC: Double, meanC: Double) -> Double {
        let start = coolingMediumC(setup)
        guard let litres = setup.bowlLitres, litres > 0.0 else { return start }
        let given = setup.eggCount * egg.massKg * Constants.cEgg * (meanAtPullC - meanC)
        return start + given / (litres * Constants.cWater)
    }

    static func coolingTemperature(
        sphere: SphereState, egg: Egg, setup: CookSetup, elapsedSincePullS: Double, dtS: Double,
        waterAtPullC: Double, meanAtPullC: Double
    ) -> Double {
        if restsInAir(setup.cooling) {
            let before = elapsedSincePullS > dtS ? elapsedSincePullS - dtS : 0.0
            let drying = wetShellDropC(egg)
                * (exp(-before / Constants.tauPlunge) - exp(-elapsedSincePullS / Constants.tauPlunge))
            let tau = airTimeConstant(egg)
            if elapsedSincePullS >= dtS {
                return sphere.robinSurface(dtS: dtS, ambientC: setup.ambientC, tauS: tau, lossC: drying)
            }
            let out = elapsedSincePullS / dtS
            if !(out > 0.0) { return waterAtPullC }
            let counter = sphere.robinSurface(dtS: dtS, ambientC: setup.ambientC, tauS: tau, lossC: drying / out)
            return waterAtPullC + (counter - waterAtPullC) * out
        }
        let target = setup.cooling == .bowl
            ? bowlTemperature(egg, setup, meanAtPullC: meanAtPullC, meanC: sphere.meanTemperature)
            : coolingMediumC(setup)
        return target + (waterAtPullC - target) * exp(-elapsedSincePullS / Constants.tauPlunge)
    }

    static func bathTemperature(_ egg: Egg, _ setup: CookSetup, tS: Double) -> Double {
        let standing = setup.afterBoil == .off
        if setup.startMode == .cold {
            if tS < setup.timeToBoilS {
                return rampTemperature(
                    tS: tS, timeToBoilS: setup.timeToBoilS,
                    ambientC: setup.ambientC, boilingC: setup.boilingC
                )
            }
            if !standing { return setup.boilingC }
            return standingTemperature(
                elapsedSinceOffS: tS - setup.timeToBoilS, fromC: setup.boilingC,
                ambientC: setup.ambientC, waterLitres: setup.waterLitres
            )
        }
        let dip = dipMagnitude(egg, setup)
        if !standing {
            return setup.boilingC - dip * exp(-tS / Constants.tauDipRecovery)
        }
        return standingTemperature(
            elapsedSinceOffS: tS, fromC: setup.boilingC - dip,
            ambientC: setup.ambientC, waterLitres: setup.waterLitres
        )
    }

    static func initialSurfaceTemperature(_ egg: Egg, _ setup: CookSetup) -> Double {
        bathTemperature(egg, setup, tS: 0.0)
    }
}

/// The TypeScript's `coolingMedium_C` takes anything with a pot's cooling
/// fields (`CoolingFacts`); here it takes the fields, and the overload below a
/// `CookSetup`.
public func coolingMediumC(_ cooling: Cooling, ambientC: Double, waterC: Double?) -> Double {
    switch cooling {
    case .ice: return Constants.tIceBathC
    case .counter, .eggCup: return ambientC
    case .tap: return waterC ?? Constants.tColdTapC
    case .bowl: return waterC ?? ambientC
    }
}

public func coolingMediumC(_ setup: CookSetup) -> Double {
    coolingMediumC(setup.cooling, ambientC: setup.ambientC, waterC: setup.coolingWaterC)
}
