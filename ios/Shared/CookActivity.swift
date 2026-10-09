import ActivityKit
import Foundation

/// The contract between the app and the Live Activity.
///
/// This file is compiled into BOTH targets, which is why it imports only
/// ActivityKit and Foundation: the widget extension has no physics and needs
/// none. Everything here has already been solved by the time the app hands it
/// over.
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
        /// True while the slow hob has lengthened the guess: the card counts
        /// the time heated up from `began`, the start, rather than down to a
        /// pull that keeps moving, which would read 0:00 while the water
        /// still heats; `ends` is then when the guess gives out.
        var countsUp: Bool = false
        /// What is being cooked, as the plan now has it. In the state, not
        /// the attributes, so that a plan made again - the boil tapped, a
        /// slow hob, and later a correction - updates the card in place.
        var cook: Description
    }

    /// The cook the card describes: what was asked for, not what is left.
    struct Description: Codable, Hashable {
        var doneness: String
        /// The peak yolk temperature and the egg's mass, already in the
        /// cook's units with the unit attached ("65 °C", "2.4 oz"). The widget
        /// has no physics and no units table, so it is handed the words, not
        /// the numbers.
        var peakYolk: String
        var eggMass: String
        /// The cooling the cook chose, `Cooling`'s raw value: `ice`, `tap` or
        /// `counter`. The pull line names it (`pullLineKey`, in
        /// EggTimerCopy). A String, since this file cannot see EggTimerCore.
        var cooling: String
    }

    /// The catalogue the cook was started in, `en` or `en-x-1750`: fixed for
    /// the life of the card. The widget cannot read the app's settings, so
    /// the activity carries its language as it carries its units.
    var lang: String

    // No odds: mid-cook nothing on the Lock Screen can change what the cook
    // does, so it says nothing rather than spend the room on them.

    enum Stage: String, Codable, Hashable {
        case heating
        case cooking
        case pull
        case cooling

        /// The stage's name, in the activity's language.
        func title(in lang: String) -> String {
            switch self {
            case .heating: tr("activity.stage.heating", in: lang)
            case .cooking: tr("activity.stage.cooking", in: lang)
            case .pull: tr("activity.stage.pull", in: lang)
            case .cooling: tr("activity.stage.cooling", in: lang)
            }
        }

        var symbol: String {
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
        var countsDown: Bool {
            self == .heating || self == .cooking || self == .cooling
        }
    }
}
