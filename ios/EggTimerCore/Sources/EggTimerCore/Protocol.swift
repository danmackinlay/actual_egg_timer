import Foundation

/// The water temperature schedule the egg's surface actually sees, across every
/// phase of the cook: pan ramp, boil, and cooling.
/// Transliterated from `src/core/protocol.ts`.

/// Cold start: eggs go in the cold pan and heat with the water. Hot start:
/// eggs are lowered into water already boiling.
public enum StartMode: String, Sendable, Codable {
    case cold, hot
}

/// What happens after the egg comes out. Not a detail: it changes the peak
/// yolk temperature by ~20 C.
public enum Cooling: String, Sendable, Codable {
    case ice, tap, counter
}

/// What happens to the burner once the water boils. `hold` is what every recipe
/// silently assumes; `off` is the standing method.
public enum HeatAfterBoil: String, Sendable, Codable {
    case hold, off
}

public struct CookSetup: Sendable, Codable, Equatable {
    public var startMode: StartMode
    /// Egg temperature when it goes in, C.
    public var eggStartC: Double
    /// Room air temperature, C. The pan starts here on a cold start, the water
    /// decays toward it with the heat off, and a rested egg cools toward it.
    public var ambientC: Double
    /// Boiling point at the user's altitude, C.
    public var boilingC: Double
    /// Measured time to a full rolling boil, s. On a cold start it is how long
    /// the ramp lasts, and that is all it is used for. A hot start carries the
    /// remembered value, but nothing in the physics reads it.
    public var timeToBoilS: Double
    public var cooling: Cooling
    /// Water volume, litres. Sets the dip when eggs go in and, with the heat
    /// off, how long the pan holds its temperature (see panTimeConstant).
    public var waterLitres: Double
    /// Burner after the boil. The TypeScript leaves this optional and treats
    /// absent as `hold`; here the default does the same job.
    public var afterBoil: HeatAfterBoil
    public var eggCount: Double

    /* The egg's MASS is not here. It was, and it duplicated `Egg.massKg` - so
     * `simulate(egg, setup, ...)` took the same number twice and every caller
     * had to keep the two in step by hand. The setup is the POT; the egg is the
     * egg. */

    public init(
        startMode: StartMode, eggStartC: Double, ambientC: Double, boilingC: Double,
        timeToBoilS: Double, cooling: Cooling, waterLitres: Double,
        afterBoil: HeatAfterBoil = .hold, eggCount: Double
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
    }
}

public enum Protocols {
    /// Pan heating ramp: constant power into a lumped water mass with Newtonian
    /// losses, clamped by boiling. One measurement (time to boil) plus RAMP_R
    /// determines the whole curve.
    static func rampTemperature(
        tS: Double, timeToBoilS: Double, ambientC: Double, boilingC: Double
    ) -> Double {
        if tS >= timeToBoilS { return boilingC }
        let tau = timeToBoilS / log(Constants.rampR / (Constants.rampR - 1.0))
        let t = ambientC + Constants.rampR * (boilingC - ambientC) * (1.0 - exp(-tS / tau))
        return t > boilingC ? boilingC : t
    }

    /// How far the water drops when cold eggs go into boiling water, C.
    /// Straight energy balance over water + eggs.
    public static func dipMagnitude(_ egg: Egg, _ setup: CookSetup) -> Double {
        let waterCapacity = setup.waterLitres * Constants.cWater
        let eggCapacity = setup.eggCount * egg.massKg * Constants.cEgg
        let total = waterCapacity + eggCapacity
        if total <= 0.0 { return 0.0 }
        return eggCapacity * (setup.boilingC - setup.eggStartC) / total
    }

    /// The pan's Newtonian loss time constant with the heat off and the lid
    /// on, s, from the water volume alone:
    /// tau(V) = scale * tauRef * (V / 2 L)^(1/3). Not from the time to boil,
    /// which measures the hob, not the pan.
    public static func panTimeConstant(_ waterLitres: Double) -> Double {
        if !(waterLitres > 0.0) { return 0.0 }
        return Constants.tauStandingScale * Constants.tauStandingRefS
            * pow(waterLitres / Constants.standingRefLitres, Constants.standingVolumeExponent)
    }

