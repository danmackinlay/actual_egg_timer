import Foundation
import EggTimerCore

/// What a cook's steps are handed, built off the main actor as a step asks
/// for it (core's `need`, `Services.grids`): the surfaces for its pot and
/// their odds on the calibration as it stands; and, for a cook whose plan as
/// it ran is stale, the calibration before its egg and surfaces on that.
/// Each is asked for once, and the cook told as each lands (`landed`).
@MainActor
final class CookSurfaces {
    /// The surfaces built, by `inputsKey`, and their odds by
    /// `DecisionGrids.profileKey`.
    private var grids: [String: (inputs: DecisionInputs, grid: DoseGrid)] = [:]
    private var profiles: [String: OddsProfile] = [:]
    /// The calibration before a cook's egg and the surfaces built on it, by
    /// the cook's id: what a record corrected after the pull is planned on.
    /// Kept while the cook's plan as it ran is stale (`keep`).
    private(set) var before: [Double: CookBefore] = [:]
    /// What is being built, by what it is for.
    private var building: Set<String> = []

    /// Told when something asked for has landed (`Cook`).
    var landed: () -> Void = {}
    /// Whether nothing is being built.
    var idle: Bool { building.isEmpty }

    /// The surfaces built, with their odds on `c` where they are in.
    func all(_ c: Calibration) -> [CookSurface] {
        grids.values.map {
            CookSurface(inputs: $0.inputs, grid: $0.grid, profile: profiles[DecisionGrids.profileKey($0.inputs, c)])
        }
    }

    /// The surface for `inputs` and its odds on `c`, if they were built
    /// already: what a cook starts on.
    func takeBuilt(_ inputs: DecisionInputs, _ c: Calibration) async {
        guard let grid = await Services.grids.cached(inputs) else { return }
        grids[inputsKey(inputs)] = (inputs, grid)
        if let p = await Services.grids.cachedProfile(inputs, c) { profiles[DecisionGrids.profileKey(inputs, c)] = p }
    }

    /// A pot's surface and its odds on `c`: the cook is told when the
    /// surface lands, and again when its odds do.
    func build(_ inputs: DecisionInputs, on c: Calibration) {
        let key = "surface|\(inputsKey(inputs))"
        guard !building.contains(key) else { return }
        building.insert(key)
        Task {
            let grid = await Services.grids.grid(inputs)
            grids[inputsKey(inputs)] = (inputs, grid)
            if let p = await Services.grids.cachedProfile(inputs, c) {
                profiles[DecisionGrids.profileKey(inputs, c)] = p
            } else {
                landed()
                profiles[DecisionGrids.profileKey(inputs, c)] = await Services.grids.profile(inputs, c)
            }
            building.remove(key)
            landed()
        }
    }

    /// The calibration before the egg of the cook `id`: the one held before
    /// the egg at `logged` in the log was folded, or the log replayed up to
    /// it (`Learning.calibrationBefore`).
    func buildBefore(_ id: Double, logged: Int?, from learner: Learning) {
        let key = "before|\(id)"
        guard !building.contains(key), before[id] == nil else { return }
        building.insert(key)
        Task {
            let c = await learner.calibrationBefore(logged)
            before[id] = CookBefore(calibration: c, surfaces: [])
            building.remove(key)
            landed()
        }
    }

    /// The surface and its odds for `inputs` on the calibration before the
    /// egg of the cook `id`, once that is in.
    func buildBefore(_ id: Double, surface inputs: DecisionInputs) {
        guard let held = before[id] else { return }
        let key = "beforeSurface|\(id)|\(inputsKey(inputs))"
        guard !building.contains(key) else { return }
        building.insert(key)
        let c = held.calibration
        Task {
            let grid = await Services.grids.grid(inputs)
            let profile = await Services.grids.profile(inputs, c)
            building.remove(key)
            if var now = before[id] {
                now.surfaces.append(CookSurface(inputs: inputs, grid: grid, profile: profile))
                before[id] = now
            }
            landed()
        }
    }

    /// The calibrations before an egg still wanted: the cooks' `ids`.
    func keep(_ ids: Set<Double>) {
        before = before.filter { ids.contains($0.key) }
    }
}
