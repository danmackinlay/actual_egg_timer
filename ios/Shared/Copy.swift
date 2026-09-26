import Foundation
import EggTimerCopy

/// The app's words: which catalogue is active, and `tr`, which everything that
/// puts a string on screen goes through.
///
/// The catalogue is `copy/<locale>.json` at the root of the repository, the
/// same file the web app fetches, bundled into the app AND the widget
/// extension by `project.yml`. It is rendered by `EggTimerCopy`, which is held
/// to the web's renderer by `fixtures/copy.json`. Not a String Catalog, on
/// purpose: that would have Apple's code render the iOS copy and ours render
/// the web's, and nothing would hold the two together (LANGUAGE.md §2).
///
/// Compiled into both targets, like `CookActivity`: the widget draws the Live
/// Activity's words from the same catalogue as the app.
enum Copy {
    /// The language the app speaks. Plumbing only, for now: English is the only
    /// catalogue, and a picker with one row in it would be a control that does
    /// nothing. The in-app picker arrives with Czech (PLAN.md, F1 and F5) and
    /// sets this; everything renders through `tr`, so nothing else changes.
    static let activeLocale = "en"

    /// The active catalogue, with English beneath it for any key it lacks.
    static let catalogue: Catalogue = {
        let english = load("en", fallback: nil)
        return activeLocale == "en" ? english : load(activeLocale, fallback: english)
    }()

    private static func load(_ locale: String, fallback: Catalogue?) -> Catalogue {
        guard let url = Bundle.main.url(forResource: locale, withExtension: "json", subdirectory: "copy"),
              let data = try? Data(contentsOf: url) else {
            fatalError("copy/\(locale).json is not in the bundle - see the copy folder in ios/project.yml")
        }
        do {
            return try Catalogue(json: data, fallback: fallback)
        } catch {
            fatalError("copy/\(locale).json: \(error)")
        }
    }
}

/// A message, rendered.
func tr(_ key: String, _ args: CopyArgs = [:]) -> String {
    Copy.catalogue.render(key, args)
}

/// What the core returned, rendered, with any arguments only the app can supply.
func tr(_ ref: CopyRef, _ extra: CopyArgs = [:]) -> String {
    Copy.catalogue.render(ref, extra)
}
