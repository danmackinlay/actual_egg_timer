import SwiftUI

@main
struct ActualEggTimerApp: App {
    init() {
        // The cook's language, before anything is drawn in it (F6).
        LanguageChoice.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
