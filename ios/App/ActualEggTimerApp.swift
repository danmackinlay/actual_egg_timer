import SwiftUI

@main
struct ActualEggTimerApp: App {
    init() {
        // Before anything is written: whether a newer build has run on this
        // phone, and the mark brought up to this one if not (DECISIONS.md 100).
        Stores.claim()
        // The cook's language, before anything is drawn in it.
        LanguageChoice.shared.start()
        #if DEBUG
        // A clock a script steps from outside (`AppClock`).
        AppClock.listen()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
