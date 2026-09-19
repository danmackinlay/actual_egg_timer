import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/sousvideCopy.json`.
///
/// The two formatters behind the sous-vide readout are unit choices, not
/// sentences: when minutes become hours, when hours become days, when a date
/// stops being a weekday. Both apps have to bucket an estimate identically or
/// the same number reads differently on each.
///
/// This suite exists because they were transliterated by hand and then barely
/// executed. At the shipped 58 °C bath the duration formatter only ever reaches
/// "N h M min" and the phrase only ever reaches "Yesterday" - four branches
/// apiece were ported in two languages and run in neither. Driving the app
/// could not have caught a mistake in them; this can.
@Suite("Sous-vide copy matches the reference implementation")
struct SousVideCopyConformance {
    @Test("the duration formatter, at every boundary from both sides")
    func duration() {
        for c in Fixtures.sousVideCopyCases("duration") {
            let seconds = c.num("seconds")
            let actual = formatLongDuration(seconds)
            #expect(
                actual == c.str("text"),
                "formatLongDuration(\(seconds)): expected \(c.str("text")), got \(actual)"
            )
        }
    }

    /// The weekday is supplied by the caller, so this pins the BUCKETING without
    /// dragging a locale into the fixture. Which weekday name each app passes in
    /// is deliberately its own business - this side reads a locale-aware
    /// formatter, the web an English table.
    @Test("how long ago the cook should have started, in words")
    func phrase() {
        for c in Fixtures.sousVideCopyCases("startPhrase") {
            let days = Int(c.num("daysAgo"))
            let actual = startPhrase(daysAgo: days, weekday: "Tuesday")
            #expect(
                actual == c.str("text"),
                "startPhrase(\(days)): expected \(c.str("text")), got \(actual)"
            )
        }
    }
}
