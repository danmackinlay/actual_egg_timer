import Foundation

/// The words, as data: one catalogue per language, and the few lines that turn
/// a key and its arguments into a sentence. Transliterated from
/// `src/core/copy.ts`, and held to it by `fixtures/copy.json`.
///
/// Its own module rather than part of `EggTimerCore`, for one reason: the
/// widget extension needs the words and deliberately does not link the physics
/// (see `project.yml` - an extension that cannot solve cannot be wrong). The
/// app links both.
///
/// The format is deliberately small. A message is a template with named
/// placeholders, `{limit}`, and optionally one template per CLDR plural
/// category of one named count argument. No `select`, no nesting, no ICU, and
/// no String Catalogs: those would have Apple's code render the iOS copy and
/// ours render the web's, with nothing holding the two together
/// (LANGUAGE.md §2).
///
/// Like the rest of the core it does no I/O. The app reads the JSON out of its
/// bundle and hands the bytes in.
///
/// A number that goes in as a number comes out in the formatting locale -
/// "1,234" or "1 234" - through `Format.swift`, so no app formats a count by
/// hand.

/// The CLDR plural categories. English uses two, Czech four.
public enum PluralCategory: String, CaseIterable, Sendable {
    case zero, one, two, few, many, other
}

/// An argument to a message. A string goes in as it is: a name, or text the
/// app has already rendered. A number is a count, and is written in the
/// formatting locale with the decimals it has. A `Fixed` is a measurement,
/// written with exactly its decimals ("2.00"), which its plural form sees.
public enum CopyArg: Sendable, Equatable {
    case text(String)
    case number(Double)
    case fixed(Fixed)

    public static func int(_ value: Int) -> CopyArg { .number(Double(value)) }
}

public typealias CopyArgs = [String: CopyArg]

/// What the core returns instead of English: a key, and the
/// numbers the sentence needs. The app renders it, and may add arguments of its
/// own (a weekday name, say) that only a platform can answer.
public struct CopyRef: Sendable, Equatable {
    public let key: String
    public let args: [String: Double]

    public init(_ key: String, _ args: [String: Double] = [:]) {
        self.key = key
        self.args = args
    }
}

/// One message. Exactly one of `text` or `forms` is set.
public struct Message: Sendable, Equatable {
    /// The template, when the message has no count in it.
    public let text: String?
    /// The argument that picks the plural form, when it has.
    public let count: String?
    /// One template per plural category; `other` is always present.
    public let forms: [PluralCategory: String]
}

public enum CopyError: Error, CustomStringConvertible {
    case malformed(String)
    public var description: String {
        switch self {
        case .malformed(let what): "catalogue: \(what)"
        }
    }
}

public final class Catalogue: Sendable {
    /// A BCP 47 tag. Its language subtag picks the plural rule.
    public let locale: String
    public let messages: [String: Message]
    /// Where a key missing here is looked up next. English, for every other
    /// catalogue; nil for English itself.
    public let fallback: Catalogue?

    public init(locale: String, messages: [String: Message], fallback: Catalogue? = nil) {
        self.locale = locale
        self.messages = messages
        self.fallback = fallback
    }

