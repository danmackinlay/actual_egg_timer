import Foundation
import os
import EggTimerCore
import EggTimerShared

/// What the app's logic reaches outside itself, as protocols: the four
/// singletons, the Lock Screen card and VoiceOver here, the clock in
/// AppClock.swift (`CookClock`) and the store in Store.swift
/// (`KeyValueStore`).
///
/// One of the singletons lives in this library (`DecisionGrids`), and so
/// does `Sharing`, made in the app over its `ShareTransport` (`ShareNetwork`,
/// URLSession and App Attest); the other two, and the card, need what only
/// an iPhone has -
/// notifications, sound, ActivityKit - and live in the app (ios/App), which
/// puts them here at launch, before anything else runs
/// (`ActualEggTimerApp.init`). The tests put fakes here instead
/// (ios/EggTimerCore/Tests/EggTimerAppTests).
///
/// Until the app fills it, each is one that does nothing: no alarm, no
/// ring, no card, nothing shared.
public enum Services {
    @MainActor public static var alarm: any AlarmScheduling {
        get { held.alarm }
        set { held.alarm = newValue }
    }
    @MainActor public static var ringer: any AlarmRinging {
        get { held.ringer }
        set { held.ringer = newValue }
    }
    @MainActor public static var sharing: any ResultSharing {
        get { held.sharing }
        set { held.sharing = newValue }
    }
    /// Read on the main actor, called off it in the order the cook made its
    /// calls (`CookCard`).
    @MainActor public static var card: any LockScreenCard {
        get { held.card }
        set { held.card = newValue }
    }
    /// Said to VoiceOver, at once: the start's limit reached (`InHand`).
    @MainActor public static var announce: (Words) -> Void {
        get { held.announce }
        set { held.announce = newValue }
    }
    @MainActor static var grids: any DecisionSurfaces {
        get { held.grids }
        set { held.grids = newValue }
    }

    /// The services, as the launch holds them or a test does.
    @MainActor final class Held {
        var alarm: any AlarmScheduling = Unwired()
        var ringer: any AlarmRinging = Unwired()
        var sharing: any ResultSharing = Unwired()
        var card: any LockScreenCard = NoCard()
        var announce: (Words) -> Void = { _ in }
        var grids: any DecisionSurfaces = DecisionGrids.shared

        init() {}

        /// Another holding the same services.
        init(_ other: Held) {
            (alarm, ringer, sharing, card, announce, grids) =
                (other.alarm, other.ringer, other.sharing, other.card, other.announce, other.grids)
        }
    }

    /// The launch's services; a test's own while it runs (`TestGlobals`).
    @MainActor private static var held: Held {
        #if DEBUG
        if let test = TestGlobals.current { return test.services }
        #endif
        return launch
    }
    @MainActor static let launch = Held()
}

#if DEBUG
/// One test's own globals: the services, the clock, the store, the debug
/// log's output and the settings as last saved. Each of those globals reads
/// and writes the test's own while one is bound (`$current`), and the
/// launch's otherwise, so tests that each bind their own run side by side.
/// A task made inside the binding inherits it; a detached one does not, and
/// none reads these. Only a debug build has it: a release build reads the
/// launch's, and nothing else.
final class TestGlobals: @unchecked Sendable {
    @TaskLocal static var current: TestGlobals?

    let services: Services.Held
    @MainActor var savedSettings: AppSettings
    let clock: OSAllocatedUnfairLock<any CookClock>
    let output: OSAllocatedUnfairLock<@Sendable (DebugLog.Event, Data) -> Void>
    private let storeSet: OSAllocatedUnfairLock<any KeyValueStore>

    var store: any KeyValueStore {
        get { storeSet.withLockUnchecked { $0 } }
        set { storeSet.withLockUnchecked { $0 = newValue } }
    }

