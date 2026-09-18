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
    /// the ramp lasts. With the heat off it also sets the pan's loss time
    /// constant - it is the only measurement of the pan there is.
    public var timeToBoilS: Double
    public var cooling: Cooling
    /// Water volume, litres.
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
    public static func rampTemperature(
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

    /// The pan's Newtonian loss time constant, s - the same quantity that
    /// shapes the ramp, so the measured time to boil already contains it.
    public static func panTimeConstant(_ timeToBoilS: Double) -> Double {
        Constants.tauStandingScale * timeToBoilS / log(Constants.rampR / (Constants.rampR - 1.0))
    }

    /// Water temperature once the heat is off: Newtonian cooling of the pan
    /// toward the room, starting from `fromC`.
    public static func standingTemperature(
        elapsedSinceOffS: Double, fromC: Double, ambientC: Double, timeToBoilS: Double
    ) -> Double {
        let tau = panTimeConstant(timeToBoilS)
        if !(tau > 0.0) { return fromC }
        return ambientC + (fromC - ambientC) * exp(-elapsedSinceOffS / tau)
    }

    /// Surface temperature during cooling. Ice and tap are effectively
    /// Dirichlet; still air is not, so the surface tracks the egg's own bulk
    /// temperature decaying toward the room.
    public static func coolingTemperature(
        setup: CookSetup, elapsedSincePullS: Double,
        waterAtPullC: Double, meanAtPullC: Double, tauAirScale: Double
    ) -> Double {
        var target: Double
        switch setup.cooling {
        case .ice:
            target = Constants.tIceBathC
        case .tap:
            // Mains water is not room temperature: nearer ground temperature.
            target = Constants.tColdTapC
        case .counter:
            let tau = Constants.tauAir * tauAirScale
            target = setup.ambientC
                + (meanAtPullC - setup.ambientC) * exp(-elapsedSincePullS / tau)
        }
        // Blend out of the water temperature rather than jumping, so the
        // surface is continuous at the moment of pulling.
        return target + (waterAtPullC - target) * exp(-elapsedSincePullS / Constants.tauPlunge)
    }

    /// Water temperature while the egg is still in the pan, `tS` after it went
    /// in: ramp, boil, dip, and with the heat off the pan cooling toward the
    /// room.
    public static func bathTemperature(_ egg: Egg, _ setup: CookSetup, tS: Double) -> Double {
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
                ambientC: setup.ambientC, timeToBoilS: setup.timeToBoilS
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
            ambientC: setup.ambientC, timeToBoilS: setup.timeToBoilS
        )
    }

    /// Water temperature at the moment the egg goes in.
    public static func initialSurfaceTemperature(_ egg: Egg, _ setup: CookSetup) -> Double {
        bathTemperature(egg, setup, tS: 0.0)
    }
}
