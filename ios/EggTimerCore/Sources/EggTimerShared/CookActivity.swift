import Foundation
#if os(iOS)
import ActivityKit
#endif

/// The contract between the app and the Live Activity.
///
/// In EggTimerShared, which BOTH targets link, which is why it imports only
/// ActivityKit and Foundation: the widget extension has no physics and needs
/// none. Everything here has already been solved by the time the app hands it
/// over. An `ActivityAttributes` on iOS; on the Mac, where the app's logic
/// is tested, the same values without ActivityKit.
///
/// The countdown is expressed as a pair of absolute dates rather than a
/// remaining duration, for the same reason `Cook` holds absolute dates: the
/// Lock Screen renders `Text(timerInterval:)` itself, once per second, with no
/// process of ours awake. A duration would need updating; a deadline does not.
public struct CookActivity: Codable, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var stage: Stage
        /// Start and end of the stage now running. The widget draws the
        /// countdown from these and never from the clock in the app.
        public var began: Date
        public var ends: Date
        /// True while the end is a guess - a cold start whose pan has not
        /// reached the boil yet. The widget says so rather than implying a
        /// precision it has not got.
        public var provisional: Bool
        /// True while the slow hob has lengthened the guess: the card counts
        /// the time heated up from `began`, the start, rather than down to a
        /// pull that keeps moving, which would read 0:00 while the water
        /// still heats; `ends` is then when the guess gives out.
        public var countsUp: Bool = false
        /// What is being cooked, as the plan now has it. In the state, not
        /// the attributes, so that a plan made again - the boil tapped, a
        /// slow hob, and later a correction - updates the card in place.
        public var cook: Description

        public init(
            stage: Stage, began: Date, ends: Date, provisional: Bool, countsUp: Bool = false, cook: Description
        ) {
            self.stage = stage
            self.began = began
            self.ends = ends
            self.provisional = provisional
            self.countsUp = countsUp
            self.cook = cook
        }
    }

    /// The cook the card describes: what was asked for, not what is left.
    public struct Description: Codable, Hashable, Sendable {
        public var doneness: String
        /// The peak yolk temperature and the egg's mass, already in the
        /// cook's units with the unit attached ("65 °C", "2.4 oz"). The widget
        /// has no physics and no units table, so it is handed the words, not
        /// the numbers.
        public var peakYolk: String
        public var eggMass: String
        /// The cooling the cook chose, `Cooling`'s raw value: `ice`, `tap` or
        /// `counter`. The pull line names it (`pullLineKey`, in
        /// EggTimerCopy). A String, since this file cannot see EggTimerCore.
        public var cooling: String

        public init(doneness: String, peakYolk: String, eggMass: String, cooling: String) {
            self.doneness = doneness
            self.peakYolk = peakYolk
            self.eggMass = eggMass
            self.cooling = cooling
        }
    }

    /// The catalogue the cook was started in, `en` or `en-x-1750`: fixed for
    /// the life of the card. The widget cannot read the app's settings, so
    /// the activity carries its language as it carries its units.
    public var lang: String

    public init(lang: String) {
        self.lang = lang
    }

    // No odds: mid-cook nothing on the Lock Screen can change what the cook
    // does, so it says nothing rather than spend the room on them.

    public enum Stage: String, Codable, Hashable, Sendable {
        case heating
        case cooking
        case pull
        case cooling

        /// The stage's name, in the activity's language.
        public func title(in lang: String) -> String {
            switch self {
            case .heating: tr("activity.stage.heating", in: lang)
            case .cooking: tr("activity.stage.cooking", in: lang)
            case .pull: tr("activity.stage.pull", in: lang)
            case .cooling: tr("activity.stage.cooling", in: lang)
            }
        }

        public var symbol: String {
            switch self {
            case .heating: "flame.fill"
            case .cooking: "timer"
            case .pull: "bell.fill"
            case .cooling: "snowflake"
            }
        }

        /// Three stages are counted down. `pull` is a moment; a timer on it
        /// would count toward nothing. There is no done stage: the card ends
        /// at once when the cooling does (`LiveActivity.endAll`).
        public var countsDown: Bool {
            self == .heating || self == .cooking || self == .cooling
        }
    }
}

#if os(iOS)
extension CookActivity: ActivityAttributes {}
#endif
