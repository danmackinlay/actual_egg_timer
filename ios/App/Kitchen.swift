import Foundation
import Observation
import EggTimerCore

/// What the app is asking the model, and what the model last answered.
///
/// The solve is roughly a dozen full simulations of ten thousand steps each, so
/// it does not belong on the main actor while a finger is on the slider. The
/// pattern here is the smallest one that is actually correct: each change starts
/// a fresh task and cancels the one in flight, and a result is only published if
/// it is still the answer to the current question.
@Observable
@MainActor
final class Kitchen {
    var doneness: Double = 0.41 { didSet { recompute() } }
    var eggMassG: Double = 62.3 { didSet { recompute() } }
    var fromFridge: Bool = true { didSet { recompute() } }
    var cooling: Cooling = .ice { didSet { recompute() } }

    private(set) var solution: Solution?
    private(set) var solving = false

    private var task: Task<Void, Never>?

    init() { recompute() }

    var egg: Egg { Geometry.eggFromMass(eggMassG / 1000.0) }

    var setup: CookSetup {
        CookSetup(
            startMode: .hot,
            eggStartC: fromFridge ? 4 : 20,
            ambientC: 20,
            boilingC: 100,
            timeToBoilS: 480,
            cooling: cooling,
            waterLitres: 2,
            eggCount: 4,
            eggMassKg: egg.massKg
        )
    }

    /// The label moves with the finger; the numbers follow when the solve lands.
    var label: String {
        var best = donenessAnchors[0]
        for anchor in donenessAnchors
        where abs(anchor.level - doneness) < abs(best.level - doneness) {
            best = anchor
        }
        return best.label
    }

    private func recompute() {
        task?.cancel()
        let egg = egg
        let setup = setup
        let target = donenessFromSlider(doneness)
        solving = true
        task = Task {
            let answer = await Task.detached(priority: .userInitiated) {
                solveCookTime(egg: egg, setup: setup, params: .default, doneness: target)
            }.value
            guard !Task.isCancelled else { return }
            self.solution = answer
            self.solving = false
        }
    }
}

/// One line on what the model expects of this cook - the same wording the web
/// app uses, because it is the same model saying it.
func textureNote(peakYolkC: Double, peakWhiteC: Double) -> String {
    let white = peakWhiteC < 71 ? "white just set" : (peakWhiteC < 82 ? "white set" : "white firm")
    let yolk: String
    switch peakYolkC {
    case ..<58: yolk = "yolk liquid"
    case ..<63: yolk = "yolk soft, barely thickened"
    case ..<68: yolk = "yolk jammy"
    case ..<73: yolk = "yolk fudgy"
    default: yolk = "yolk fully set"
    }
    return "\(white), \(yolk)"
}

func clockString(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded()))
    return String(format: "%d:%02d", total / 60, total % 60)
}
