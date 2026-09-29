import Testing
import Foundation
@testable import EggTimerCopy

/// Conformance against `fixtures/copy.json`.
///
/// Every string both apps draw goes through a renderer, and there are two of
/// them: `src/core/copy.ts` for the web and `EggTimerCopy` here. This holds the
/// second to the first byte for byte - every key of every shipped catalogue at
/// its example arguments and at a dozen counts, the plural rule of every
/// language at its edges, and a probe catalogue that exercises the fallback,
/// the missing argument and every malformed brace.
///
/// The catalogues are read from `copy/` in the repository, as the fixtures are,
/// so the one the app bundles is the one tested here.
@Suite("The copy renderer matches the reference implementation")
struct CopyConformance {
    private static func catalogue(_ locale: String) throws -> Catalogue {
        try Fixtures.catalogue(locale, fallback: locale == "en" ? nil : Fixtures.catalogue("en"))
    }

    /// One argument as the fixture writes it: a string, a number, or a
    /// measurement as `{ "value": 2, "decimals": 2 }`.
    static func arg(_ value: Any) -> CopyArg? {
        if let string = value as? String { return .text(string) }
        if let number = value as? NSNumber { return .number(number.doubleValue) }
        if let fixed = value as? [String: Any], let v = fixed["value"] as? NSNumber,
           let d = fixed["decimals"] as? NSNumber {
            return .fixed(Fixed(v.doubleValue, decimals: d.intValue))
        }
        return nil
    }

    static func args(_ json: Any?) throws -> CopyArgs {
        var out: CopyArgs = [:]
        for (name, value) in (json as? [String: Any]) ?? [:] {
            let parsed: CopyArg = try #require(arg(value), "argument \(name) is not a string, number or measurement")
            out[name] = parsed
        }
        return out
    }

    @Test("every key of every catalogue, rendered")
    func renders() throws {
        var catalogues: [String: Catalogue] = [:]
        for c in try Fixtures.list("copy.json", "render") {
            let locale = try c.str("locale")
            let catalogue = try catalogues[locale] ?? Self.catalogue(locale)
            catalogues[locale] = catalogue
            let key = try c.str("key")
            let text = try c.str("text")
            let actual = try catalogue.render(key, Self.args(c["args"]))
            #expect(actual == text, "\(locale) \(key): expected \(text), got \(actual)")
        }
    }

    @Test("the plural rule of every language, at every edge")
    func plurals() throws {
        for c in try Fixtures.list("copy.json", "plural") {
            let locale = try c.str("locale")
            let n = try c.num("n")
            let category = try c.str("category")
            let actual = pluralCategory(locale: locale, n)
            #expect(actual.rawValue == category, "\(locale) \(n): expected \(category), got \(actual)")
        }
    }

    @Test("arguments as text, in English and in Czech formatting")
    func numbers() throws {
        for c in try Fixtures.list("copy.json", "formatArg") {
            let arg = try #require(c["value"].flatMap(Self.arg), "formatArg \(c)")
            let locale = try c.str("locale")
            let text = try c.str("text")
            let actual = formatArg(arg, formatLocale: locale)
            #expect(actual == text, "\(locale) \(arg): expected \(text), got \(actual)")
        }
    }

    @Test("the probe: every plural form, the fallback, and every way a brace can be wrong")
    func probe() throws {
        let probe = try Fixtures.object("copy.json", "probe")
        let catalogue = try Catalogue(object: probe.object("catalogue"), fallback: Self.catalogue("en"))
        for c in try probe.rows("cases") {
            let key = try c.str("key")
            let text = try c.str("text")
            let actual = try catalogue.render(key, Self.args(c["args"]))
            #expect(actual == text, "\(key) \(String(describing: c["args"])): expected \(text), got \(actual)")
        }
    }

    @Test("the categories are CLDR's, in CLDR's order")
    func categories() throws {
        let expected = try #require(Fixtures.node("copy.json", "categories") as? [String])
        #expect(PluralCategory.allCases.map(\.rawValue) == expected)
    }

    @Test("a word set mid-sentence loses its first capital and keeps the rest, as copy.test.ts 1e")
    func midSentenceCase() {
        #expect(midSentence("Last Wednesday", locale: "en") == "last Wednesday")
        #expect(midSentence("Jammy", locale: "en-x-1750") == "jammy")
        #expect(midSentence("To-day", locale: "en") == "to-day")
        #expect(midSentence("", locale: "en") == "")
    }
}
