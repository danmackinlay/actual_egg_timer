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

/// Cook time that moves only when the test moves it. A sleep is a couple of
/// milliseconds of the Mac's, however long in cook time, so a ticker looks
/// often; a wait for a moment (`AppClock.wait`, a correction's settle) ends
/// once the test has moved the clock past it.
final class TestClock: CookClock, @unchecked Sendable {
    private let lock = NSLock()
    private var nowS: Double
    private var debug = false

    init(_ nowS: Double) { self.nowS = nowS }

    var now: Date { lock.withLock { Date(timeIntervalSince1970: nowS) } }
    var seconds: Double { lock.withLock { nowS } }

    func set(_ s: Double) { lock.withLock { nowS = s } }
    func advance(_ s: Double) { lock.withLock { nowS += s } }
    /// As a debug build's clock run fast or stepped is: a record made under
    /// it is marked (`AppClock.mark`).
    func alter() { lock.withLock { debug = true } }

    func app(_ system: Date) -> Date { system }
    func real(_ app: Date) -> Date { app }
    func fromReal(_ system: Date) -> Date { system }
    func realInterval(until app: Date) -> TimeInterval { app.timeIntervalSince(now) }
    func sleep(_ cookSeconds: Double) async throws { try await Task.sleep(for: .milliseconds(2)) }
    func period(_ cookSeconds: Double) -> TimeInterval { cookSeconds }
    var altered: Bool { lock.withLock { debug } }
}

/// The alarms, as the system would hold them (`Alarm`): each by its id and
/// its moment, pending until the test clock reaches it and delivered after.
/// A schedule replaces what is pending and asks for nothing already past; a
/// cancel takes what is pending and leaves what was delivered.
@MainActor
final class FakeAlarm: AlarmScheduling {
    var authorized = true
    /// Each schedule asked for, in order.
    private(set) var scheduled: [(pullS: Double?, cooledS: Double?)] = []
    private(set) var cancels = 0
    private let clock: TestClock
    private var requests: [String: Double] = [:]
    private var shown: Set<String> = []

    init(_ clock: TestClock) { self.clock = clock }

    static let ids: [RingDeadline: String] = [.pull: "cook.pull", .cooled: "cook.cool"]

    /// What is pending, by id, with its moment, epoch s.
    var pending: [String: Double] {
        deliver()
        return requests
    }

    /// The ids delivered and still shown.
    var delivered: Set<String> {
        deliver()
        return shown
    }

    /// Those whose moment has come, delivered.
    private func deliver() {
        let now = clock.seconds
        for (id, at) in requests where at <= now {
            requests[id] = nil
            shown.insert(id)
        }
    }

    func activate() {}
    func authorize() async -> Bool { authorized }
    func schedule(pullS: Double?, cooledS: Double?, probe: Bool, cooling: Cooling) {
        scheduled.append((pullS, cooledS))
        deliver()
        requests = [:]
        let now = clock.seconds
        if let p = pullS, p > now { requests["cook.pull"] = p }
        if let c = cooledS, c > now { requests["cook.cool"] = c }
    }
    func cancel() {
        cancels += 1
        deliver()
        requests = [:]
    }
    func pendingDeadlines() async -> Set<RingDeadline> {
        Set(Self.ids.filter { pending[$0.value] != nil }.keys)
    }
}

@MainActor
final class FakeRinger: AlarmRinging {
    private(set) var rung: [RingDeadline] = []
    private(set) var stops = 0
    var onScreenSinceS: Double?
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

/// The Lock Screen card: each call, in the order it reached the card, with
/// what it showed as the debug log says it (`CookCard`).
final class FakeCard: LockScreenCard, @unchecked Sendable {
    /// What a card showed: its stage; its end, epoch s (the test clock's
    /// moments are the system's); whether it counts up; and the cook as it
    /// describes it: doneness, peak yolk, mass, cooling.
    struct Shown: Equatable {
        let stage: CookActivity.Stage
        let ends: Double
        let up: Bool
        let cook: [String]

        init(_ s: CookActivity.ContentState) {
            stage = s.stage
            ends = s.ends.timeIntervalSince1970
            up = s.countsUp
            cook = [s.cook.doneness, s.cook.peakYolk, s.cook.eggMass, s.cook.cooling]
        }
    }

    enum Call: Equatable {
        case start(Shown)
        case update(Shown)
        case endAll
        case endAtTheirEnds

