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
/// A DEBUG build can run it fast, shifted, frozen, or stepped from outside,
/// so a check of an eleven-minute cook lands on each moment it means
/// (`npm run ios:e2e`, ios/README.md):
///
/// - `-clockAt 1791234567`: cook time at this launch is that moment, epoch s.
/// - `-clockSpeed 60`: cook time runs sixty times as fast as the system's;
///   `-clockSpeed 0` holds it still at its moment (frozen).
///
/// Launch arguments last one launch; a relaunch without them is back on the
/// system's clock, with a stored cook in what is then the future.
///
/// A clock so launched is steppable: the app reads `Library/Caches/aet.clock`
/// in its container twenty times a second, and a line `<n> <at> <speed>`
/// with a larger `n` than the last sets cook time to `at` and runs it on at
/// `speed` (0 frozen), as if the phone had slept or been set (`step`; the
/// debug log says `clock`, with `n`, `at` and `speed`, when it has). A script
/// freezes the clock at each moment it checks, rather than racing it.
///
/// Under a running clock the notifications are scheduled at the scaled
/// interval, so a pull a minute of cook time away fires in a second at ×60;
/// under a frozen one, which reaches no deadline by itself, a day later than
/// that, so they stay pending (and cover their deadlines) until the check
/// is over: the check reads what was scheduled and for when (cook time) in
/// the log. The card's dates are the real moments the cook's deadlines will
/// come (at ×1 from the moment it froze, under a frozen clock), so its
/// countdown reaches zero with the app's but counts real seconds (8:00 to go
/// reads 0:08 at ×60). Sharing sends nothing, and an egg recorded under it
/// is marked in its `appVersion` (`mark`) and never sent.
public enum AppClock {
    /// The clock cook time is read from: the launch's (`LaunchClock`), or a
    /// test's.
    nonisolated(unsafe) public static var source: any CookClock = LaunchClock.Source()

    /// Now, in cook time.
    public static var now: Date { source.now }
    /// A moment on the system's clock, in cook time.
    public static func app(_ system: Date) -> Date { source.app(system) }
    /// A moment in cook time, on the system's clock: when it will come.
    public static func real(_ app: Date) -> Date { source.real(app) }
    /// `real` undone, for the debug log.
    public static func fromReal(_ system: Date) -> Date { source.fromReal(system) }
    /// The system's seconds from now until a moment in cook time.
    public static func realInterval(until app: Date) -> TimeInterval { source.realInterval(until: app) }
    /// Wait this much cook time.
    public static func sleep(_ cookSeconds: Double) async throws { try await source.sleep(cookSeconds) }
    /// A redraw period in the system's seconds for one in cook time.
    public static func period(_ cookSeconds: Double) -> TimeInterval { source.period(cookSeconds) }
    /// Whether this launch's clock is, or has been, not the system's.
    public static var altered: Bool { source.altered }

    #if DEBUG
    /// What marks a record made under a clock not the system's.
    private static let marker = " (debug clock)"

    /// The app's version as a record made now carries it: marked while the
    /// clock is altered.
    public static func mark(_ appVersion: String) -> String {
        altered ? appVersion + marker : appVersion
    }

    /// Whether a record was made under an altered clock: never sent.
    public static func marked(_ appVersion: String) -> Bool { appVersion.hasSuffix(marker) }

    /// Start reading steps, if this launch's clock can take them. Once, at
    /// launch.
    public static func listen() { LaunchClock.listen() }
    #else
    public static func mark(_ appVersion: String) -> String { appVersion }
    public static func marked(_ appVersion: String) -> Bool { false }
    #endif

    /// The system's clock, for what is not cook time: sharing's dealings with
    /// the server and Apple, and the card's own dates, which the system
    /// counts.
    public static var system: Date { Date() }
}

/// What cook time is read from (`AppClock`): the launch's clock in the app,
/// a test's own in the tests, which moves only when the test moves it.
public protocol CookClock: Sendable {
    var now: Date { get }
    func app(_ system: Date) -> Date
    func real(_ app: Date) -> Date
    func fromReal(_ system: Date) -> Date
    func realInterval(until app: Date) -> TimeInterval
    func sleep(_ cookSeconds: Double) async throws
    func period(_ cookSeconds: Double) -> TimeInterval
    var altered: Bool { get }
}

/// The launch's clock: the system's, or in a DEBUG build one the launch
/// arguments and the step file move (below).
enum LaunchClock {
    #if DEBUG
    /// Where the clock stands: cook time `app` at the system's `system`,
    /// running on at `speed` (0 frozen).
    private struct Anchor {
        var system: Double
        var app: Double
        var speed: Double
    }

    private static let lock = NSLock()

    /// The clock as launched, then as last stepped.
    nonisolated(unsafe) private static var anchor: Anchor = {
        let d = UserDefaults.standard
        let launched = Date().timeIntervalSince1970
        let speed = d.object(forKey: "clockSpeed") == nil ? 1 : max(0, d.double(forKey: "clockSpeed"))
        let at = d.object(forKey: "clockAt") == nil ? launched : d.double(forKey: "clockAt")
        return Anchor(system: launched, app: at, speed: speed)
    }()

    /// Whether this launch's clock was ever not the system's.
    nonisolated(unsafe) private static var wasAltered: Bool = {
        let a = anchor
        return a.speed != 1 || a.app != a.system
    }()

    private static func read<T>(_ f: (Anchor) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return f(anchor)
    }

    /// How many seconds of cook time pass in one of the system's, now.
    static var speed: Double { read { $0.speed } }

    /// Whether this launch's clock is, or has been, not the system's.
    static var altered: Bool { read { _ in wasAltered } }

