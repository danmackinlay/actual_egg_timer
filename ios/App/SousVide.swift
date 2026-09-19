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

/// "22 h 41 min", "3 days", "5 weeks". Minutes and seconds stop being a useful
/// unit somewhere around the point this app stops being useful.
func formatLongDuration(_ seconds: Double) -> String {
    let minutes = Int(Foundation.round(seconds / 60.0))
    if minutes < 90 { return "\(minutes) min" }
    let hours = minutes / 60
    let rest = minutes % 60
    if hours < 48 { return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min" }
    let days = Int(Foundation.round(Double(hours) / 24.0))
    if days < 14 { return "\(days) days" }
    return "\(Int(Foundation.round(Double(days) / 7.0))) weeks"
}

/// Whole days between two instants, by local midnight rather than by elapsed
/// hours: 23:00 to 01:00 is yesterday, not "nearly today".
///
/// The TypeScript normalises both dates to midnight and then divides by a fixed
/// 86 400 000 ms, rounding to absorb the day a clock change makes 23 or 25 hours
/// long. `Calendar` answers the question directly, so there is no constant here
/// to be wrong about.
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

private func whenToStart(_ then: Date, _ now: Date) -> String {
    let days = daysBefore(then, now)
    if days <= 0 { return "Today" }
    if days == 1 { return "Yesterday" }
    if days < 7 { return "Last \(weekdayFormatter.string(from: then))" }
    if days < 14 { return "Last week" }
    if days < 60 { return "\(Int(Foundation.round(Double(days) / 7.0))) weeks ago" }
    return "\(Int(Foundation.round(Double(days) / 30.0))) months ago"
}

func sousVideCopy(_ est: SousVideEstimate, now: Date) -> SousVideCopy {
    let start = now.addingTimeInterval(-est.totalS)
    let duration = formatLongDuration(est.totalS)
    let bath = String(format: "%.0f", est.bathC)

    return SousVideCopy(
        headline: whenToStart(start, now),
        subline: "at \(clockFormatter.string(from: start)) — \(duration) at \(bath)°C, to eat now",
        note: est.whiteBound ? "white still not set, yolk creamy" : "yolk set, white still not",
        warn: "A \(bath)°C bath is below the temperature at which egg white sets — "
            + "only one of its proteins reacts down here — so the white stays loose "
            + "however long you leave it. This app was built for boiling water and is "
            + "out of its depth below 60°C anyway. Use the pan.",
        hint: "nothing to start — you are \(duration) late"
    )
}