        /// What an update showed.
        var updated: Shown? { if case .update(let s) = self { s } else { nil } }
        /// The stage a start began.
        var started: CookActivity.Stage? { if case .start(let s) = self { s.stage } else { nil } }
        /// What a start or an update showed.
        var shown: Shown? {
            switch self {
            case .start(let s), .update(let s): s
            default: nil
            }
        }
    }

    private let lock = NSLock()
    private var made: [Call] = []
    var calls: [Call] { lock.withLock { made } }
    /// What the card last showed.
    var last: Shown? { calls.last { $0.shown != nil }?.shown }

    func start(_ attributes: CookActivity, state: CookActivity.ContentState) async {
        lock.withLock { made.append(.start(Shown(state))) }
    }
    func update(_ state: CookActivity.ContentState) async { lock.withLock { made.append(.update(Shown(state))) } }
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

/// The calibration before an egg, held back until released: a record made
/// again that has not landed, as when the app is killed before it does. A
/// cook whose fake is never released is left as a killed app leaves it.
@MainActor
final class HeldBefore: LearnedBefore {
    private let learner: Learning
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private var held = true
    /// How many times it has been asked.
    private(set) var asked = 0

    init(_ learner: Learning) { self.learner = learner }

    func calibrationBefore(_ index: Int?) async -> Calibration {
        asked += 1
        if held { await withCheckedContinuation { waiting.append($0) } }
        return await learner.calibrationBefore(index)
    }

    func release() {
        held = false
        let resumed = waiting
        waiting = []
        for c in resumed { c.resume() }
    }
}

/// What was said to VoiceOver, in order.
final class Announced: @unchecked Sendable {
    private let lock = NSLock()
    private var said: [String] = []
    var all: [String] { lock.withLock { said } }
    func add(_ s: String) { lock.withLock { said.append(s) } }
}

/// One test's world: every service a fake, the store empty but for this
/// build's mark, the clock at a fixed moment, and the words read from the
/// repository's copy/.
@MainActor
struct World {
    let store: MemoryStore
    let clock: TestClock
    let alarm: FakeAlarm
    let ringer = FakeRinger()
    let sharing = FakeSharing()
    let card = FakeCard()
    let log = EventLog()
    let announced = Announced()

    /// The version this build is, as the tests say it.
    static let version = "0.5.0"
    static let build = "3"

    /// One set of surfaces for every test: they are a pure function of the
    /// pot, and a build is seconds.
    static let grids = DecisionGrids()

    init(store: MemoryStore = MemoryStore(), at nowS: Double = 1_791_234_567) {
        self.store = store
        clock = TestClock(nowS)
        alarm = FakeAlarm(clock)
        Copy.folder = Self.copyFolder
        Stores.store = store
        AppClock.source = clock
        Services.alarm = alarm
        Services.ringer = ringer
        Services.sharing = sharing
        Services.card = card
        Services.grids = Self.grids
        let announced = announced
        Services.announce = { announced.add($0) }
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

    /// Until the cook has nothing under way, whatever its plan is on: a
    /// slow hob's lengthened plan is on no pot's surface.
    func quiet(_ cook: Cook, sourceLocation: SourceLocation = #_sourceLocation) async {
        await until("the cook to have nothing under way", sourceLocation: sourceLocation) { cook.isSettled }
    }

    /// Until the ticker has run at least twice more at the clock as it now
    /// is, and the cook has nothing under way.
    func ticked(_ cook: Cook, sourceLocation: SourceLocation = #_sourceLocation) async {
        let from = cook.ticks
        await until("the cook to tick", sourceLocation: sourceLocation) { cook.ticks >= from + 2 }
        await quiet(cook, sourceLocation: sourceLocation)
    }

    /// The phases of a cook the debug log says, in order, as the ticks saw
    /// them: idle left out.
    var phases: [String] {
        log.events.compactMap { e in
            if case .phase(let p) = e, p != Phase.idle.rawValue { p } else { nil }
        }
    }

    /// How many plans the debug log says were taken (`CookLog.plan`).
    var plans: Int {
        log.events.filter { if case .plan = $0 { true } else { false } }.count
    }

    /// The cook as stored, if one is.
    var stored: RunningCook? {
        store.data(forKey: Cook.savedKey).flatMap(Cook.readStored)?.cook
    }
}
