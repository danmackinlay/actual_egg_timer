import Testing
import Foundation
@testable import EggTimerCore
import EggTimerCopy

/// Conformance against `fixtures/sousvideCopy.json`.
///
/// The two unit choices behind the sous-vide readout: when minutes become
/// hours, when hours become days, when a date stops being a weekday. Both apps
/// have to bucket an estimate identically or the same number reads differently
/// on each. Each row pins the bucket - a catalogue key and its numbers - and the
/// English it renders to through `copy/en.json`, which is the text this fixture
/// held before the core stopped returning English.
///
/// This suite exists because they were transliterated by hand and then barely
/// executed. At the shipped 58 °C bath the duration only ever reaches "N h M
/// min" and the phrase only ever reaches "Yesterday" - four branches apiece
/// were ported in two languages and run in neither. Driving the app could not
/// have caught a mistake in them; this can.
@Suite("Sous-vide copy matches the reference implementation")
struct SousVideCopyConformance {
    private static let english: Catalogue = {
        let url = Fixtures.repoRoot.appendingPathComponent("copy/en.json")
        guard let data = try? Data(contentsOf: url), let catalogue = try? Catalogue(json: data) else {
            fatalError("could not read copy/en.json")
        }
        return catalogue
    }()

    private static func args(_ json: Any?) -> [String: Double] {
        var out: [String: Double] = [:]
        for (name, value) in (json as? [String: Any]) ?? [:] {
            out[name] = (value as? NSNumber)?.doubleValue
        }
        return out
    }

    @Test("the duration's bucket, at every boundary from both sides")
    func duration() {
        for c in Fixtures.sousVideCopyCases("duration") {
            let seconds = c.num("seconds")
            let actual = longDuration(seconds)
            #expect(actual == CopyRef(c.str("key"), Self.args(c["args"])), "longDuration(\(seconds)): \(actual)")
            let text = Self.english.render(actual)
            #expect(text == c.str("text"), "longDuration(\(seconds)): expected \(c.str("text")), got \(text)")
        }
    }

    /// The weekday is supplied by the caller, so this pins the BUCKETING without
    /// dragging a locale into the fixture. Which name goes in is `weekday` below:
    /// both apps take it from the catalogue.
    @Test("how long ago the cook should have started")
    func phrase() {
        for c in Fixtures.sousVideCopyCases("startPhrase") {
            let days = Int(c.num("daysAgo"))
            let actual = startPhrase(daysAgo: days)
            #expect(actual == CopyRef(c.str("key"), Self.args(c["args"])), "startPhrase(\(days)): \(actual)")
            let text = Self.english.render(actual, ["weekday": .text("Tuesday")])
            #expect(text == c.str("text"), "startPhrase(\(days)): expected \(c.str("text")), got \(text)")
        }
    }

    @Test("the weekday's name comes from the catalogue, by the web's day numbering")
    func weekday() {
        for c in Fixtures.sousVideCopyCases("weekday") {
            let day = Int(c.num("day"))
            #expect(weekdayKey(day) == c.str("key"), "weekdayKey(\(day)): \(weekdayKey(day))")
            #expect(Self.english.render(weekdayKey(day)) == c.str("text"), "weekday \(day)")
        }
    }
}
