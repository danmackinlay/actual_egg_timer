import SwiftUI
import UIKit
import EggTimerApp

@main
struct ActualEggTimerApp: App {
    init() {
        // Where this install's stores are, for the UI tests, which cannot see
        // the container otherwise.
        DebugLog.log(.launched(home: NSHomeDirectory()))
        // First: what the app's logic (EggTimerApp) reaches of the phone,
        // before any of it runs (`Services`). The tests put fakes here.
        Services.alarm = Alarm.shared
        Services.ringer = Ringer.shared
        Services.sharing = Sharing.shared
        Services.card = LiveActivityCard()
        Services.announce = { UIAccessibility.post(notification: .announcement, argument: $0.string) }
        DebugLog.appActive = { UIApplication.shared.applicationState == .active }
        // Before anything is written: what 0.5.1 kept of sharing and the
        // learning in the standard domain carried into the suite, so what it
        // sent can still be deleted and what it learned is kept; then the
        // keys no build reads any more deleted.
        Stores.carryOver()
        Stores.sweep()
        // The cook's language, before anything is drawn in it.
        LanguageChoice.shared.start()
        // A clock a script steps from outside (`AppClock`).
        AppClock.listen()
        // A debug build says what it found of the alarms' sound files: each
        // there, under 30 s, playable.
        Ringer.logFiles()
        #if DEBUG
        // `-alarmTest`: the alarms without a cook, to hear them.
        AlarmTest.start()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
