/// The pull's line, in the alarm and on the Lock Screen card alike: into the
/// ice bath, under the cold tap, into the bowl, or onto the counter, as the
/// cook chose - never "the cooling", which is this app's word and not the
/// cook's.
///
/// `cooling` is `Cooling`'s raw value (`ice`, `tap`, `bowl` or `counter`), as
/// a String because the widget, which draws the card, does not link the
/// physics.
/// Anything else is the ice bath.
///
/// Here, and not in the alarm (ios/App) and the widget that both say it, so
/// `swift test` holds which line each cooling gets (`PullLineTests`): those
/// two are checked only by driving them.
public func pullLineKey(cooling: String) -> CopyKey {
    switch cooling {
    case "tap": .`alarm.pull.bodyTap`
    case "bowl": .`alarm.pull.bodyBowl`
    case "counter": .`alarm.pull.bodyCounter`
    default: .`alarm.pull.bodyIce`
    }
}
