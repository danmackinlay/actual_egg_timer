import SwiftUI
import WidgetKit

/// The extension's entry point. One widget, and it is not a home-screen widget:
/// a Live Activity is the only thing here, because the only thing this app has
/// to say when you are not looking at it is how long the egg has left.
@main
struct EggTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        CookLiveActivity()
    }
}
