import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

// What the app's logic reaches outside itself (`Services`, `AppClock`,
// `Stores`), as the tests give it: fakes that remember what was asked of
// them, a clock that moves only when a test moves it, and a store in memory.

/// UserDefaults in memory, and every write it took, in order. A write needs
/// a `Stores.Pass`, so every one of them came through `Stores`.
final class MemoryStore: KeyValueStore, @unchecked Sendable {
    private(set) var values: [String: Any] = [:]
    /// Each write, in order: the key, and whether it set a value or removed one.
    private(set) var writes: [(key: String, removed: Bool)] = []

    init(_ values: [String: Any] = [:]) { self.values = values }

    func object(forKey key: String) -> Any? { values[key] }
    func string(forKey key: String) -> String? { values[key] as? String }
    func double(forKey key: String) -> Double { (values[key] as? NSNumber)?.doubleValue ?? 0 }
    func bool(forKey key: String) -> Bool { (values[key] as? NSNumber)?.boolValue ?? false }
    func data(forKey key: String) -> Data? { values[key] as? Data }
    func dictionary(forKey key: String) -> [String: Any]? { values[key] as? [String: Any] }

    func set(_ value: Any?, forKey key: String, _ pass: Stores.Pass) {
        values[key] = value
        writes.append((key, value == nil))
    }

    func removeObject(forKey key: String, _ pass: Stores.Pass) {
        values[key] = nil
        writes.append((key, true))
    }
}

/// Cook time that moves only when the test moves it. A wait is a couple of
/// milliseconds of the Mac's, however long in cook time, so a ticker looks
/// often and a test never waits on the cook's clock.
final class TestClock: CookClock, @unchecked Sendable {
    private let lock = NSLock()
    private var nowS: Double

    init(_ nowS: Double) { self.nowS = nowS }

    var now: Date { lock.withLock { Date(timeIntervalSince1970: nowS) } }
    var seconds: Double { lock.withLock { nowS } }

    func set(_ s: Double) { lock.withLock { nowS = s } }
    func advance(_ s: Double) { lock.withLock { nowS += s } }

    func app(_ system: Date) -> Date { system }
    func real(_ app: Date) -> Date { app }
    func fromReal(_ system: Date) -> Date { system }
    func realInterval(until app: Date) -> TimeInterval { app.timeIntervalSince(now) }
    func sleep(_ cookSeconds: Double) async throws { try await Task.sleep(for: .milliseconds(2)) }
    func period(_ cookSeconds: Double) -> TimeInterval { cookSeconds }
    var altered: Bool { false }
}

/// The alarms, as the system would hold them: what was scheduled is pending.
@MainActor
final class FakeAlarm: AlarmScheduling {
    var authorized = true
    private(set) var scheduled: [(pullAt: Date, coolDoneAt: Date?)] = []
    private(set) var cancels = 0
    private var pending: Set<RingDeadline> = []

    func activate() {}
    func authorize() async -> Bool { authorized }
    func schedule(pullAt: Date, coolDoneAt: Date?, probe: Bool, cooling: Cooling) {
        scheduled.append((pullAt, coolDoneAt))
        pending = coolDoneAt == nil ? [.pull] : [.pull, .cooled]
    }
    func cancel() {
        cancels += 1
        pending = []
    }
    func pendingDeadlines() async -> Set<RingDeadline> { pending }
}

@MainActor
final class FakeRinger: AlarmRinging {
    private(set) var rung: [RingDeadline] = []
    private(set) var stops = 0
    var onScreenSince: Date?
    func activate() {}
    func ring(_ deadline: RingDeadline) { rung.append(deadline) }
    func stop() { stops += 1 }
    func preview(_ sound: AlarmSound) {}
}

@MainActor
final class FakeSharing: ResultSharing {
    var state = ShareState.fresh
    private(set) var host: ShareHost?
    private(set) var finals = 0
    private(set) var forgets = 0
    func start(host: ShareHost) { self.host = host }
    func forget() { forgets += 1 }
    func sendFinal() { finals += 1 }
}

