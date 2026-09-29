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
    private static func section(_ name: String) throws -> [[String: Any]] {
        try Fixtures.list("format.json", name)
    }

    private static func show(_ s: String) -> String {
        s.unicodeScalars.map { $0.value > 126 ? String(format: "\\u%04x", $0.value) : String($0) }.joined()
    }

    @Test("rounding, and how many decimals a count shows")
    func rounding() throws {
        for c in try Self.section("roundTo") {
            let value = try c.num("value")
            let decimals = try c.num("decimals")
            let actual = roundTo(value, Int(decimals))
            #expect(try actual == c.num("result"), "roundTo(\(value), \(decimals)): \(actual)")
            #expect(actual.sign == .plus || actual != 0, "roundTo gave -0")
        }
        for c in try Self.section("countDecimals") {
            let value = try c.num("value")
            #expect(try countDecimals(value) == Int(c.num("decimals")), "countDecimals(\(value))")
        }
    }

    @Test("numbers, in every locale")
    func numbers() throws {
        for c in try Self.section("numbers") {
            let locale = try c.str("locale")
            let value = try c.num("value")
            let decimals = try c.num("decimals")
            let text = try c.str("text")
            let actual = formatNumber(value, decimals: Int(decimals), locale: locale)
            #expect(actual == text,
                    "\(locale) \(value) to \(decimals): expected \(Self.show(text)), got \(Self.show(actual))")
        }
        for c in try Self.section("counts") {
            let locale = try c.str("locale")
            let value = try c.num("value")
            let text = try c.str("text")
            let actual = formatCount(value, locale: locale)
            #expect(actual == text,
                    "\(locale) count \(value): expected \(Self.show(text)), got \(Self.show(actual))")
        }
    }

    @Test("times of day, in every locale")
    func times() throws {
        for c in try Self.section("times") {
            let locale = try c.str("locale")
            let seconds = try c.num("seconds")
            let text = try c.str("text")
            let actual = try formatTimeOfDay(seconds, withSeconds: c.flag("withSeconds"), locale: locale)
            #expect(actual == text,
                    "\(locale) \(seconds) s: expected \(Self.show(text)), got \(Self.show(actual))")
        }
        for c in try Self.section("normaliseTime") {
            let text = try c.str("text")
            #expect(try normaliseTime(text) == c.str("normalised"), "normaliseTime(\(Self.show(text)))")
        }
        for c in try Self.section("unpadHour") {
            let text = try c.str("text")
            #expect(try unpadHour(text) == c.str("unpadded"), "unpadHour(\(Self.show(text)))")
        }
    }

    @Test("the formatting locale each app derives")
    func derivedLocale() throws {
        for c in try Self.section("formattingLocale") {
            let hc = (c["hourCycle"] as? String).flatMap(HourCycle.init(rawValue:))
            let actual = try formattingLocale(uiLanguage: c.str("uiLanguage"), region: c["region"] as? String, hourCycle: hc)
            #expect(try actual == c.str("tag"), "\(c): \(actual)")
        }
    }

    @Test("from the UI's language, the region and the clock setting to what a cook reads")
    func derived() throws {
        for c in try Self.section("derived") {
            let hc = (c["hourCycle"] as? String).flatMap(HourCycle.init(rawValue:))
            let tag = try formattingLocale(uiLanguage: c.str("uiLanguage"), region: c["region"] as? String, hourCycle: hc)
            #expect(try tag == c.str("tag"), "\(c): \(tag)")
            let actual: [(String, String)] = [
                ("number", formatNumber(1234.5, decimals: 1, locale: tag)),
                ("decimal", formatNumber(2.4, decimals: 1, locale: tag)),
                ("morning", formatTimeOfDay(9 * 3600 + 5 * 60, withSeconds: false, locale: tag)),
                ("midnight", formatTimeOfDay(5 * 60, withSeconds: false, locale: tag)),
                ("afternoon", formatTimeOfDay(15 * 3600 + 5 * 60, withSeconds: false, locale: tag)),
                ("withSeconds", formatTimeOfDay(9 * 3600 + 5 * 60 + 9, withSeconds: true, locale: tag)),
            ]
            for (field, text) in actual {
                let expected = try c.str(field)
                #expect(text == expected, "\(tag) \(field): expected \(Self.show(expected)), got \(Self.show(text))")
            }
        }
    }

    @Test("the plural rule sees the decimals a number is shown with")
    func plurals() throws {
        for c in try Self.section("plural") {
            let actual = try pluralCategory(locale: c.str("locale"), c.num("n"), fractionDigits: Int(c.num("fractionDigits")))
            #expect(try actual.rawValue == c.str("category"), "\(c): \(actual)")
        }
    }

    @Test("every quantity a cook reads, in every supported locale")
    func measures() throws {
        let en = try Fixtures.catalogue("en")
        for c in try Self.section("measures") {
            let q = try c.value(Quantity.self, "quantity")
            let system = try c.value(UnitSystem.self, "system")
            let m = measureFor(q, system: system, region: c["region"] as? String)
            let si = try c.num("si")
            let text = quantityText(m, si)
            #expect(try text.key == c.str("key"), "\(c)")
            let locale = try c.str("locale")
            let expected = try c.str("text")
            let actual = en.render(text.key, ["value": .fixed(text.value)], formatLocale: locale)
            #expect(actual == expected, "\(locale) \(q) \(si): expected \(Self.show(expected)), got \(Self.show(actual))")
        }
    }

    @Test("a pseudo-Czech catalogue, rendered in cs-CZ")
    func pseudo() throws {
        let pseudo = try Fixtures.object("format.json", "pseudo")
        let catalogue = try Catalogue(object: pseudo.object("catalogue"), fallback: Fixtures.catalogue("en"))
        let locale = try pseudo.str("formatLocale")
        for c in try pseudo.rows("cases") {
            let key = try c.str("key")
            let expected = try c.str("text")
            let actual = try catalogue.render(key, CopyConformance.args(c["args"]), formatLocale: locale)
            #expect(actual == expected, "\(key): expected \(Self.show(expected)), got \(Self.show(actual))")
        }
    }
}