    /// Water temperature once the heat is off: Newtonian cooling of the pan
    /// toward the room, starting from `fromC`.
    static func standingTemperature(
        elapsedSinceOffS: Double, fromC: Double, ambientC: Double, waterLitres: Double
    ) -> Double {
        let tau = panTimeConstant(waterLitres)
        if !(tau > 0.0) { return fromC }
        return ambientC + (fromC - ambientC) * exp(-elapsedSinceOffS / tau)
    }

    /// The egg's Newtonian cooling time constant on the counter, s: m*c/(h*A)
    /// over the equal-volume sphere, with h = `hAir`.
    public static func airTimeConstant(_ egg: Egg) -> Double {
        egg.massKg * Constants.cEgg / (Constants.hAir * 4.0 * Double.pi * egg.radiusM * egg.radiusM)
    }

    /// What drying off costs the egg, as a fall in its mean temperature, C:
    /// the latent heat of the film on its shell over its heat capacity.
    public static func wetShellDropC(_ egg: Egg) -> Double {
        let area = 4.0 * Double.pi * egg.radiusM * egg.radiusM
        return Constants.wetShellKgM2 * area * Constants.latentHeatWater / (egg.massKg * Constants.cEgg)
    }

    /// Surface temperature during cooling, for the step of `dtS` that ends
    /// `elapsedSincePullS` after the pull and starts from `sphere` as it
    /// stands. Ice and tap are effectively Dirichlet. On the counter the shell
    /// loses heat by Newton's law at its own temperature, and the water on it
    /// takes its latent heat over `tauPlunge`. protocol.ts has the physics.
    static func coolingTemperature(
        sphere: SphereState, egg: Egg, setup: CookSetup, elapsedSincePullS: Double, dtS: Double,
        waterAtPullC: Double, tauAirScale: Double
    ) -> Double {
        if setup.cooling == .counter {
            let before = elapsedSincePullS > dtS ? elapsedSincePullS - dtS : 0.0
            let drying = wetShellDropC(egg)
                * (exp(-before / Constants.tauPlunge) - exp(-elapsedSincePullS / Constants.tauPlunge))
            let tau = airTimeConstant(egg) * tauAirScale
            if elapsedSincePullS >= dtS {
                return sphere.robinSurface(dtS: dtS, ambientC: setup.ambientC, tauS: tau, lossC: drying)
            }
            // The step that straddles the pull is split between the water and
            // the counter by the time spent in each; protocol.ts says why.
            let out = elapsedSincePullS / dtS
            if !(out > 0.0) { return waterAtPullC }
            let counter = sphere.robinSurface(dtS: dtS, ambientC: setup.ambientC, tauS: tau, lossC: drying / out)
            return waterAtPullC + (counter - waterAtPullC) * out
        }
        let target = coolingMediumC(setup.cooling, ambientC: setup.ambientC)
        // Blend out of the water temperature rather than jumping, so the
        // surface is continuous at the moment of pulling.
        return target + (waterAtPullC - target) * exp(-elapsedSincePullS / Constants.tauPlunge)
    }

    /// Water temperature while the egg is still in the pan, `tS` after it went
    /// in: ramp, boil, dip, and with the heat off the pan cooling toward the
    /// room.
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
        // Hot start: already boiling, but it dips when the eggs go in.
        let dip = dipMagnitude(egg, setup)
        // With the burner on it pulls the dip back over roughly a minute. With
        // the burner off nothing pulls it back: the dip is permanent.
        if !standing {
            return setup.boilingC - dip * exp(-tS / Constants.tauDipRecovery)
        }
        return standingTemperature(
            elapsedSinceOffS: tS, fromC: setup.boilingC - dip,
            ambientC: setup.ambientC, waterLitres: setup.waterLitres
        )
    }

    /// Water temperature at the moment the egg goes in.
    static func initialSurfaceTemperature(_ egg: Egg, _ setup: CookSetup) -> Double {
        bathTemperature(egg, setup, tS: 0.0)
    }
}

/// What the egg cools in, C: the ice bath, the tap's water, or on the counter
/// the room. Mains water is not room temperature: nearer ground temperature,
/// so it has its own constant.
public func coolingMediumC(_ cooling: Cooling, ambientC: Double) -> Double {
    switch cooling {
    case .ice: Constants.tIceBathC
    case .tap: Constants.tColdTapC
    case .counter: ambientC
    }
}
