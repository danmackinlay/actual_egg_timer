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
        // Before anything is written: whether a newer build has run on this
        // phone, and the mark brought up to this one if not (DECISIONS.md 100),
        // and then the keys no build reads any more deleted.
        Stores.claim()
        // The cook's language, before anything is drawn in it.
        LanguageChoice.shared.start()
        // A clock a script steps from outside (`AppClock`).
        AppClock.listen()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