/// The Lock Screen card: each call, in the order it reached the card.
final class FakeCard: LockScreenCard, @unchecked Sendable {
    enum Call: Equatable {
        case start(CookActivity.Stage)
        case update(CookActivity.Stage)
        case endAll
        case endAtTheirEnds
    }

    private let lock = NSLock()
    private var made: [Call] = []
    var calls: [Call] { lock.withLock { made } }

    func start(_ attributes: CookActivity, state: CookActivity.ContentState) async {
        lock.withLock { made.append(.start(state.stage)) }
    }
    func update(_ state: CookActivity.ContentState) async { lock.withLock { made.append(.update(state.stage)) } }
    func endAll() async { lock.withLock { made.append(.endAll) } }
    func endAtTheirEnds() async { lock.withLock { made.append(.endAtTheirEnds) } }
    @MainActor func logAll(_ when: String) {}
}

/// The debug log's events, as the app wrote them.
final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
    private var seen: [Screenshots.Event] = []
    var events: [Screenshots.Event] { lock.withLock { seen } }
    func add(_ e: Screenshots.Event) { lock.withLock { seen.append(e) } }
}

/// One test's world: every service a fake, the store empty but for this
/// build's mark, the clock at a fixed moment, and the words read from the
/// repository's copy/.
@MainActor
struct World {
    let store: MemoryStore
    let clock: TestClock
    let alarm = FakeAlarm()
    let ringer = FakeRinger()
    let sharing = FakeSharing()
    let card = FakeCard()
    let log = EventLog()

    /// The version this build is, as the tests say it.
    static let version = "0.5.0"
    static let build = "3"

    /// One set of surfaces for every test: they are a pure function of the
    /// pot, and a build is seconds.
    nonisolated(unsafe) static let grids = DecisionGrids()

    init(store: MemoryStore = MemoryStore(), at nowS: Double = 1_791_234_567) {
        self.store = store
        clock = TestClock(nowS)
        Copy.folder = Self.copyFolder
        Stores.store = store
        AppClock.source = clock
        Services.alarm = alarm
        Services.ringer = ringer
        Services.sharing = sharing
        Services.card = card
        Services.grids = Self.grids
        Services.announce = { _ in }
        let log = log
        Screenshots.output = { event, _ in log.add(event) }
        Stores.claim(Self.version, build: Self.build)
    }

    /// The repository's copy/, found above this file.
    static let copyFolder: URL = {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while dir.path != "/" {
            let copy = dir.appendingPathComponent("copy")
            if FileManager.default.fileExists(atPath: copy.appendingPathComponent("en.json").path) { return copy }
            dir = dir.deletingLastPathComponent()
        }
        fatalError("copy/en.json not found above \(#filePath)")
    }()

    /// Wait, on the main actor, until `done` holds: the cook's plans and
    /// surfaces land off it. Fails the test after `seconds` of the Mac's.
    func until(
        _ what: String, seconds: Double = 60, sourceLocation: SourceLocation = #_sourceLocation,
        _ done: () -> Bool
    ) async {
        let deadline = ContinuousClock.now + .seconds(seconds)
        while !done() {
            if ContinuousClock.now > deadline {
                Issue.record("timed out waiting for \(what)", sourceLocation: sourceLocation)
                return
            }
            try? await Task.sleep(for: .milliseconds(5))
        }
    }

    /// Until the cook has nothing under way, its plan on its pot's surface.
    func settled(_ cook: Cook, sourceLocation: SourceLocation = #_sourceLocation) async {
        await until("the cook to settle", sourceLocation: sourceLocation) {
            cook.isSettled && (cook.running == nil || cook.plan?.decided != nil)
        }
    }

    /// Until the ticker has run at least twice more at the clock as it now is.
    func ticked(_ cook: Cook, sourceLocation: SourceLocation = #_sourceLocation) async {
        let from = cook.ticks
        await until("the cook to tick", sourceLocation: sourceLocation) { cook.ticks >= from + 2 }
        await settled(cook, sourceLocation: sourceLocation)
    }

    /// The cook as stored, if one is.
    var stored: RunningCook? {
        guard let data = store.data(forKey: "cookInProgress.v3"),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return readRunningCook(object["cook"])
    }
}
