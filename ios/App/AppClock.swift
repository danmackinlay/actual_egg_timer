import Foundation

/// The app's clock: every read of the current time a cook depends on, and
/// every wait measured in cook time, goes through here (`now`, `sleep`,
/// `period`). What must stay on the system's clock says so: a notification's
/// interval and the Lock Screen card's dates, which the system counts
/// (`realInterval`, `real`), and sharing, which talks to a server
/// (`system`).
///
/// A Release build is the system's clock and nothing else: the arguments
/// below are not read, and every function is the identity.
///
/// A DEBUG build can run it fast or shifted, so a check of an eleven-minute
/// cook takes seconds (`npm run ios:e2e`, ios/README.md):
///
/// - `-clockSpeed 60`: cook time runs sixty times as fast as the system's.
/// - `-clockOffset -900`: cook time is the system's moved by that many
///   seconds (here, a quarter of an hour behind).
/// - `-clockEpoch 1791234567`: the system's moment, epoch s, from which the
///   speed counts; this launch's when not given.
///
///     cook time = epoch + speed × (system − epoch) + offset
///
/// Launch arguments last one launch. Given the same three again, a relaunch
/// reads the same clock and carries on where the last launch left off; a
/// relaunch without them is back on the system's clock, with a stored cook in
/// what is then the future. A script passes all three every time (an epoch
/// fixed when it begins), and moves the offset on to wake past a deadline.
///
/// Under such a clock the notifications are scheduled at the scaled
/// interval, so a pull a minute of cook time away fires in a second at ×60;
/// the card's dates are the real moments the cook's deadlines will come, so
/// its countdown reaches zero with the app's but counts real seconds (8:00
/// to go reads 0:08 at ×60). Sharing sends nothing, and an egg recorded
/// under it is marked in its `appVersion` (`mark`) and never sent.
enum AppClock {
    #if DEBUG
    /// How many seconds of cook time pass in one of the system's.
    static let speed: Double = {
        let s = UserDefaults.standard.double(forKey: "clockSpeed")
        return s > 0 ? s : 1
    }()
    /// Seconds added to the system's clock, after the speed.
    static let offset: Double = UserDefaults.standard.double(forKey: "clockOffset")
    /// The system's moment, epoch s, from which the speed counts.
    static let epoch: Double = {
        UserDefaults.standard.object(forKey: "clockEpoch") == nil
            ? Date().timeIntervalSince1970 : UserDefaults.standard.double(forKey: "clockEpoch")
    }()
    /// Whether this launch's clock is not the system's.
    static let altered = speed != 1 || offset != 0

    /// A moment on the system's clock, in cook time.
    static func app(_ system: Date) -> Date {
        Date(timeIntervalSince1970: epoch + speed * (system.timeIntervalSince1970 - epoch) + offset)
    }

    /// A moment in cook time, on the system's clock: when it will come.
    static func real(_ app: Date) -> Date {
        Date(timeIntervalSince1970: epoch + (app.timeIntervalSince1970 - offset - epoch) / speed)
    }

    /// Now, in cook time.
    static var now: Date { app(Date()) }

    /// The system's seconds from now until a moment in cook time.
    static func realInterval(until app: Date) -> TimeInterval {
        app.timeIntervalSince(now) / speed
    }

    /// Wait this much cook time. Never under 20 ms of the system's, so a fast
    /// clock does not spin.
    static func sleep(_ cookSeconds: Double) async throws {
        try await Task.sleep(for: .seconds(speed == 1 ? cookSeconds : max(cookSeconds / speed, 0.02)))
    }

    /// A redraw period in the system's seconds for one in cook time: never
    /// under a tenth of a second.
    static func period(_ cookSeconds: Double) -> TimeInterval {
        speed == 1 ? cookSeconds : max(cookSeconds / speed, 0.1)
    }

    /// What marks a record made under a clock not the system's.
    private static let marker = " (debug clock)"

    /// The app's version as a record made now carries it: marked while the
    /// clock is altered.
    static func mark(_ appVersion: String) -> String {
        altered ? appVersion + marker : appVersion
    }

    /// Whether a record was made under an altered clock: never sent.
    static func marked(_ appVersion: String) -> Bool { appVersion.hasSuffix(marker) }
    #else
    static let altered = false
    @inline(__always) static func app(_ system: Date) -> Date { system }
    @inline(__always) static func real(_ app: Date) -> Date { app }
    static var now: Date { Date() }
    static func realInterval(until app: Date) -> TimeInterval { app.timeIntervalSinceNow }
    static func sleep(_ cookSeconds: Double) async throws { try await Task.sleep(for: .seconds(cookSeconds)) }
    static func period(_ cookSeconds: Double) -> TimeInterval { cookSeconds }
    static func mark(_ appVersion: String) -> String { appVersion }
    static func marked(_ appVersion: String) -> Bool { false }
    #endif

    /// The system's clock, for what is not cook time: sharing's dealings with
    /// the server and Apple, and the card's own dates, which the system
    /// counts.
    static var system: Date { Date() }
}
