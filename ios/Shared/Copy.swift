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

    /// The locale numbers and times are written in: the UI's language, in the
    /// phone's region, with the phone's own 12/24-hour setting when it differs
    /// from the region's - an Australian iPhone set to 24-hour time gets
    /// `en-AU-u-hc-h23`, and "15:05" where en-AU alone would say "3:05 pm".
    /// Derived by the same core function as the web's (`formattingLocale`); the
    /// web has no hour-cycle setting to read, so there the region's stands.
    ///
    /// Read once, like the catalogue. A change of region or clock in Settings
    /// relaunches the app on iOS anyway.
    static let formatLocale: String = {
        let region = Locale.current.region?.identifier
        let regional = Locale(identifier: formattingLocale(uiLanguage: activeLocale, region: region, hourCycle: nil))
        let own = Locale.current.hourCycle
        guard own != regional.hourCycle else {
            return formattingLocale(uiLanguage: activeLocale, region: region, hourCycle: nil)
        }
        let hourCycle: HourCycle? = switch own {
        case .zeroToEleven: .h11
        case .oneToTwelve: .h12
        case .zeroToTwentyThree: .h23
        case .oneToTwentyFour: .h24
        @unknown default: nil
        }
        return formattingLocale(uiLanguage: activeLocale, region: region, hourCycle: hourCycle)
    }()

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

/// A message, rendered, with its numbers in the formatting locale.
func tr(_ key: String, _ args: CopyArgs = [:]) -> String {
    Copy.catalogue.render(key, args, formatLocale: Copy.formatLocale)
}

/// What the core returned, rendered, with any arguments only the app can supply.
func tr(_ ref: CopyRef, _ extra: CopyArgs = [:]) -> String {
    Copy.catalogue.render(ref, extra, formatLocale: Copy.formatLocale)
}

/// A wall-clock time in the phone's time zone and the formatting locale's
/// clock: "3:05 PM", "15:05". Not the countdown, which is a duration and is
/// m:ss everywhere.
func timeOfDay(_ date: Date, withSeconds: Bool = false) -> String {
    let c = Calendar.current.dateComponents([.hour, .minute, .second], from: date)
    let seconds = Double((c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + (c.second ?? 0))
    return formatTimeOfDay(seconds, withSeconds: withSeconds, locale: Copy.formatLocale)
}

/// A plain number in the formatting locale: a count on a control.
func countText(_ value: Double, decimals: Int = 0) -> String {
    formatNumber(value, decimals: decimals, locale: Copy.formatLocale)
}
