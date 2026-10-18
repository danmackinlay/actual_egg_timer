import Foundation
import EggTimerCore

/// The cook in progress as this app stores it (`StoreRegistry.cook`), so a
/// relaunch does not lose the egg: the cook, whether its egg was answered,
/// and the lean last decided, in its format (`Stamped`).
///
/// The cook is written as core codes it: what was fixed at the press, the
/// start and the log; the cook as it stands is the log folded again on
/// reading, by core's `foldCook`, and nothing derived is stored as truth.
/// Written by JSONEncoder (each double's shortest round-trip form) and read
/// by JSONDecoder, to the bit: an ulp in the mass is another decision
/// surface's key. A value in another format, or one that does not decode,
/// reads as no cook, and `Cook` drops it.
public struct StoredCook: Sendable, Equatable, Codable {
    public let cook: RunningCook
    public let answers: KeptAnswers
    public let leanHintS: Double

    public init(cook: RunningCook, answers: KeptAnswers, leanHintS: Double) {
        self.cook = cook
        self.answers = answers
        self.leanHintS = leanHintS
    }
}

/// Whether the egg had been written down with an answer when the cook was
/// stored: a cook stored as answered is read back as answered, so its egg is
/// never logged a second time.
public enum KeptAnswers: String, Sendable, Codable {
    case unanswered, beforeReload
}
