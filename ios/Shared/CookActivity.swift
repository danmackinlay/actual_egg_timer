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
    /// The peak yolk temperature and the egg's mass, already in the cook's
    /// units with the unit attached ("65 °C", "2.4 oz"). The widget has no
    /// physics and no units table, so it is handed the words, not the numbers.
    var peakYolk: String
    var eggMass: String
    /// "7/10 eggs hit the mark" (E5), already in words, or nil when the cook
    /// was started before the odds were known.
    var odds: String?
    /// True when the eggs rest on the counter after the pull. There is then no
    /// cooling step to send them into, so the pull note says so. Optional, so
    /// an activity begun by an older build decodes as not resting.
    var restsOnCounter: Bool? = nil

    enum Stage: String, Codable, Hashable {
        case heating
        case cooking
        case pull
        case cooling
        case done

        var title: String {
            switch self {
            case .heating: tr("activity.stage.heating")
            case .cooking: tr("activity.stage.cooking")
            case .pull: tr("activity.stage.pull")
            case .cooling: tr("activity.stage.cooling")
            case .done: tr("activity.stage.done")
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
