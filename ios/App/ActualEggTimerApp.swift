import SwiftUI

@main
struct ActualEggTimerApp: App {
    init() {
        // The cook's language, before anything is drawn in it.
        LanguageChoice.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
