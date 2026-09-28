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
    // E5's odds used to ride here, as "7/10 eggs hit the mark" on the Lock
    // Screen. Gone, on the owner's word of 28 September: mid-cook nothing
    // there can change what the cook does, so it says nothing rather than
    // spend the room on odds. An activity begun by an older build still
    // decodes, since a key nobody asks for is ignored.

    /// The cooling the cook chose, `Cooling`'s raw value: `ice`, `tap` or
    /// `counter`. The pull line names it (`pullLineKey`). A String, since this
    /// file cannot see EggTimerCore; optional, so an activity begun by an
    /// older build decodes, as the ice bath.
    var cooling: String? = nil

    /// The pull's line, in the alarm and on the card alike: into the ice bath,
    /// under the cold tap, or onto the counter, as the cook chose - never "the
    /// cooling", which is this app's word and not the cook's.
    static func pullLineKey(cooling: String?) -> String {
        switch cooling {
        case "tap": "alarm.pull.bodyTap"
        case "counter": "alarm.pull.bodyCounter"
        default: "alarm.pull.bodyIce"
        }
    }
    /// The catalogue the cook was started in, `en` or `en-x-1750` (F6). The
    /// widget cannot read the app's settings, so the activity carries its
    /// language as it carries its units. Optional, so an activity begun by
    /// an older build decodes, as English.
    var lang: String? = nil

    enum Stage: String, Codable, Hashable {
        case heating
        case cooking
        case pull
        case cooling
        case done

        /// The stage's name, in the activity's language.
        func title(in lang: String?) -> String {
            switch self {
            case .heating: tr("activity.stage.heating", in: lang)
            case .cooking: tr("activity.stage.cooking", in: lang)
            case .pull: tr("activity.stage.pull", in: lang)
            case .cooling: tr("activity.stage.cooling", in: lang)
            case .done: tr("activity.stage.done", in: lang)
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
