import Foundation
import EggTimerCore
import EggTimerShared

/// What the app's logic reaches outside itself, as protocols: the six
/// singletons, the Lock Screen card and VoiceOver here, the clock in
/// AppClock.swift (`CookClock`) and the store in Store.swift
/// (`KeyValueStore`).
///
/// Three of the singletons live in this library (`DecisionGrids`,
/// `LanguageChoice`, `AlarmSoundChoice`); the other three, and the card,
/// need what only an iPhone has - notifications, sound, App Attest,
/// ActivityKit - and live in the app (ios/App), which puts them here at
/// launch, before anything else runs (`ActualEggTimerApp.init`). The tests
/// put fakes here instead (ios/EggTimerCore/Tests/EggTimerAppTests).
///
/// Until the app fills it, each is one that does nothing: no alarm, no
/// ring, no card, nothing shared.
public enum Services {
    @MainActor public static var alarm: any AlarmScheduling = Unwired()
    @MainActor public static var ringer: any AlarmRinging = Unwired()
    @MainActor public static var sharing: any ResultSharing = Unwired()
    /// Read on the main actor, called off it in the order the cook made its
    /// calls (`CookCard`).
    @MainActor public static var card: any LockScreenCard = NoCard()
    /// Said to VoiceOver, at once: the start's limit reached (`Edits`).
    @MainActor public static var announce: (String) -> Void = { _ in }
    @MainActor static var grids: any DecisionSurfaces = DecisionGrids.shared
    @MainActor public static var language: any LanguageChoosing = LanguageChoice.shared
    @MainActor static var alarmSound: any AlarmSoundChoosing = AlarmSoundChoice.shared
}

/// The cook's alarms, with the system (`Alarm`, UserNotifications): set at
/// absolute moments, and read back rather than assumed.
@MainActor
public protocol AlarmScheduling: AnyObject {
    /// Ready for a notification to fire: before anything can.
    func activate()
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
    func activate()
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
    /// Every card ended to go at its own end: an earlier build's.
    func endAtTheirEnds() async
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

/// The language the cook reads (`LanguageChoice`).
@MainActor
public protocol LanguageChoosing: AnyObject {
    var state: LanguageState { get }
    func start()
    func pick(_ tag: String)
}

/// The alarm's sound (`AlarmSoundChoice`).
@MainActor
public protocol AlarmSoundChoosing: AnyObject {
    var sound: AlarmSound { get }
    func pick(_ next: AlarmSound)
}

/// What stands in until the app fills `Services`: nothing happens.
@MainActor
final class Unwired: AlarmScheduling, AlarmRinging, ResultSharing {
    func activate() {}
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
    func endAtTheirEnds() async {}
    func logAll(_ when: String) {}
}
