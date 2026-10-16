import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerShared

// What the app's logic reaches outside itself (`Services`, `AppClock`,
// `Stores`), as the tests give it: fakes that remember what was asked of
// them, a clock that moves only when a test moves it, and a store in memory.

/// The app's suite in memory, and every write it took, in order. A write needs
/// a `Stores.Pass`, so every one of them came through `Stores`.
final class MemoryStore: KeyValueStore, @unchecked Sendable {
    private(set) var values: [String: Any] = [:]
    /// Each write, in order: the key, and whether it set a value or removed one.
    private(set) var writes: [(key: String, removed: Bool)] = []

    init(_ values: [String: Any] = [:]) { self.values = values }

    var keys: [String] { Array(values.keys) }
    func object(forKey key: String) -> Any? { values[key] }
    func string(forKey key: String) -> String? { values[key] as? String }
    func double(forKey key: String) -> Double { (values[key] as? NSNumber)?.doubleValue ?? 0 }
    func bool(forKey key: String) -> Bool { (values[key] as? NSNumber)?.boolValue ?? false }
    func data(forKey key: String) -> Data? { values[key] as? Data }

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

/// The server and App Attest, as sharing reaches them (`ShareTransport`):
/// each request answered in turn from a list the test writes, a status or
/// nil for no answer, and 201 for a post (200 for a delete) once it runs
/// out; each App Attest call throws in turn what the test lists, then
/// succeeds.
@MainActor
final class FakeTransport: ShareTransport {
    var canAttest = true
    var eggAnswers: [Int?] = []
    var attestAnswers: [Int?] = []
    var deleteAnswers: [Int?] = []
    var keyFailures: [any Error] = []
    var attestFailures: [any Error] = []
    var assertionFailures: [any Error] = []

    /// Each post, in order: its path, its body as JSON, and its assertion.
    private(set) var posts: [(path: String, body: [String: Any], assertion: String?)] = []
    private(set) var deletes: [String] = []
    private(set) var keysMade = 0
    /// The hash each attestation was asked over.
    private(set) var attested: [Data] = []

    /// The eggs posted: each one's `seq`, its record's `uid` and day, and
    /// whether it was signed.
    var eggs: [(seq: Int, uid: String?, day: String?, signed: Bool)] {
        posts.filter { $0.path == "api/eggs" }.map { p in
            let record = p.body["record"] as? [String: Any]
            return (p.body["seq"] as? Int ?? -1, record?["uid"] as? String, record?["day"] as? String, p.assertion != nil)
        }
    }

    /// How many attestations were posted.
    var attestations: Int { posts.filter { $0.path == "api/attest" }.count }

    private func next(_ list: inout [Int?], or fallback: Int) -> Int? {
        list.isEmpty ? fallback : list.removeFirst()
    }

    func post(_ path: String, body: Data, assertion: String?) async -> Int? {
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        posts.append((path, json, assertion))
        return path == "api/attest" ? next(&attestAnswers, or: 201) : next(&eggAnswers, or: 201)
    }

    func delete(_ path: String) async -> Int? {
        deletes.append(path)
        return next(&deleteAnswers, or: 200)
    }

    func generateKey() async throws -> String {
        if !keyFailures.isEmpty { throw keyFailures.removeFirst() }
        keysMade += 1
        return "key-\(keysMade)"
    }

    func attestKey(_ keyId: String, clientDataHash: Data) async throws -> Data {
        if !attestFailures.isEmpty { throw attestFailures.removeFirst() }
        attested.append(clientDataHash)
        return Data("attestation of \(keyId)".utf8)
    }

    func assertion(_ keyId: String, clientDataHash: Data) async throws -> Data {
        if !assertionFailures.isEmpty { throw assertionFailures.removeFirst() }
        return Data("signed by \(keyId)".utf8)
    }
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

/// The planners a test made, held weakly. The app's globals - the store,
/// the clock, the services - are the next test's once it begins, so a fold or
/// a solve a test leaves under way would land in the next test's store.
@MainActor
private enum Made {
    final class Held {
        weak var planner: Planner?
        init(_ planner: Planner) { self.planner = planner }
    }
    static var planners: [Held] = []

    /// Those still folding or solving.
    static var busy: [Planner] { planners.compactMap(\.planner).filter { !World.idle($0) } }
}

/// Each test of the suite ends only once every planner it made has nothing
/// left to fold and no solve under way (`World.idle`), so none of its work
/// lands in the next test's store.
struct LeftIdle: SuiteTrait, TestTrait, TestScoping {
    var isRecursive: Bool { true }

    func provideScope(
        for test: Test, testCase: Test.Case?, performing function: @Sendable () async throws -> Void
    ) async throws {
        try await function()
        guard !test.isSuite else { return }
        await World.leftIdle()
    }
}

extension Trait where Self == LeftIdle {
    static var leftIdle: Self { Self() }
}

/// One test's world: every service a fake, the store empty, the clock at a fixed moment, and the words read from the
/// repository's copy/. A test makes its models and planners here
/// (`model()`, `planner()`), so that it ends once they are idle (`LeftIdle`);
/// a world that still finds one busy, or a model made while another of the
/// test's is busy, records an issue.
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

    /// One set of surfaces for every test, none ever dropped: they are a pure
    /// function of the pot and the posterior, and a build is seconds.
    static let grids = DecisionGrids(kept: .max, profilesKept: .max)

    init(store: MemoryStore = MemoryStore(), at nowS: Double = 1_791_234_567) {
        let busy = Made.busy
        if !busy.isEmpty {
            Issue.record("the last test left \(busy.count) planner(s) folding or solving, which write to this test's store")
        }
        Made.planners = []
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
        Stores.sweep()
    }

    /// A model, as the app makes it at launch, kept to check it is left idle.
    /// One made on the store while another is folding or solving, as a
    /// relaunch is, would read the store before that work lands in it.
    func model(sourceLocation: SourceLocation = #_sourceLocation) -> AppModel {
        if !Made.busy.isEmpty {
            Issue.record("a model made while another still folds or solves", sourceLocation: sourceLocation)
        }
        let model = AppModel()
        Made.planners.append(Made.Held(model.planner))
        return model
    }

    /// A planner on its own, likewise.
    func planner() -> Planner {
        let planner = Planner()
        Made.planners.append(Made.Held(planner))
        return planner
    }

    /// Whether a planner has nothing left to fold and no solve under way.
    /// Not draining is not enough: an egg logged is folded by a task that
    /// may not have begun (`Learning.logRecord`).
    static func idle(_ planner: Planner) -> Bool {
        !planner.learner.draining && planner.kept.folded == planner.kept.log.count && !planner.solver.busy
    }

    /// Until every planner made since the last world is idle; an issue if
    /// one is not within a minute of the Mac's.
    static func leftIdle() async {
        let deadline = ContinuousClock.now + .seconds(60)
        while !Made.busy.isEmpty {
            if ContinuousClock.now > deadline {
                Issue.record("a planner still folding or solving a minute after the test")
                return
            }
            try? await Task.sleep(for: .milliseconds(5))
        }
    }

    /// Until the planner has folded every egg in its log, and its solve
    /// after the fold is done.
    func learned(_ planner: Planner, sourceLocation: SourceLocation = #_sourceLocation) async {
        await until("the planner to fold its eggs and solve", sourceLocation: sourceLocation) { Self.idle(planner) }
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
