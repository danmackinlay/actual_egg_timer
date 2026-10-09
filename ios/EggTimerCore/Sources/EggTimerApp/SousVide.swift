import Foundation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// What the app says when you ask it for a sous-vide egg.
///
/// The numbers are not a joke: they come from `EggTimerCore.sousVideEstimate`,
/// which is the same dose machinery as every other answer in this app with the
/// surface temperature held constant. Below 60 C the white's dose target - which
/// is pinned at 80 C, because that is where ovalbumin goes - takes the better
/// part of a day to accumulate, so the honest answer to "when do I start?" is a
/// time in the past. All this file does is say so out loud.
///
/// Which words say it are core's (`longDuration`, `startPhrase`,
/// `weekdayKey`, against `fixtures/sousvideCopy.json`); this file supplies what
/// only a platform can answer - the calendar's days and weekday - and renders
/// the keys. The web's `src/ui/sousvide.ts` does the same job.

/// Which of the three positions the Start control is in.
///
/// The control has three; the model has two. Sous-vide is answered by
/// `sousVideEstimate` instead, so as far as the cook solver is concerned there
/// is no third mode - which is why this is an app type and `StartMode` in the
/// core stays a pair. The web draws the same distinction, as `UiStartMode` in
/// `src/ui/store.ts`.
public enum StartChoice: String, CaseIterable, Sendable {
    case cold, hot, sousVide
}

public struct SousVideCopy {
    /// Big text, in place of the clock.
    public let headline: String
    public let subline: String
    public let note: String
    public let warn: String
    public let hint: String
}

/// Whole days between two instants, by local midnight rather than by elapsed
/// hours: 23:00 to 01:00 is yesterday, not "nearly today".
///
/// `Calendar` answers this directly, so there is no 86 400 000 constant here to
/// be wrong about across a clock change. The bucketing of that count into words
/// is `startPhrase` in EggTimerCore; this is the part only a platform can
/// answer, which is why it stays.
private func daysBefore(_ then: Date, _ now: Date) -> Int {
    let calendar = Calendar.current
    let from = calendar.startOfDay(for: then)
    let to = calendar.startOfDay(for: now)
    return calendar.dateComponents([.day], from: from, to: to).day ?? 0
}

/// The weekday a date falls on, by `Date.getDay()` numbering (0 is Sunday),
/// in the phone's calendar and time zone. `Calendar` counts from 1.
private func dayOfWeek(_ date: Date) -> Int {
    Calendar.current.component(.weekday, from: date) - 1
}

public func sousVideCopy(_ est: SousVideEstimate, now: Date, units: UnitSystem) -> SousVideCopy {
    let start = now.addingTimeInterval(-est.totalS)
    let duration = tr(longDuration(est.totalS))
    let bath = showIn(units, .temperature, est.bathC)

    return SousVideCopy(
        headline: tr(
            startPhrase(daysAgo: daysBefore(start, now)),
            ["weekday": .text(tr(weekdayKey(dayOfWeek(start))))]
        ),
        subline: tr("sousvide.subline", [
            "clock": .text(timeOfDay(start)), "duration": .text(duration), "bath": .text(bath),
        ]),
        note: tr(est.whiteBound ? "sousvide.note.whiteBound" : "sousvide.note.yolkBound"),
        warn: tr("sousvide.warn", [
            "bath": .text(bath), "floor": .text(showIn(units, .temperature, sousVideModelFloorC)),
        ]),
        hint: tr("sousvide.hint", ["duration": .text(duration)])
    )
}
