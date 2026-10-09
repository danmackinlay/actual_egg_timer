/// The pull's line, in the alarm and on the Lock Screen card alike: into the
/// ice bath, under the cold tap, or onto the counter, as the cook chose - never
/// "the cooling", which is this app's word and not the cook's.
///
/// `cooling` is `Cooling`'s raw value (`ice`, `tap` or `counter`), as a String
/// because the widget, which draws the card, does not link the physics.
/// Anything else is the ice bath.
///
/// Here, and not in the app, so `swift test` holds which line each cooling
/// gets (`PullLineTests`); the iOS app project has no test target.
public func pullLineKey(cooling: String) -> String {
    switch cooling {
    case "tap": "alarm.pull.bodyTap"
    case "counter": "alarm.pull.bodyCounter"
    default: "alarm.pull.bodyIce"
    }
}