    /// A catalogue from `copy/<locale>.json`. Fields the renderer does not read
    /// (`surface`, `example`, `note`, `apps`) are the tests' business. Throws
    /// on anything malformed, naming the key: a catalogue that half-loads would
    /// put key names on a screen.
    public convenience init(json data: Data, fallback: Catalogue? = nil) throws {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CopyError.malformed("not an object")
        }
        try self.init(object: root, fallback: fallback)
    }

    /// The same, from JSON already parsed.
    public convenience init(object root: [String: Any], fallback: Catalogue? = nil) throws {
        guard let locale = root["locale"] as? String, !locale.isEmpty else {
            throw CopyError.malformed("no locale")
        }
        guard let raw = root["messages"] as? [String: Any] else {
            throw CopyError.malformed("no messages")
        }
        var messages: [String: Message] = [:]
        for (key, value) in raw {
            messages[key] = try Self.parseMessage(key, value)
        }
        self.init(locale: locale, messages: messages, fallback: fallback)
    }

    private static func parseMessage(_ key: String, _ json: Any) throws -> Message {
        guard let m = json as? [String: Any] else { throw CopyError.malformed("\(key): not an object") }
        if let text = m["text"] as? String {
            for c in PluralCategory.allCases where m[c.rawValue] != nil {
                throw CopyError.malformed("\(key): both text and a plural form")
            }
            return Message(text: text, count: nil, forms: [:])
        }
        guard let count = m["count"] as? String, !count.isEmpty else {
            throw CopyError.malformed("\(key): neither text nor count")
        }
        var forms: [PluralCategory: String] = [:]
        for c in PluralCategory.allCases {
            guard let form = m[c.rawValue] else { continue }
            guard let string = form as? String else { throw CopyError.malformed("\(key).\(c): not a string") }
            forms[c] = string
        }
        guard forms[.other] != nil else { throw CopyError.malformed("\(key): a plural with no \"other\"") }
        return Message(text: nil, count: count, forms: forms)
    }

    /// Render a message.
    ///
    /// A key this catalogue lacks is looked up in its fallback, and the plural
    /// rule is the rule of the catalogue the message was FOUND in, since its
    /// forms are that language's. A key no catalogue has renders as the key
    /// itself, and a placeholder with no argument is left as written: both are
    /// bugs, and a bug that shows is one somebody reports.
    ///
    /// Numbers are written in `formatLocale`: the language the app speaks and
    /// the region it is in (`formattingLocale`). It defaults to the catalogue's
    /// own tag, which is what a test or a fixture wants.
    public func render(_ key: String, _ args: CopyArgs = [:], formatLocale: String? = nil) -> String {
        var found: Catalogue? = self
        while let catalogue = found, catalogue.messages[key] == nil { found = catalogue.fallback }
        guard let catalogue = found, let message = catalogue.messages[key] else { return key }
        return substitute(
            template(for: message, locale: catalogue.locale, args: args), args, formatLocale ?? locale
        )
    }

    /// Render what the core returned, with any arguments the app adds.
    public func render(_ ref: CopyRef, _ extra: CopyArgs = [:], formatLocale: String? = nil) -> String {
        var args: CopyArgs = [:]
        for (name, value) in ref.args { args[name] = .number(value) }
        for (name, value) in extra { args[name] = value }
        return render(ref.key, args, formatLocale: formatLocale)
    }

    private func template(for message: Message, locale: String, args: CopyArgs) -> String {
        if let text = message.text { return text }
        // The count must be a number. A string is not parsed, because the two
        // platforms parse strings differently, and a missing count is `other`.
        // The form is chosen for the number as it is SHOWN: rounded as
        // `formatArg` rounds it, with the decimals it is shown with.
        var category = PluralCategory.other
        switch message.count.flatMap({ args[$0] }) {
        case .number(let value):
            let d = countDecimals(value)
            category = pluralCategory(locale: locale, roundTo(value, d), fractionDigits: d)
        case .fixed(let value):
            category = pluralCategory(
                locale: locale, roundTo(value.value, value.decimals), fractionDigits: value.decimals
            )
        default:
            break
        }
        return message.forms[category] ?? message.forms[.other] ?? ""
    }
}

// MARK: - The rules

/// The CLDR plural category of a number, for a locale.
///
/// Hand-written per language, because Swift has no public equivalent of
/// `Intl.PluralRules` outside the string catalogues this repo does not use. The
/// operands are CLDR's: `i`, the integer digits, and `v`, the count of visible
/// fraction digits - the decimals the number is SHOWN with when the caller knows
/// them ("2.00" litres has v = 2), and otherwise 0 exactly when it is whole.
public func pluralCategory(locale: String, _ n: Double, fractionDigits: Int? = nil) -> PluralCategory {
    guard n.isFinite else { return .other }
    let abs = n.magnitude
    let i = abs.rounded(.down)
    let whole = fractionDigits.map { $0 == 0 && abs == i } ?? (abs == i)
    switch languageOf(locale) {
    case "en":
        // one: i = 1 and v = 0
        return i == 1 && whole ? .one : .other
    case "cs":
        // one: i = 1 and v = 0; few: i = 2..4 and v = 0; many: v != 0
        if !whole { return .many }
        if i == 1 { return .one }
        if i >= 2 && i <= 4 { return .few }
        return .other
    default:
        // A language with no rule yet: `other` is the one form every message has.
        return .other
    }
}

