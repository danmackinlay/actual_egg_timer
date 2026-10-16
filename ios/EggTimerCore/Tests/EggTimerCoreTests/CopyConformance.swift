import Testing
import Foundation
@testable import EggTimerCopy

/// Conformance against `fixtures/copy.json`.
///
/// Every string both apps draw goes through a renderer, and there are two of
/// them: `src/core/copy.ts` for the web and `EggTimerCopy` here. This holds the
/// second to the first byte for byte on catalogues of the fixture's own:
/// placeholders and their formats, plural forms, the fallback from a
/// translation and an overlay to the English, every malformed brace; the
/// plural rule of every language at its edges; which tags are the English of
/// 1750; and a probe catalogue. None of it is the app's words, so a change of
/// wording never moves it.
///
/// That the app's own catalogues, read from `copy/` as the app bundles them,
/// load and keep the English's keys and placeholders is the last test here.
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

    /// The fixture's catalogues: its English, and each other one over it.
    private static func cases() throws -> [String: Catalogue] {
        let all = try Fixtures.object("copy.json", "catalogues")
        let english = try Catalogue(object: all.object("en"))
        var out: [String: Catalogue] = ["en": english]
        for name in all.keys where name != "en" {
            out[name] = try Catalogue(object: all.object(name), fallback: english)
        }
        return out
    }

    @Test("placeholders, plural forms, the fallback and malformed braces, rendered")
    func renders() throws {
        let catalogues = try Self.cases()
        for c in try Fixtures.list("copy.json", "render") {
            let name = try c.str("catalogue")
            let catalogue = try #require(catalogues[name], "no catalogue \(name)")
            let key = try c.str("key")
            let text = try c.str("text")
            let actual = try catalogue.render(key, Self.args(c["args"]), formatLocale: c["formatLocale"] as? String)
            #expect(actual == text, "\(name) \(key): expected \(text), got \(actual)")
        }
    }

    @Test("the region of a tag, and the catalogues that render a language")
    func chains() throws {
        let fixture = try Fixtures.load("copy.json")
        #expect(overlays == fixture["overlays"] as? [String])
        for c in try Fixtures.list("copy.json", "regions") {
            let tag = try c.str("tag")
            #expect(regionOf(tag) == c["region"] as? String, "regionOf(\(tag))")
        }
        let rows = try Fixtures.list("copy.json", "chains")
        #expect(rows.count == 30)
        for c in rows {
            let language = try c.str("language")
            let preferred = try #require(c["preferred"] as? [String])
            let region = c["region"] as? String
            let chain = catalogueChain(language: language, preferred: preferred, region: region)
            #expect(chain == c["chain"] as? [String], "\(language), \(preferred), \(region ?? "no region")")
        }
    }

    @Test("which tags are the English of 1750")
    func periods() throws {
        let rows = try Fixtures.list("copy.json", "periods")
        #expect(rows.contains { (try? $0.flag("isPeriod")) == true })
        #expect(rows.contains { (try? $0.flag("isPeriod")) == false })
        for c in rows {
            let tag = try c.str("tag")
            #expect(isPeriod(tag) == (try c.flag("isPeriod")), "isPeriod(\(tag))")
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
        let catalogue = try Catalogue(object: probe.object("catalogue"), fallback: Self.cases()["en"])
        for c in try probe.rows("cases") {
            let key = try c.str("key")
            let text = try c.str("text")
            let actual = try catalogue.render(key, Self.args(c["args"]))
            #expect(actual == text, "\(key) \(String(describing: c["args"])): expected \(text), got \(actual)")
        }
    }

    @Test("the app's catalogues load, and keep the English's keys and placeholders")
    func shipped() throws {
        let english = try Self.catalogue("en")
        let names = try FileManager.default.contentsOfDirectory(atPath: Fixtures.repoRoot().appendingPathComponent("copy").path)
            .filter { $0.hasSuffix(".json") && !$0.hasSuffix(".notes.json") }
        #expect(names.contains("en.json"))
        for name in names where name != "en.json" {
            let locale = String(name.dropLast(".json".count))
            let catalogue = try Self.catalogue(locale)
            for (key, message) in catalogue.messages {
                let base = try #require(english.messages[key], "\(locale) \(key): not an English key")
                #expect(Self.placeholders(message) == Self.placeholders(base), "\(locale) \(key): its placeholders")
            }
        }
    }

    /// Every `{name}` a message's templates use.
    private static func placeholders(_ m: Message) -> Set<String> {
        let templates = [m.text].compactMap { $0 } + Array(m.forms.values)
        var out: Set<String> = []
        let pattern = try! NSRegularExpression(pattern: "\\{([A-Za-z_][A-Za-z0-9_]*)\\}")
        for t in templates {
            for match in pattern.matches(in: t, range: NSRange(t.startIndex..., in: t)) {
                if let r = Range(match.range(at: 1), in: t) { out.insert(String(t[r])) }
            }
        }
        return out
    }

    @Test("the categories are CLDR's, in CLDR's order")
    func categories() throws {
        let expected = try #require(Fixtures.node("copy.json", "categories") as? [String])
        #expect(PluralCategory.allCases.map(\.rawValue) == expected)
    }

    @Test("a word set mid-sentence loses its first capital and keeps the rest, as copy.test.ts")
    func midSentenceCase() {
        #expect(midSentence("Last Wednesday", locale: "en") == "last Wednesday")
        #expect(midSentence("Jammy", locale: "en-x-1750") == "jammy")
        #expect(midSentence("To-day", locale: "en") == "to-day")
        #expect(midSentence("", locale: "en") == "")
    }
}
