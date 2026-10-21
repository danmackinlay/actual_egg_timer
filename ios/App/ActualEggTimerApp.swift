import SwiftUI
import UIKit
import UserNotifications
import EggTimerApp

@main
struct ActualEggTimerApp: App {
    init() {
        #if DEBUG
        // `-resetState`: a UI test's first launch, from what a fresh install
        // has, before anything is read.
        if DebugLog.resetState { Self.resetState() }
        #endif
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

    #if DEBUG
    /// What a fresh install has, without one (`-resetState`, DebugLog.swift):
    /// the stores' suite and the standard domain emptied, every notification
    /// pending or shown removed, and any Live Activity ended. Notification
    /// permission is the system's, and stays as it was.
    private static func resetState() {
        let defaults = UserDefaults.standard
        defaults.removePersistentDomain(forName: Stores.suite)
        if let id = Bundle.main.bundleIdentifier { defaults.removePersistentDomain(forName: id) }
        let centre = UNUserNotificationCenter.current()
        centre.removeAllPendingNotificationRequests()
        centre.removeAllDeliveredNotifications()
        Task { await LiveActivity.endAll() }
    }
    #endif
}
