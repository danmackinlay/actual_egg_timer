import ActivityKit
import Foundation

/// The contract between the app and the Live Activity.
///
/// This file is compiled into BOTH targets, which is why it imports nothing but
/// ActivityKit: the widget extension has no physics and needs none. Everything
/// here has already been solved by the time the app hands it over.
///
/// The countdown is expressed as a pair of absolute dates rather than a
/// remaining duration, for the same reason `Cook` holds absolute dates: the
/// Lock Screen renders `Text(timerInterval:)` itself, once per second, with no
/// process of ours awake. A duration would need updating; a deadline does not.
struct CookActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var stage: Stage
        /// Start and end of the stage now running. The widget draws the
        /// countdown from these and never from the clock in the app.
        var began: Date
        var ends: Date
        /// True while the end is a guess - a cold start whose pan has not
        /// reached the boil yet. The widget says so rather than implying a
        /// precision it has not got.
        var provisional: Bool
    }

    /// Fixed for the life of the cook: what was asked for, not what is left.
    var doneness: String
    var peakYolkC: Int
    var eggGrams: Double

    enum Stage: String, Codable, Hashable {
        case heating
        case cooking
        case pull
        case cooling
        case done

        var title: String {
            switch self {
            case .heating: "Heating"
            case .cooking: "Cooking"
            case .pull: "Eggs out — now"
            case .cooling: "Cooling"
            case .done: "Done"
            }
        }

        var symbol: String {
            switch self {
            case .heating: "flame.fill"
            case .cooking: "timer"
            case .pull: "bell.fill"
            case .cooling: "snowflake"
            case .done: "checkmark.circle.fill"
            }
        }

        /// Only two stages are counted down. `pull` is a moment, and `done` is
        /// an end state; a timer on either would count toward nothing.
        var countsDown: Bool {
            self == .heating || self == .cooking || self == .cooling
        }
    }
}
