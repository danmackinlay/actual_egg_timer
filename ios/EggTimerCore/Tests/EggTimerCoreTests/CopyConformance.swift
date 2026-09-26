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
    private static func catalogue(_ locale: String) -> Catalogue {
        let url = Fixtures.repoRoot.appendingPathComponent("copy/\(locale).json")
        guard let data = try? Data(contentsOf: url) else { fatalError("could not read copy/\(locale).json") }
        do {
            let english = locale == "en" ? nil : catalogue("en")
            return try Catalogue(json: data, fallback: english)
        } catch {
            fatalError("copy/\(locale).json: \(error)")
        }
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

    static func args(_ json: Any?) -> CopyArgs {
        var out: CopyArgs = [:]
        for (name, value) in (json as? [String: Any]) ?? [:] {
            guard let arg = arg(value) else { fatalError("argument \(name) is not a string, number or measurement") }
            out[name] = arg
        }
        return out
    }

    private static func section(_ name: String) -> [[String: Any]] {
        guard let list = Fixtures.load("copy.json")[name] as? [[String: Any]] else {
            fatalError("fixtures/copy.json has no \(name)")
        }
        return list
    }

    @Test("every key of every catalogue, rendered")
    func renders() {
        var catalogues: [String: Catalogue] = [:]
        let rows = Self.section("render")
        #expect(!rows.isEmpty)
        for c in rows {
            let locale = c.str("locale")
            let catalogue = catalogues[locale] ?? Self.catalogue(locale)
            catalogues[locale] = catalogue
            let key = c.str("key")
            let actual = catalogue.render(key, Self.args(c["args"]))
            #expect(actual == c.str("text"), "\(locale) \(key): expected \(c.str("text")), got \(actual)")
        }
    }

    @Test("the plural rule of every language, at every edge")
    func plurals() {
        for c in Self.section("plural") {
            let locale = c.str("locale")
            let n = c.num("n")
            let actual = pluralCategory(locale: locale, n)
            #expect(actual.rawValue == c.str("category"), "\(locale) \(n): expected \(c.str("category")), got \(actual)")
        }
    }

    @Test("arguments as text, in English and in Czech formatting")
    func numbers() {
        for c in Self.section("formatArg") {
            guard let value = c["value"], let arg = Self.arg(value) else { fatalError("formatArg \(c)") }
            let locale = c.str("locale")
            let actual = formatArg(arg, formatLocale: locale)
            #expect(actual == c.str("text"), "\(locale) \(arg): expected \(c.str("text")), got \(actual)")
        }
    }

    @Test("the probe: every plural form, the fallback, and every way a brace can be wrong")
    func probe() throws {
        guard let probe = Fixtures.load("copy.json")["probe"] as? [String: Any],
              let json = probe["catalogue"] as? [String: Any],
              let cases = probe["cases"] as? [[String: Any]] else {
            fatalError("fixtures/copy.json has no probe")
        }
        let catalogue = try Catalogue(object: json, fallback: Self.catalogue("en"))
        for c in cases {
            let key = c.str("key")
            let actual = catalogue.render(key, Self.args(c["args"]))
            #expect(actual == c.str("text"), "\(key) \(String(describing: c["args"])): expected \(c.str("text")), got \(actual)")
        }
    }

    @Test("the categories are CLDR's, in CLDR's order")
    func categories() {
        let expected = (Fixtures.load("copy.json")["categories"] as? [String]) ?? []
        #expect(PluralCategory.allCases.map(\.rawValue) == expected)
    }
}
