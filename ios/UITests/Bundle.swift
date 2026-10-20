import XCTest
import EggTimerApp
import EggTimerCore

// What the app finds in its own bundle.

/// The formats the system plays a notification's sound in, as afinfo and
/// AVAudioFile name them (UNNotificationSound's documentation: linear PCM,
/// IMA4, µ-law, a-law); a file it cannot find, cannot play, or of 30 s or more
/// it replaces with its default sound.
private let notificationFormats = ["lpcm", "ima4", "ulaw", "alaw"]

extension Scenarios {
    /// Help's sources bundled: Help, opened from the bar, lists some, not none
    func test_help_sources() {
        scenario { run in
            try run.launch()
            try run.tap("bar.help")
            _ = try? run.find("help.source")
            let count = run.app.links.matching(identifier: "help.source").count
            run.check(count > 0, "\(count) sources: help-sources.json is not in the bundle (ios/project.yml)")
            run.note("\(count) sources")
        }
    }

    /// every file an alarm can name is in the bundle, under 30 s, in a format a notification plays
    func test_sound_files() {
        scenario { run in
            try run.launch()
            let want = AlarmSound.allCases.flatMap { s in ["pull", "cooled"].map { "alarm-\(s.rawValue)-\($0).caf" } }
            let soundFile = { (e: Screenshots.Event) -> (name: String, bundled: Bool, seconds: Double?, format: String?)? in
                guard case let .soundFile(name, bundled, seconds, format) = e else { return nil }
                return (name, bundled, seconds, format)
            }
            let end = Date().addingTimeInterval(Env.waitS)
            var files = try run.sinceLaunch().compactMap { soundFile($0.event) }
            while files.count < want.count, Date() < end {
                pause(0.1)
                files = try run.sinceLaunch().compactMap { soundFile($0.event) }
            }
            run.check(files.map(\.name).sorted() == want.sorted(), "files \(files.map(\.name))")
            for f in files {
                run.check(f.bundled, "\(f.name) not in the bundle (ios/project.yml, ios/App/Sounds)")
                run.check((f.seconds ?? 0) > 0 && (f.seconds ?? 30) < 30, "\(f.name): \(String(describing: f.seconds)) s, not under 30")
                run.check(notificationFormats.contains(f.format ?? ""), "\(f.name): format \(String(describing: f.format)), not one a notification plays")
            }
            run.note(files.map { String(format: "%@ %.1f s %@", $0.name, $0.seconds ?? .nan, $0.format ?? "?") }.joined(separator: ", "))
        }
    }
}

/// A new device's first launches are many seconds slow while the system
/// settles, and its notifications refused ("Source is not authorized"), or,
/// on a loaded machine, the request for them never answered: the npm script
/// runs this until a cook has its alarms pending, nothing else checked.
@MainActor
final class WarmUp: XCTestCase {
    func test_warm_up() throws {
        let run = Run("warm-up")
        defer { run.terminate() }
        try run.launch(["-uiScreen", "heating"])
        // A new device's first launches may never hear back: another, soon.
        let hit = try run.until("the alarms", timeoutS: max(30, Env.waitS / 2)) {
            switch $0 {
            case .pending(let alarms): alarms.contains { $0.id.hasPrefix("cook") }
            case .notScheduled: true
            default: false
            }
        }
        guard case .pending = hit.event else {
            let seen = try run.lines().map(\.ev)
            throw Stop("\(hit.event); \(seen.count) events, the last \(seen.suffix(8).joined(separator: ", "))")
        }
    }
}
