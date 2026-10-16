import SwiftUI
import UIKit
import EggTimerApp

@main
struct ActualEggTimerApp: App {
    init() {
        // First: what the app's logic (EggTimerApp) reaches of the phone,
        // before any of it runs (`Services`). The tests put fakes here.
        Services.alarm = Alarm.shared
        Services.ringer = Ringer.shared
        Services.sharing = Sharing.shared
        Services.card = LiveActivityCard()
        Services.announce = { UIAccessibility.post(notification: .announcement, argument: $0) }
        Screenshots.appActive = { UIApplication.shared.applicationState == .active }
        // Before anything is written: the keys no build reads any more
        // deleted.
        Stores.sweep()
        // The cook's language, before anything is drawn in it.
        LanguageChoice.shared.start()
        // A clock a script steps from outside (`AppClock`).
        AppClock.listen()
        // Help's sources come from a bundled file; a debug build says how
        // many it found, which a missing file would make none.
        Screenshots.log(.helpSources(count: HelpSource.all.count))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