    /// A moment on the system's clock, in cook time: under a frozen clock,
    /// its moment, whatever the system's.
    static func app(_ system: Date) -> Date {
        read { a in Date(timeIntervalSince1970: a.app + a.speed * (system.timeIntervalSince1970 - a.system)) }
    }

    /// A moment in cook time, on the system's clock: when it will come, at
    /// the clock's speed, or at ×1 from where a frozen clock stands.
    static func real(_ app: Date) -> Date {
        read { a in
            Date(timeIntervalSince1970: a.system + (app.timeIntervalSince1970 - a.app) / (a.speed > 0 ? a.speed : 1))
        }
    }

    /// `real` undone: a date on the system's clock that `real` made, back in
    /// cook time, for the debug log (a frozen clock's `app` cannot).
    static func fromReal(_ system: Date) -> Date {
        read { a in
            Date(timeIntervalSince1970: a.app + (system.timeIntervalSince1970 - a.system) * (a.speed > 0 ? a.speed : 1))
        }
    }

    /// Now, in cook time.
    static var now: Date { app(Date()) }

    /// A frozen clock's notifications wait this much longer (see above).
    private static let frozenDelay: TimeInterval = 86400

    /// The system's seconds from now until a moment in cook time: a day more
    /// under a frozen clock.
    static func realInterval(until app: Date) -> TimeInterval {
        let (speed, cookNow) = read { a in (a.speed, a.app + a.speed * (Date().timeIntervalSince1970 - a.system)) }
        let ahead = app.timeIntervalSince1970 - cookNow
        return speed > 0 ? ahead / speed : (ahead > 0 ? ahead + frozenDelay : ahead)
    }

    /// Wait this much cook time. Never under 20 ms of the system's, so a fast
    /// clock does not spin; never over a quarter of a second while the clock
    /// can be stepped, so a step is seen at once (every wait here is a
    /// loop's, which looks again).
    static func sleep(_ cookSeconds: Double) async throws {
        let s = speed
        guard steppable else {
            try await Task.sleep(for: .seconds(s == 1 ? cookSeconds : max(cookSeconds / s, 0.02)))
            return
        }
        let real = s > 0 ? cookSeconds / s : cookSeconds
        try await Task.sleep(for: .seconds(min(max(real, 0.02), 0.25)))
    }

    /// A redraw period in the system's seconds for one in cook time: never
    /// under a tenth of a second, and a second at most while frozen.
    static func period(_ cookSeconds: Double) -> TimeInterval {
        let s = speed
        if s == 1 { return cookSeconds }
        return s > 0 ? max(cookSeconds / s, 0.1) : min(max(cookSeconds, 0.1), 1)
    }




    // MARK: - Stepped from outside

    /// Whether this launch's clock reads steps: one given any clock argument.
    static let steppable: Bool = ["clockAt", "clockSpeed"]
        .contains { UserDefaults.standard.object(forKey: $0) != nil }

    /// The file a step is read from, in the app's container.
    private static var stepFile: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("aet.clock")
    }

    /// The last step taken; one already in the file at launch is not taken.
    nonisolated(unsafe) private static var lastStep = 0
    nonisolated(unsafe) private static var poll: DispatchSourceTimer?

    /// Start reading steps, if this launch's clock can take them. Once, at
    /// launch.
    static func listen() {
        guard steppable, poll == nil else { return }
        lastStep = readStep()?.n ?? 0
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .userInitiated))
        timer.schedule(deadline: .now(), repeating: .milliseconds(50))
        timer.setEventHandler { takeStep() }
        timer.resume()
        poll = timer
    }

    private static func readStep() -> (n: Int, at: Double, speed: Double)? {
        guard let url = stepFile, let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let parts = text.split(whereSeparator: \.isWhitespace)
        guard parts.count == 3, let n = Int(parts[0]), let at = Double(parts[1]), let speed = Double(parts[2]),
              speed >= 0 else { return nil }
        return (n, at, speed)
    }

    /// Take the step in the file, if it is new: on the poll's queue, so
    /// `lastStep` is only ever touched there after `listen`.
    private static func takeStep() {
        guard let step = readStep(), step.n > lastStep else { return }
        lastStep = step.n
        lock.lock()
        anchor = Anchor(system: Date().timeIntervalSince1970, app: step.at, speed: step.speed)
        wasAltered = true
        lock.unlock()
        Screenshots.log(.clock(n: step.n, at: step.at, speed: step.speed))
        Screenshots.stepped(step.n)
    }
    #else
    static let altered = false
    @inline(__always) static func app(_ system: Date) -> Date { system }
    @inline(__always) static func real(_ app: Date) -> Date { app }
    @inline(__always) static func fromReal(_ system: Date) -> Date { system }
    static var now: Date { Date() }
    static func realInterval(until app: Date) -> TimeInterval { app.timeIntervalSinceNow }
    static func sleep(_ cookSeconds: Double) async throws { try await Task.sleep(for: .seconds(cookSeconds)) }
    static func period(_ cookSeconds: Double) -> TimeInterval { cookSeconds }
    #endif
}

extension LaunchClock {
    /// The launch's clock as a `CookClock`.
    struct Source: CookClock {
        var now: Date { LaunchClock.now }
        func app(_ system: Date) -> Date { LaunchClock.app(system) }
        func real(_ app: Date) -> Date { LaunchClock.real(app) }
        func fromReal(_ system: Date) -> Date { LaunchClock.fromReal(system) }
        func realInterval(until app: Date) -> TimeInterval { LaunchClock.realInterval(until: app) }
        func sleep(_ cookSeconds: Double) async throws { try await LaunchClock.sleep(cookSeconds) }
        func period(_ cookSeconds: Double) -> TimeInterval { LaunchClock.period(cookSeconds) }
        var altered: Bool { LaunchClock.altered }
    }
}