    /// What the launch holds, until the test puts its own in place.
    @MainActor init() {
        services = Services.Held(Services.launch)
        savedSettings = SettingsStore.launchSaved
        clock = OSAllocatedUnfairLock(initialState: AppClock.launchSource.withLock { $0 })
        output = OSAllocatedUnfairLock(initialState: DebugLog.launchOutput.withLock { $0 })
        storeSet = OSAllocatedUnfairLock(uncheckedState: Stores.launchStore)
    }
}
#endif

/// The cook's alarms, with the system (`Alarm`, UserNotifications): set at
/// absolute moments, and read back rather than assumed.
@MainActor
public protocol AlarmScheduling: AnyObject {
    /// Whether alarms may be set, asking the cook the first time.
    func authorize() async -> Bool
    /// These alarms and no others, at these moments, epoch s in cook time:
    /// none for a deadline that is nil.
    func schedule(pullS: Double?, cooledS: Double?, probe: Bool, cooling: Cooling)
    func cancel()
    /// The deadlines a notification holds, pending or delivered.
    func pendingDeadlines() async -> Set<RingDeadline>
}

/// The in-app ring, for a deadline no notification holds (`Ringer`).
@MainActor
public protocol AlarmRinging: AnyObject {
    /// Since when the app has been on screen, epoch s in cook time, or nil
    /// while it is not.
    var onScreenSinceS: Double? { get }
    func ring(_ deadline: RingDeadline)
    func stop()
    /// One sound played once, as the cook picks it.
    func preview(_ sound: AlarmSound)
}

/// Sharing results, when the cook has turned it on (`Sharing`).
@MainActor
public protocol ResultSharing: AnyObject {
    var state: ShareState { get }
    func start(host: ShareHost)
    /// A new id for the next egg: Forget everything.
    func forget()
    /// Send what is final now.
    func sendFinal()
}

/// What sharing reads of the app: the log, and how much of it is final.
public struct ShareHost {
    public var log: @MainActor () -> [EggRecord]
    /// How many eggs at the head of the log are final: all but the stored
    /// cook's, while it can still be corrected (`openEggId`).
    public var finalCount: @MainActor () -> Int

    public init(log: @escaping @MainActor () -> [EggRecord], finalCount: @escaping @MainActor () -> Int) {
        self.log = log
        self.finalCount = finalCount
    }
}

/// The cook's Live Activity (`LiveActivity`, ActivityKit).
public protocol LockScreenCard: Sendable {
    func start(_ attributes: CookActivity, state: CookActivity.ContentState) async
    func update(_ state: CookActivity.ContentState) async
    func endAll() async
    /// Every card the system holds, to the debug log.
    @MainActor func logAll(_ when: String)
}

/// The decision surfaces and the odds at every level, built off the main
/// actor and kept (`DecisionGrids`).
public protocol DecisionSurfaces: Sendable {
    func cached(_ inputs: DecisionInputs) async -> DoseGrid?
    func grid(_ inputs: DecisionInputs) async -> DoseGrid
    func cachedProfile(_ inputs: DecisionInputs, _ c: Calibration) async -> OddsProfile?
    func profile(_ inputs: DecisionInputs, _ c: Calibration) async -> OddsProfile
}

/// What stands in until the app fills `Services`: nothing happens.
@MainActor
final class Unwired: AlarmScheduling, AlarmRinging, ResultSharing {
    func authorize() async -> Bool { false }
    func schedule(pullS: Double?, cooledS: Double?, probe: Bool, cooling: Cooling) {}
    func cancel() {}
    func pendingDeadlines() async -> Set<RingDeadline> { [] }
    var onScreenSinceS: Double? { nil }
    func ring(_ deadline: RingDeadline) {}
    func stop() {}
    func preview(_ sound: AlarmSound) {}
    var state: ShareState { .fresh }
    func start(host: ShareHost) {}
    func forget() {}
    func sendFinal() {}
}

/// No card: what stands in until the app fills `Services.card`.
struct NoCard: LockScreenCard {
    func start(_ attributes: CookActivity, state: CookActivity.ContentState) async {}
    func update(_ state: CookActivity.ContentState) async {}
    func endAll() async {}
    func logAll(_ when: String) {}
}
