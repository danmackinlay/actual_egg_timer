import Foundation
import EggTimerCore

// MARK: - Decision surfaces

/// This app's decision surfaces, one per pot and posterior, built off the
/// main actor and kept. The slider is not part of the key, so dragging it never
/// waits for one. Two asks for the same pot share one build, and the build is
/// not cancelled with the solve that asked for it: a pot that comes back should
/// not be built twice. The web app keeps the same cache (`decisionGrid`).
actor DecisionGrids {
    static let shared = DecisionGrids()

    /// The pot on screen, the one before, and a cold start's measured ramp.
    private static let kept = 6

    private var done: [String: DoseGrid] = [:]
    private var order: [String] = []
    private var building: [String: Task<DoseGrid, Never>] = [:]

    /// A surface's key: core's (`inputsKey`), which the plan and the web's
    /// caches use too.
    private static func key(_ inputs: DecisionInputs) -> String {
        inputsKey(inputs)
    }

    func cached(_ inputs: DecisionInputs) -> DoseGrid? {
        done[Self.key(inputs)]
    }

    func grid(_ inputs: DecisionInputs) async -> DoseGrid {
        let key = Self.key(inputs)
        if let grid = done[key] { return grid }
        if let running = building[key] { return await running.value }
        let build = Task.detached(priority: .userInitiated) {
            #if DEBUG
            Perf.time(.grid) { buildDecisionGrid(inputs) }
            #else
            buildDecisionGrid(inputs)
            #endif
        }
        building[key] = build
        let grid = await build.value
        building[key] = nil
        if done[key] == nil { order.append(key) }
        done[key] = grid
        while order.count > Self.kept {
            done[order.removeFirst()] = nil
        }
        return grid
    }

    // MARK: The odds at every level

    /// Profiles by pot AND posterior: unlike the surface, a profile reads every
    /// particle, so a fold - or a second answer refolded, which keeps the
    /// count - makes a new one. A few more than the surfaces, for the priced
    /// changes the advice asks about.
    private static let profilesKept = 8

    private var profiles: [String: OddsProfile] = [:]
    private var profileOrder: [String] = []
    private var profileBuilds: [String: Task<OddsProfile, Never>] = [:]

    /// A cheap summary of where the posterior stands: the count and the
    /// weighted sums of every dimension. Any fold moves at least one of them.
    /// The web app's `posteriorPrint`.
    nonisolated static func profileKey(_ inputs: DecisionInputs, _ c: Calibration) -> String {
        var a = 0.0, b = 0.0, d = 0.0, e = 0.0
        let post = c.posterior
        for (p, w) in zip(post.particles, post.weights) {
            a += w * p.alphaM2s
            b += w * p.logDoseOffset
            d += w * p.noise
            e += w * (p.whiteOffset + p.whiteFirmGap)
        }
        return "\(key(inputs))#\(c.eggsLogged)|\(post.rng)|\(post.particles.count)|\(a)|\(b)|\(d)|\(e)"
    }

    func cachedProfile(_ inputs: DecisionInputs, _ c: Calibration) -> OddsProfile? {
        profiles[Self.profileKey(inputs, c)]
    }

    /// The odds at every level for this pot and posterior, on the pot's
    /// surface (built first if need be), off the main actor: a couple of dozen
    /// solves and decisions. Two asks share one build.
    func profile(_ inputs: DecisionInputs, _ c: Calibration) async -> OddsProfile {
        let key = Self.profileKey(inputs, c)
        if let p = profiles[key] { return p }
        if let running = profileBuilds[key] { return await running.value }
        let surface = await grid(inputs)
        if let p = profiles[key] { return p }
        if let running = profileBuilds[key] { return await running.value }
        let build = Task.detached(priority: .userInitiated) {
            #if DEBUG
            Perf.time(.profile) { oddsProfile(c, egg: inputs.egg, setup: inputs.setup, grid: surface) }
            #else
            oddsProfile(c, egg: inputs.egg, setup: inputs.setup, grid: surface)
            #endif
        }
        profileBuilds[key] = build
        let p = await build.value
        profileBuilds[key] = nil
        if profiles[key] == nil { profileOrder.append(key) }
        profiles[key] = p
        while profileOrder.count > Self.profilesKept {
            profiles[profileOrder.removeFirst()] = nil
        }
        return p
    }
}
