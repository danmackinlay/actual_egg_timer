import Testing
import Foundation
@testable import EggTimerCore
@testable import EggTimerCopy

/// Conformance against `fixtures/format.json`.
///
/// Numbers and times of day go through each platform's own formatter - `Intl`
/// on the web, Foundation here - and this holds Foundation to what `Intl` said,
/// byte for byte, in every supported formatting locale and a few more that were
/// measured to agree. A platform update that moves a separator, a space or an
/// hour width fails here and not in a Czech kitchen. Then the locale each app
/// derives from a UI language and a region, the plural rule with visible
/// decimals, every quantity a cook reads in every supported locale, and a
/// pseudo-Czech catalogue rendered in cs-CZ.
@Suite("Numbers and times match the reference implementation")
struct FormatConformance {
    private static func section(_ name: String) -> [[String: Any]] {
        guard let list = Fixtures.load("format.json")[name] as? [[String: Any]] else {
            fatalError("fixtures/format.json has no \(name)")
        }
        return list
    }

    private static func show(_ s: String) -> String {
        s.unicodeScalars.map { $0.value > 126 ? String(format: "\\u%04x", $0.value) : String($0) }.joined()
    }

    @Test("rounding, and how many decimals a count shows")
    func rounding() {
        for c in Self.section("roundTo") {
            let actual = roundTo(c.num("value"), Int(c.num("decimals")))
            #expect(actual == c.num("result"), "roundTo(\(c.num("value")), \(c.num("decimals"))): \(actual)")
            #expect(actual.sign == .plus || actual != 0, "roundTo gave -0")
        }
        for c in Self.section("countDecimals") {
            #expect(countDecimals(c.num("value")) == Int(c.num("decimals")), "countDecimals(\(c.num("value")))")
        }
    }

    @Test("numbers, in every locale")
    func numbers() {
        for c in Self.section("numbers") {
            let locale = c.str("locale")
            let actual = formatNumber(c.num("value"), decimals: Int(c.num("decimals")), locale: locale)
            #expect(actual == c.str("text"),
                    "\(locale) \(c.num("value")) to \(c.num("decimals")): expected \(Self.show(c.str("text"))), got \(Self.show(actual))")
        }
        for c in Self.section("counts") {
            let locale = c.str("locale")
            let actual = formatCount(c.num("value"), locale: locale)
            #expect(actual == c.str("text"),
                    "\(locale) count \(c.num("value")): expected \(Self.show(c.str("text"))), got \(Self.show(actual))")
        }
    }

    @Test("times of day, in every locale")
    func times() {
        for c in Self.section("times") {
            let locale = c.str("locale")
            let withSeconds = (c["withSeconds"] as? Bool) ?? false
            let actual = formatTimeOfDay(c.num("seconds"), withSeconds: withSeconds, locale: locale)
            #expect(actual == c.str("text"),
                    "\(locale) \(c.num("seconds")) s: expected \(Self.show(c.str("text"))), got \(Self.show(actual))")
        }
        for c in Self.section("normaliseTime") {
            #expect(normaliseTime(c.str("text")) == c.str("normalised"), "normaliseTime(\(Self.show(c.str("text"))))")
        }
    }

    @Test("the formatting locale each app derives")
    func derivedLocale() {
        for c in Self.section("formattingLocale") {
            let hc = (c["hourCycle"] as? String).flatMap(HourCycle.init(rawValue:))
            let actual = formattingLocale(uiLanguage: c.str("uiLanguage"), region: c["region"] as? String, hourCycle: hc)
            #expect(actual == c.str("tag"), "\(c): \(actual)")
        }
    }

    @Test("the plural rule sees the decimals a number is shown with")
    func plurals() {
        for c in Self.section("plural") {
            let actual = pluralCategory(locale: c.str("locale"), c.num("n"), fractionDigits: Int(c.num("fractionDigits")))
            #expect(actual.rawValue == c.str("category"), "\(c): \(actual)")
        }
    }

    @Test("every quantity a cook reads, in every supported locale")
    func measures() throws {
        let url = Fixtures.repoRoot.appendingPathComponent("copy/en.json")
        let en = try Catalogue(json: Data(contentsOf: url))
        for c in Self.section("measures") {
            guard let q = Quantity(rawValue: c.str("quantity")),
                  let system = UnitSystem(rawValue: c.str("system")) else { fatalError("measure \(c)") }
            let m = measureFor(q, system: system, region: c["region"] as? String)
            let text = quantityText(m, c.num("si"))
            #expect(text.key == c.str("key"), "\(c)")
            let locale = c.str("locale")
            let actual = en.render(text.key, ["value": .fixed(text.value)], formatLocale: locale)
            #expect(actual == c.str("text"), "\(locale) \(q) \(c.num("si")): expected \(Self.show(c.str("text"))), got \(Self.show(actual))")
        }
    }

    @Test("a pseudo-Czech catalogue, rendered in cs-CZ")
    func pseudo() throws {
        guard let pseudo = Fixtures.load("format.json")["pseudo"] as? [String: Any],
              let json = pseudo["catalogue"] as? [String: Any],
              let cases = pseudo["cases"] as? [[String: Any]] else {
            fatalError("fixtures/format.json has no pseudo")
        }
        let url = Fixtures.repoRoot.appendingPathComponent("copy/en.json")
        let en = try Catalogue(json: Data(contentsOf: url))
        let catalogue = try Catalogue(object: json, fallback: en)
        let locale = pseudo.str("formatLocale")
        #expect(!cases.isEmpty)
        for c in cases {
            let key = c.str("key")
            let actual = catalogue.render(key, CopyConformance.args(c["args"]), formatLocale: locale)
            #expect(actual == c.str("text"), "\(key): expected \(Self.show(c.str("text"))), got \(Self.show(actual))")
        }
    }
}
