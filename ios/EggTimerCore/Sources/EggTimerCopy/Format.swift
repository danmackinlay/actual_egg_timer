import Foundation

/// Numbers and times of day, as a locale writes them: "1,234.5" or "1 234,5",
/// "3:05 PM" or "15:05". Transliterated from `src/core/format.ts`, and held to
/// it by `fixtures/format.json`.
///
/// Foundation does the formatting here, `Intl` does it on the web, and what
/// this file owns is making the two give the same bytes:
///
///  - The rounding is done here, before the formatter sees the number, by the
///    same `floor(x + 0.5)` the units use. `NumberFormatter` rounds to even by
///    default and `Intl` away from zero; a number already on its decimal grid
///    leaves neither anything to decide.
///  - Zero has no sign. Both platforms print -0 as "-0".
///  - A time of day spells every space as U+202F, which is what Foundation
///    prints before "PM" and what CLDR says. V8 prints a plain space there, and
///    the web side normalises to this.
///  - A time of day never zero-pads its hour: "9:05", not "09:05", in every
///    locale (the owner, 27 September). `unpadHour` does it, here and on the
///    web, after the platform has formatted.
///
/// Every formatter is given an explicit locale and UTC, and a time of day is
/// seconds after midnight, so the answer depends on nothing but the arguments:
/// not on the device's locale, its time zone or its clock. Those are the app's
/// to read (`Copy.formatLocale`).

/// A number with the count of decimals it is shown to - a displayed
/// measurement, "2.00" litres - as distinct from a count, which shows only the
/// decimals it has. The plural rule sees the decimals too: CLDR counts visible
/// fraction digits, so "2,00" litres is Czech `many`, not `few`.
public struct Fixed: Sendable, Equatable {
    public let value: Double
    public let decimals: Int

    public init(_ value: Double, decimals: Int) {
        self.value = value
        self.decimals = decimals
    }
}

/// The most decimals a count is shown with: `Intl`'s own default.
let countMaxDecimals = 3

/// The space every time of day uses between its parts: U+202F.
let timeSpace: Unicode.Scalar = "\u{202F}"

// MARK: - Numbers

/// A value rounded to a number of decimals, halves up, as the web does it.
/// Never -0.
public func roundTo(_ value: Double, _ decimals: Int) -> Double {
    var scale = 1.0
    for _ in 0..<max(0, decimals) { scale *= 10 }
    let r = (value * scale + 0.5).rounded(.down) / scale
    return r == 0 ? 0 : r
}

/// How many decimals a count shows: the fewest, up to three, that say it
/// exactly once it is rounded to three.
public func countDecimals(_ value: Double) -> Int {
    guard value.isFinite else { return 0 }
    let v = roundTo(value, countMaxDecimals)
    for d in 0..<countMaxDecimals where roundTo(v, d) == v { return d }
    return countMaxDecimals
}

/// A number in a locale, to exactly `decimals` places, grouped as the locale
/// groups. Not a number is a bug, and prints as JavaScript prints it.
public func formatNumber(_ value: Double, decimals: Int, locale: String) -> String {
    let v = roundTo(value, decimals)
    guard v.isFinite else { return v.isNaN ? "NaN" : (v > 0 ? "Infinity" : "-Infinity") }
    return Formatters.shared.number(locale: locale, decimals: decimals).string(from: NSNumber(value: v)) ?? "\(v)"
}

/// A count - a number of eggs, of seconds - in a locale: its own decimals, up
/// to three.
public func formatCount(_ value: Double, locale: String) -> String {
    formatNumber(value, decimals: countDecimals(value), locale: locale)
}

// MARK: - Time of day

/// A wall-clock time in a locale's own short form: "3:05 PM" in en-US, "15:05"
/// in en-GB and Czech, and with the seconds, "7:41:12 AM". Given as seconds
/// after midnight, which the app reads off its own calendar in its own time
/// zone; this only writes it down.
///
/// The locale's short and medium time STYLES, not a template of fields: a
/// template lets `Intl` and Foundation pick different hour widths, where a
/// style is the locale's own pattern. Then the hour loses any leading zero
/// (`unpadHour`), so en-GB writes "9:05" and "0:05", as Czech does.
///
/// Not the countdown. "7:44" on the timer is a duration, and stays as the apps
/// build it.
public func formatTimeOfDay(_ secondsOfDay: Double, withSeconds: Bool, locale: String) -> String {
    let whole = Int(secondsOfDay.rounded(.down))
    let s = ((whole % 86400) + 86400) % 86400
    let formatter = Formatters.shared.time(locale: locale, withSeconds: withSeconds)
    return unpadHour(normaliseTime(formatter.string(from: Date(timeIntervalSince1970: Double(s)))))
}

