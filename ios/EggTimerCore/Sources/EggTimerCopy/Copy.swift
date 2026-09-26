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

/// The CLDR plural categories. English uses two, Czech four.
public enum PluralCategory: String, CaseIterable, Sendable {
    case zero, one, two, few, many, other
}

/// An argument to a message. A string goes in as it is - the app has already
/// formatted it - and a number goes in as its plain decimal digits.
public enum CopyArg: Sendable, Equatable {
    case text(String)
    case number(Double)

    public static func int(_ value: Int) -> CopyArg { .number(Double(value)) }
}

public typealias CopyArgs = [String: CopyArg]

/// What the core returns where it used to return English: a key, and the
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

    /// Every template: the text, or each plural form in CLDR order.
    public var templates: [String] {
        if let text { return [text] }
        return PluralCategory.allCases.compactMap { forms[$0] }
    }
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
    public func render(_ key: String, _ args: CopyArgs = [:]) -> String {
        var found: Catalogue? = self
        while let catalogue = found, catalogue.messages[key] == nil { found = catalogue.fallback }
        guard let catalogue = found, let message = catalogue.messages[key] else { return key }
        return substitute(template(for: message, locale: catalogue.locale, args: args), args)
    }

    /// Render what the core returned, with any arguments the app adds.
    public func render(_ ref: CopyRef, _ extra: CopyArgs = [:]) -> String {
        var args: CopyArgs = [:]
        for (name, value) in ref.args { args[name] = .number(value) }
        for (name, value) in extra { args[name] = value }
        return render(ref.key, args)
    }

    private func template(for message: Message, locale: String, args: CopyArgs) -> String {
        if let text = message.text { return text }
        // The count must be a number. A string is not parsed, because the two
        // platforms parse strings differently, and a missing count is `other`.
        let n: Double
        if case .number(let value) = message.count.flatMap({ args[$0] }) { n = value } else { n = .nan }
        return message.forms[pluralCategory(locale: locale, n)] ?? message.forms[.other] ?? ""
    }
}

// MARK: - The rules

/// The CLDR plural category of a number, for a locale.
///
/// Hand-written per language, because Swift has no public equivalent of
/// `Intl.PluralRules` outside the string catalogues this repo does not use. The
/// operands are CLDR's: `i`, the integer digits, and `v`, the count of visible
/// fraction digits, which is 0 exactly when the number is whole.
public func pluralCategory(locale: String, _ n: Double) -> PluralCategory {
    guard n.isFinite else { return .other }
    let abs = n.magnitude
    let i = abs.rounded(.down)
    let whole = abs == i
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

/// The language subtag, lower-cased: "en" for "en-GB-x-1750".
public func languageOf(_ locale: String) -> String {
    let language = locale.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
    return String(language).lowercased()
}

// MARK: - Substitution

/// A number as an argument: its plain decimal digits, no grouping, a point for
/// a fraction. Whole numbers are exact at any size, as `toFixed(0)` is on the
/// web; a fraction is Swift's shortest round-trip form, which agrees with
/// JavaScript's for every plain decimal and differs only in exponent notation
/// (1e-07 against 1e-7) - F4's formatters replace this before that could
/// matter.
public func formatArg(_ value: CopyArg) -> String {
    switch value {
    case .text(let text):
        return text
    case .number(let n):
        if n == 0 { return "0" }
        if n.isFinite && n == n.rounded(.towardZero) { return String(format: "%.0f", n) }
        return "\(n)"
    }
}

/// Replace every `{name}` that has an argument. The same scan as the web's, so
/// the two agree on every malformed brace as well as every good one.
private func substitute(_ template: String, _ args: CopyArgs) -> String {
    let scalars = Array(template.unicodeScalars)
    var out = String.UnicodeScalarView()
    var i = 0
    while i < scalars.count {
        if let name = placeholder(at: i, in: scalars) {
            if let value = args[name] {
                out.append(contentsOf: formatArg(value).unicodeScalars)
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

/// Every placeholder a template uses, in order of first use.
public func placeholders(_ template: String) -> [String] {
    let scalars = Array(template.unicodeScalars)
    var names: [String] = []
    for i in scalars.indices {
        if let name = placeholder(at: i, in: scalars), !names.contains(name) { names.append(name) }
    }
    return names
}
