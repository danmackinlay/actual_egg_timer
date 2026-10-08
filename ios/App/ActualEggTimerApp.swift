import SwiftUI

@main
struct ActualEggTimerApp: App {
    init() {
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
