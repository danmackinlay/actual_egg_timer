import Foundation
import Observation
import os
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
/// Linked by both targets, like `CookActivity`: the widget draws the Live
/// Activity's words from the same catalogue as the app. The widget does not
/// read the app's language; the activity carries the tag it was started in,
/// and the widget renders in that (`tr(_:_:in:)`).
public enum Copy {
    /// The language the app speaks: a catalogue's tag, `en` or `en-x-1750`
    /// (LANGUAGE.md §6). Set by `LanguageChoice` in the app, from the
    /// picker and the units switch; the widget never sets it.
    ///
    /// Reading it is observed: a view whose body calls `tr` depends on it, so
    /// a change of language redraws every word on screen in place, with no
    /// relaunch and nothing thrown away.
    public static var activeLocale: String { Active.shared.locale }

    /// Speak another catalogue from now on. A tag with no catalogue in the
    /// bundle is refused, and English stays.
    public static func use(_ locale: String) {
        guard locale != Active.shared.locale, bundled(locale) else { return }
        Active.shared.locale = locale
    }

    /// The active catalogue, with English beneath it for any key it lacks.
    public static var catalogue: Catalogue { catalogue(for: activeLocale) }

    /// The catalogues that render a language, each over the next, as
    /// `catalogueChain` names them: `en-x-1750` over English, and on a phone
    /// whose English is American, `en-US` over English, the few words an
    /// American kitchen says differently. The language stays `en` either way;
    /// only the words move. English itself for a tag the bundle has no file
    /// for. Loaded once each, and kept.
    public static func catalogue(for locale: String) -> Catalogue {
        if let hit = loaded.withLock({ $0[locale] }) { return hit }
        let chain = catalogueChain(
            language: bundled(locale) ? locale : "en",
            preferred: Locale.preferredLanguages,
            region: Locale.current.region?.identifier
        )
        // The chain ends in English, beneath everything.
        var catalogue = load("en", fallback: nil)
        for tag in chain.dropLast().reversed() where bundled(tag) {
            catalogue = load(tag, fallback: catalogue)
        }
        let found = catalogue
        loaded.withLock { $0[locale] = found }
        return found
    }

    /// The locale numbers and times are written in, for the language on
    /// screen: see `formatLocale(for:)`.
    public static var formatLocale: String { formatLocale(for: activeLocale) }

    /// The locale numbers and times are written in: the UI's language, in the
    /// phone's region, with the phone's own 12/24-hour setting when it differs
    /// from the region's - an Australian iPhone set to 24-hour time gets
    /// `en-AU-u-hc-h23`, and "15:05" where en-AU alone would say "3:05 pm".
    /// Derived by the same core function as the web's (`formattingLocale`); the
    /// web has no hour-cycle setting to read, so there the region's stands.
    /// The English of 1750 formats as English does: `formattingLocale` drops
    /// the private-use subtag, so an American in 1750 keeps their clock.
    ///
    /// Worked out once per language. A change of region or clock in Settings
    /// relaunches the app on iOS anyway.
    public static func formatLocale(for locale: String) -> String {
        if let hit = formats.withLock({ $0[locale] }) { return hit }
        let region = Locale.current.region?.identifier
        let plain = formattingLocale(uiLanguage: locale, region: region, hourCycle: nil)
        let own = Locale.current.hourCycle
        var tag = plain
        if own != Locale(identifier: plain).hourCycle {
            let hourCycle: HourCycle? = switch own {
            case .zeroToEleven: .h11
            case .oneToTwelve: .h12
            case .zeroToTwentyThree: .h23
            case .oneToTwentyFour: .h24
            @unknown default: nil
            }
            tag = formattingLocale(uiLanguage: locale, region: region, hourCycle: hourCycle)
        }
        let found = tag
        formats.withLock { $0[locale] = found }
        return found
    }

    private static let loaded = OSAllocatedUnfairLock<[String: Catalogue]>(initialState: [:])
    private static let formats = OSAllocatedUnfairLock<[String: String]>(initialState: [:])

    /// The folder the catalogues are read from, when it is not the bundle's:
    /// the repository's copy/, for the tests, which have no app bundle. Set
    /// before the first word is rendered.
    nonisolated(unsafe) public static var folder: URL?

    private static func url(_ locale: String) -> URL? {
        guard let folder else { return Bundle.main.url(forResource: locale, withExtension: "json", subdirectory: "copy") }
        let file = folder.appendingPathComponent(locale).appendingPathExtension("json")
        return FileManager.default.fileExists(atPath: file.path) ? file : nil
    }

    private static func bundled(_ locale: String) -> Bool { url(locale) != nil }

    private static func load(_ locale: String, fallback: Catalogue?) -> Catalogue {
        guard let url = url(locale), let data = try? Data(contentsOf: url) else {
            fatalError("copy/\(locale).json is not in the bundle - see the copy folder in ios/project.yml")
        }
        do {
            return try Catalogue(json: data, fallback: fallback)
        } catch {
            fatalError("copy/\(locale).json: \(error)")
        }
    }

    /// The tag on screen, as something SwiftUI can watch. Written by hand
    /// rather than with `@Observable` because `tr` is called from every
    /// isolation there is - views, the alarm's scheduling, the widget - and
    /// the macro's storage is not safe to read from all of them; a lock is.
    private final class Active: Observable, @unchecked Sendable {
        static let shared = Active()
        private let registrar = ObservationRegistrar()
        private let tag = OSAllocatedUnfairLock(initialState: "en")

        var locale: String {
            get {
                registrar.access(self, keyPath: \.locale)
                return tag.withLock { $0 }
            }
            set {
                registrar.withMutation(of: self, keyPath: \.locale) { tag.withLock { $0 = newValue } }
            }
        }
    }
}

/// A message, rendered, with its numbers in the formatting locale. In the
/// language on screen, or in `locale` when one is given: the widget renders
/// in the language the cook was started in.
public func tr(_ key: String, _ args: CopyArgs = [:], in locale: String? = nil) -> String {
    let tag = locale ?? Copy.activeLocale
    return Copy.catalogue(for: tag).render(key, args, formatLocale: Copy.formatLocale(for: tag))
}

/// What the core returned, rendered, with any arguments only the app can supply.
public func tr(_ ref: CopyRef, _ extra: CopyArgs = [:]) -> String {
    Copy.catalogue.render(ref, extra, formatLocale: Copy.formatLocale)
}

/// A wall-clock time in the phone's time zone and the formatting locale's
/// clock: "3:05 PM", "15:05". Not the countdown, which is a duration and is
/// m:ss everywhere.
public func timeOfDay(_ date: Date, withSeconds: Bool = false) -> String {
    let c = Calendar.current.dateComponents([.hour, .minute, .second], from: date)
    let seconds = Double((c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + (c.second ?? 0))
    return formatTimeOfDay(seconds, withSeconds: withSeconds, locale: Copy.formatLocale)
}

/// A plain number in the formatting locale: a count on a control.
public func countText(_ value: Double, decimals: Int = 0) -> String {
    formatNumber(value, decimals: decimals, locale: Copy.formatLocale)
}
