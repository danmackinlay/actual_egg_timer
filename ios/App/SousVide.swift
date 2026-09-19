import Foundation
import EggTimerCore

/// What the app says when you ask it for a sous-vide egg.
///
/// The numbers are not a joke: they come from `EggTimerCore.sousVideEstimate`,
/// which is the same dose machinery as every other answer in this app with the
/// surface temperature held constant. Below 60 C the white's dose target - which
/// is pinned at 80 C, because that is where ovalbumin goes - takes the better
/// part of a day to accumulate, so the honest answer to "when do I start?" is a
/// time in the past. All this file does is say so out loud.
///
/// It lives in the app rather than in the core, for the same reason
/// `refusalText` does: the core carries the DECISION and the app carries the
/// sentence. A sous-vide readout on a phone is not the same shape as one in a
/// browser, and a shared string would have to be wrong for one of them.
/// Transliterated from `src/ui/sousvide.ts`, which does this job for the web.

/// Which of the three positions the Start control is in.
///
/// The control has three; the model has two. Sous-vide is answered by
/// `sousVideEstimate` instead, so as far as the cook solver is concerned there
/// is no third mode - which is why this is an app type and `StartMode` in the
/// core stays a pair. The web draws the same distinction, as `UiStartMode` in
/// `src/ui/store.ts`.
enum StartChoice: String, CaseIterable, Sendable {
    case cold, hot, sousVide
}

struct SousVideCopy {
    /// Big text, in place of the clock.
    let headline: String
    let subline: String
    let note: String
    let warn: String
    let hint: String
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

private let weekdayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "EEEE"
    return formatter
}()

private let clockFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    return formatter
}()

func sousVideCopy(_ est: SousVideEstimate, now: Date) -> SousVideCopy {
    let start = now.addingTimeInterval(-est.totalS)
    let duration = formatLongDuration(est.totalS)
    let bath = String(format: "%.0f", est.bathC)

    return SousVideCopy(
        headline: startPhrase(
            daysAgo: daysBefore(start, now),
            weekday: weekdayFormatter.string(from: start)
        ),
        subline: "at \(clockFormatter.string(from: start)) — \(duration) at \(bath)°C, to eat now",
        note: est.whiteBound ? "white still not set, yolk creamy" : "yolk set, white still not",
        warn: "A \(bath)°C bath is below the temperature at which egg white sets — "
            + "only one of its proteins reacts down here — so the white stays loose "
            + "however long you leave it. This app was built for boiling water and is "
            + "out of its depth below 60°C anyway. Use the pan.",
        hint: "nothing to start — you are \(duration) late"
    )
}