/// A time of day with no leading zero on its hour: "09:05" -> "9:05", "00:05"
/// -> "0:05". The hour is the first run of digits, which in every CLDR time
/// style comes before the minutes. Only a two-digit run starting with 0
/// changes, and only ASCII digits count. Transliterated from the web's.
public func unpadHour(_ text: String) -> String {
    let scalars = Array(text.unicodeScalars)
    var i = 0
    while i < scalars.count, !isAsciiDigit(scalars[i]) { i += 1 }
    guard i + 1 < scalars.count, scalars[i] == "0", isAsciiDigit(scalars[i + 1]) else { return text }
    var out = String.UnicodeScalarView()
    out.append(contentsOf: scalars[..<i])
    out.append(contentsOf: scalars[(i + 1)...])
    return String(out)
}

private func isAsciiDigit(_ c: Unicode.Scalar) -> Bool {
    c.value >= 48 && c.value <= 57
}

/// Every space in a time of day as U+202F.
public func normaliseTime(_ text: String) -> String {
    var out = String.UnicodeScalarView()
    for c in text.unicodeScalars {
        out.append(c == " " || c == "\u{00A0}" || c == timeSpace ? timeSpace : c)
    }
    return String(out)
}

// MARK: - The formatting locale

/// The language subtag, lower-cased: "en" for "en-GB-x-1750". It picks the
/// plural rule in Copy.swift, and the language of the formatting locale here.
/// The web's `languageOf` in src/core/format.ts.
public func languageOf(_ locale: String) -> String {
    let language = locale.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
    return String(language).lowercased()
}

/// A 12- or 24-hour preference the device holds apart from its region, as a
/// BCP 47 `hc` value.
public enum HourCycle: String, Sendable, CaseIterable {
    case h11, h12, h23, h24
}

/// Languages that write numbers one way wherever they are read, and the region
/// whose conventions those are: a Czech UI formats as `cs-CZ` in any region.
/// A language not listed takes the device's region, as English does (`en-DE`
/// writes "2,4"). The same list as the web's `OWN_CONVENTION`.
let ownConvention: [String: String] = ["cs": "CZ"]

/// The locale numbers and times are formatted in: the language the app speaks,
/// in the region the device is in unless the language has a convention of its
/// own (`ownConvention`), with the device's own 12/24-hour setting where it
/// differs from the region's. The same function as the web's, so the two apps
/// derive the same tag from the same facts.
public func formattingLocale(uiLanguage: String, region: String?, hourCycle: HourCycle?) -> String {
    var tag = languageOf(uiLanguage)
    if tag.isEmpty || !isLanguage(tag) { tag = "en" }
    if let home = ownConvention[tag] {
        tag += "-" + home
    } else if let region, isRegion(region) {
        tag += "-" + region.uppercased()
    }
    if let hourCycle { tag += "-u-hc-" + hourCycle.rawValue }
    return tag
}

private func isLanguage(_ s: String) -> Bool {
    let scalars = Array(s.unicodeScalars)
    guard scalars.count >= 2, scalars.count <= 3 else { return false }
    return scalars.allSatisfy { $0.value >= 97 && $0.value <= 122 }
}

private func isRegion(_ s: String) -> Bool {
    let scalars = Array(s.unicodeScalars)
    if scalars.count == 2 {
        return scalars.allSatisfy { let c = $0.value | 32; return c >= 97 && c <= 122 }
    }
    if scalars.count == 3 {
        return scalars.allSatisfy { $0.value >= 48 && $0.value <= 57 }
    }
    return false
}

// MARK: - The formatters

/// Foundation's formatters are costly to make and safe to share once made, so
/// each locale's are made once. The app renders a handful of numbers several
/// times a second.
private final class Formatters: @unchecked Sendable {
    static let shared = Formatters()

    private let lock = NSLock()
    private var numbers: [String: NumberFormatter] = [:]
    private var times: [String: DateFormatter] = [:]

    func number(locale: String, decimals: Int) -> NumberFormatter {
        lock.lock()
        defer { lock.unlock() }
        let key = "\(locale)|\(decimals)"
        if let f = numbers[key] { return f }
        let f = NumberFormatter()
        f.locale = Locale(identifier: locale)
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        // The number is already rounded; this only matters if it is not, and
        // then it is what `Intl` does.
        f.roundingMode = .halfUp
        numbers[key] = f
        return f
    }

    func time(locale: String, withSeconds: Bool) -> DateFormatter {
        lock.lock()
        defer { lock.unlock() }
        let key = "\(locale)|\(withSeconds)"
        if let f = times[key] { return f }
        let f = DateFormatter()
        f.locale = Locale(identifier: locale)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateStyle = .none
        f.timeStyle = withSeconds ? .medium : .short
        times[key] = f
        return f
    }
}