/// A word or phrase written to stand alone - a doneness word, a headline -
/// set down in the middle of a sentence: its first letter lower-cased in the
/// catalogue's language, and nothing else, so "Last Wednesday" becomes "last
/// Wednesday", not "last wednesday". The web's `midSentence` in src/core/copy.ts.
public func midSentence(_ text: String, locale: String) -> String {
    guard let first = text.first else { return text }
    return String(first).lowercased(with: Locale(identifier: locale)) + text.dropFirst()
}

// MARK: - Overlays

/// The regional overlays that ship, `copy/<tag>.json`: each holds only the
/// words its region says differently from its language's own catalogue. The
/// English catalogue is Australian, and an American reads
/// `en-US` over it. The web's `OVERLAYS` in src/core/copy.ts.
public let overlays: [String] = ["en-US"]

/// The region subtag of a language tag, upper-cased, or nil: the `US` of
/// `en-US`, `en_US` and `en-Latn-US`. A private-use or extension singleton
/// ends the search, so `en-x-us` names no region.
public func regionOf(_ tag: String) -> String? {
    let parts = tag.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "-" || $0 == "_" })
    var i = 1
    while i < parts.count {
        let part = parts[i]
        if i == 1 && part.count == 4 {
            i += 1
            continue
        }
        let letters = part.count == 2 && part.allSatisfy({ $0.isASCII && $0.isLetter })
        let digits = part.count == 3 && part.allSatisfy({ $0.isASCII && $0.isNumber })
        return letters || digits ? part.uppercased() : nil
    }
    return nil
}

/// The catalogues that render a language, the first consulted first, with
/// English always last, beneath everything. Modern English gains its region's
/// overlay, when one ships, for the region of the device's own English: the
/// first English tag in `preferred` (the device's languages, most wanted
/// first) if it names one, or else `region`, the device's. The English of
/// 1750 and any other language have no overlay. The web's `catalogueChain`.
public func catalogueChain(language: String, preferred: [String], region: String?) -> [String] {
    if language != "en" { return [language, "en"] }
    var wordsRegion = region
    for tag in preferred where languageOf(tag) == "en" {
        if let own = regionOf(tag) { wordsRegion = own }
        break
    }
    guard let r = wordsRegion, overlays.contains("en-" + r) else { return ["en"] }
    return ["en-" + r, "en"]
}

// MARK: - Substitution

/// An argument as text. A string as it is; a count in the locale, with its
/// own decimals; a measurement in the locale, to its decimals.
public func formatArg(_ value: CopyArg, formatLocale: String = "en") -> String {
    switch value {
    case .text(let text):
        return text
    case .number(let n):
        return formatCount(n, locale: formatLocale)
    case .fixed(let f):
        return formatNumber(f.value, decimals: f.decimals, locale: formatLocale)
    }
}

/// Replace every `{name}` that has an argument. The same scan as the web's, so
/// the two agree on every malformed brace as well as every good one.
private func substitute(_ template: String, _ args: CopyArgs, _ formatLocale: String) -> String {
    let scalars = Array(template.unicodeScalars)
    var out = String.UnicodeScalarView()
    var i = 0
    while i < scalars.count {
        if let name = placeholder(at: i, in: scalars) {
            if let value = args[name] {
                out.append(contentsOf: formatArg(value, formatLocale: formatLocale).unicodeScalars)
            } else {
                out.append(contentsOf: "{\(name)}".unicodeScalars)
            }
            i += name.unicodeScalars.count + 2
        } else {
            out.append(scalars[i])
            i += 1
        }
    }
    return String(out)
}

/// The placeholder name starting at `i`, if `{` there opens one: a letter, then
/// letters, digits or underscores, then `}`. Anything else is a literal brace.
private func placeholder(at i: Int, in scalars: [Unicode.Scalar]) -> String? {
    guard scalars[i] == "{" else { return nil }
    var j = i + 1
    guard j < scalars.count, isLetter(scalars[j]) else { return nil }
    while j < scalars.count, isNameChar(scalars[j]) { j += 1 }
    guard j < scalars.count, scalars[j] == "}" else { return nil }
    var name = String.UnicodeScalarView()
    name.append(contentsOf: scalars[(i + 1)..<j])
    return String(name)
}

private func isLetter(_ c: Unicode.Scalar) -> Bool {
    (c.value >= 65 && c.value <= 90) || (c.value >= 97 && c.value <= 122)
}

private func isNameChar(_ c: Unicode.Scalar) -> Bool {
    isLetter(c) || (c.value >= 48 && c.value <= 57) || c.value == 95
}
