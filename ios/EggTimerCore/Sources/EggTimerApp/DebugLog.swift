import EggTimerCore
import Foundation
import Observation
import os

/// Launch arguments for a debug build, and the debug log the scripted checks
/// read. Debug builds only: a release build reads no launch argument
/// (`arguments`), so every flag here is off and `log` writes nothing, and it
/// has none of the screenshot kit and the waits (the `#if DEBUG` parts
/// below). What the rest of the app asks of this, it asks in every build,
/// and need not say which it is in.
///
/// The screenshot kit: a given screen on a simulator nobody drives
/// (`xcrun simctl launch … -uiScreen settings`).
///
/// - `-uiScreen settings`, `help`, `help-reliable`: push that page.
/// - `-uiScreen clause-egg`, `clause-from`, `clause-start`, `clause-cooling`:
///   open that clause's choice under the sentence.
/// - `-uiScreen certainty-open`: open what the certainty line under the time
///   says when pressed.
/// - `-uiScreen heating`: start a cook, as a tap on Start would.
/// - `-uiScreen end`: hold the page scrolled to its foot as it grows, so the
///   questions at Done are in the picture (`npm run ios:shots`).
/// - `-noAlarmPrompt YES`: answer the notification question with no, without
///   asking, so the system's alert is not in the picture.
/// - `-uiLanguage en-x-1750`: read in that catalogue, as a pick in the
///   picker would, before the first frame (`LanguageChoice.start`).
///
/// What the UI tests (ios/UITests, `npm run ios:e2e`) launch with, besides
/// those, as they tap the screen as a finger would:
///
/// - `-clockAt 1791234567 -clockSpeed 0`: the app's clock at that moment and
///   frozen there (`AppClock`); `-clockSpeed 60` runs it fast. A clock so
///   launched is stepped from outside: a line `<n> <at> <speed>` written to
///   `aet.clock` (in `-debugDir`) moves it to `at` and runs it on at
///   `speed`, and the log says `clock` with its `n` once it has, and `idle`
///   once the app has caught up. The tests freeze it at each moment they
///   check, and a tap lands at the moment it stands at. Sharing sends
///   nothing under either.
/// - `-settings <hex>`: the settings as stored, as JSON in hex
///   (`SettingsStore`), as UserDefaults reads a launch argument's data.
/// - `-muteAudio YES`: the ring at no volume and notifications without
///   sound, so a scripted run is silent.
/// - `-provisionalAlarms YES`: ask for quiet notifications, which the system
///   grants with no prompt, so the alarms are scheduled and read back on a
///   simulator nobody taps.
/// - `-debugDir <path>`: write the debug log there and read the clock's
///   steps from there, in place of `Library/Caches` in the container: a
///   directory on the Mac, which a simulator's app and its UI tests
///   (ios/UITests) both read and write, where the tests cannot see the
///   app's container.
///
/// And `-shareServer http://localhost:8888`: send what sharing sends there
/// rather than to the live site (`ShareNetwork.server`), for `npm run serve:dev`.
///
/// To hear the alarms without waiting for a cook (ios/README.md says how,
/// on a phone and on a simulator):
///
/// - `-alarmTest 10`: once the app is on screen and the notification
///   question answered (the real question, never `-provisionalAlarms`,
///   whose notifications come without a sound), the pull's and the cooling's
///   notifications set through the cook's own `Alarm.schedule`, 10 s and
///   20 s from now; and at each moment, if the app has been on screen since
///   before it, the app's own ring, as a cook's would (`deadlineToRing`).
///   From the idle screen: they replace a running cook's alarms.
/// - `-alarmSound hen` (`timer`, `cuckoo`): ring with that sound this launch,
///   as `-settings` gives the settings: the argument read over the stored
///   choice (`Suite`), nothing stored.
///
/// `log` writes one event as a line of JSON, to standard error and to
/// `aet.log` in `-debugDir`, or in `Library/Caches` in the app's container:
/// the phases, each plan,
/// the stored cook and the log as written, the alarms scheduled, cancelled
/// and read back, the rings, the Live Activities pushed and seen, the
/// corrections, and what the readout drew. A line is `{"t":<cook time, epoch s>,"ev":"<the
/// event>",<its fields>}`: `Event`'s case and its labelled values, as
/// `Codable` writes them, in the order of their names, a field with no value
/// left out.
public enum DebugLog {
    /// Where launch arguments are read: UserDefaults, whose argument domain
    /// holds them, in a debug build; none in a release build.
    static var arguments: UserDefaults? {
        #if DEBUG
        return .standard
        #else
        return nil
        #endif
    }

    /// Whether the debug log is written, for what does work only to log.
    public static var logging: Bool { arguments != nil }

    /// One event to the debug log; in a release build, nothing, and the
    /// event is never made.
    public static func log(_ event: @autoclosure () -> Event) {
        #if DEBUG
        let event = event()
        let encoder = JSONEncoder()
        // The same event the same line, every time, to read and to diff.
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.nonConformingFloatEncodingStrategy = .convertToString(
            positiveInfinity: "inf", negativeInfinity: "-inf", nan: "nan"
        )
        // `{"<case>":{<fields>}}`, as `Codable` writes an enum's case, made
        // one object with the moment.
        guard let data = try? encoder.encode(event), let json = String(data: data, encoding: .utf8),
              let colon = json.firstIndex(of: ":") else { return }
        let name = json[json.index(json.startIndex, offsetBy: 2)..<json.index(before: colon)]
        let fields = json[json.index(after: colon)...].dropFirst().dropLast(2)
        let t = String(format: "%.3f", AppClock.nowS)
        let text = Data("{\"t\":\(t),\"ev\":\"\(name)\"\(fields.isEmpty ? "" : ",")\(fields)}\n".utf8)
        output(event, text)
        #endif
    }

    #if DEBUG
    /// Where a line goes: standard error, and appended to aet.log in
    /// `-debugDir`, or in Library/Caches in the app's container, which a
    /// simulator's host reads (`simctl get_app_container … data`). The tests take the
    /// events instead, and write nothing to the Mac's own Caches. The
    /// closure is swapped behind a lock; a line is written from any thread
    /// (the clock's steps), so each is appended whole (`append`).
    static var output: @Sendable (Event, Data) -> Void {
        get { outputSet.withLock { $0 } }
        set { outputSet.withLock { $0 = newValue } }
    }
    private static var outputSet: OSAllocatedUnfairLock<@Sendable (Event, Data) -> Void> {
        if let test = TestGlobals.current { return test.output }
        return launchOutput
    }
    static let launchOutput = OSAllocatedUnfairLock<@Sendable (Event, Data) -> Void>(initialState: { _, text in
        FileHandle.standardError.write(text)
        guard let dir = debugDir else { return }
        append(text, to: dir.appendingPathComponent("aet.log"))
    })

    /// Where the debug log is written and the clock's steps read (`AppClock`):
    /// `-debugDir`, or Library/Caches in the app's container.
    static var debugDir: URL? {
        if let path = arguments?.string(forKey: "debugDir") { return URL(fileURLWithPath: path, isDirectory: true) }
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    }

    /// `text` added at the file's end in one `write` to a descriptor opened
    /// `O_APPEND`, so the system moves to the end and writes as one step.
    /// A seek to the end and a write after it are two, and two threads
    /// between them write at the same offset: the later line overwrites the
    /// start of the earlier, which the host read as half a line.
    static func append(_ text: Data, to url: URL) {
        let fd = Darwin.open(url.path, O_WRONLY | O_APPEND | O_CREAT, 0o644)
        guard fd >= 0 else { return }
        defer { Darwin.close(fd) }
        text.withUnsafeBytes { bytes in
            guard let base = bytes.baseAddress else { return }
            var done = 0
            while done < bytes.count {
                let n = Darwin.write(fd, base + done, bytes.count - done)
                if n < 0, errno == EINTR { continue }
                if n <= 0 { return }
                done += n
            }
        }
    }
    #endif

    /// Whether the app is in the foreground, where the page is drawn
    /// (`idle(after:)`): UIApplication's, set by the app.
    @MainActor public static var appActive: () -> Bool = { true }

    public static var provisionalAlarms: Bool { arguments?.bool(forKey: "provisionalAlarms") ?? false }
    /// `-muteAudio YES`: the in-app ring plays at no volume and notifications
    /// carry no sound, so a scripted run (`npm run ios:e2e`) is silent on the
    /// Mac's speakers; everything else about the ring and the alarms is as is.
    public static var muteAudio: Bool { arguments?.bool(forKey: "muteAudio") ?? false }
    public static var language: String? { arguments?.string(forKey: "uiLanguage") }
    public static var noAlarmPrompt: Bool { arguments?.bool(forKey: "noAlarmPrompt") ?? false }
    /// `-shareServer`: where sharing sends, in place of the live site.
    public static var shareServer: URL? { arguments?.string(forKey: "shareServer").flatMap(URL.init(string:)) }
}

#if DEBUG
extension DebugLog {
    /// The screenshot kit's screen (above).
    public static var scene: String? { arguments?.string(forKey: "uiScreen") }
    /// `-alarmTest <s>`: the alarms' lead, s (above; `AlarmTest`, in the app).
    public static var alarmTestS: Double? {
        arguments?.object(forKey: "alarmTest") == nil ? nil : arguments?.double(forKey: "alarmTest")
    }
}
#endif

extension DebugLog {
    /// What the debug log says, one case an event, its values the line's
    /// fields (`log`). Times are epoch s in cook time unless said; a value
    /// that is none is left out of the line. Decodable too, for the UI tests
    /// (ios/UITests), which read the log back by these cases.
    public enum Event: Codable, Equatable {
        /// The app launched: its home, the data container, where its stores'
        /// plist is.
        case launched(home: String)

        // The clock.
        /// The clock stepped from outside (`AppClock.takeStep`): step `n`,
        /// to `at`, running on at `speed` (0 frozen).
        case clock(n: Int, at: Double, speed: Double)
        /// After step `step`, the app caught up with it: nothing under way
        /// and the screen drawn (`idle(after:)`). What a script waits for
        /// after every step.
        case idle(step: Int)

        // The cook.
        case phase(phase: String)
        /// The cook has nothing under way (`Cook.logIfSettled`).
        case settled
        /// A plan taken: its deadlines, whether the slow hob lengthened it,
        /// whether it is on its pot's surface, when the slow hob lengthens it
        /// next, whether it asks if the eggs are still in, and whether the
        /// egg is overdue.
        case plan(
            pull: Double, cooled: Double?, lengthened: Bool, surface: Bool, next: Double?, asking: Bool,
            overdue: Bool
        )
        /// The cook as stored, as the store holds it; none when cleared.
        case stored(value: Encoded?)
        /// A cook picked back up at launch, in this phase, and whether the
        /// clock wrote events it found past.
        case restore(phase: String, eventsWritten: Bool)
        case restoreTooOld
        /// A cook picked back up has its alarms and its card again.
        case restored
        case ring(deadline: String)
        /// A card pushed (`what`: `start`, `update`): its stage, its end,
        /// whether it counts up, and what it says of the cook.
        case activity(what: String, stage: String, ends: Int, up: Bool, cook: [String?])
        /// A card the system holds, read at launch (`when`: `launch`,
        /// `launch+3s`).
        case activitySeen(when: String, state: String, stage: String, ends: Int)

        // The alarms.
        /// An alarm asked for, for `at`, `inS` of the system's seconds on,
        /// with the sound file it names (none under `-muteAudio`), and
        /// whether the app's bundle has that file, where the system looks.
        case scheduled(id: String, at: Double, inS: Double, sound: String?, bundled: Bool)
        case notScheduled(id: String, error: String)
        case alarmsCancelled
        /// The alarms a read-back found pending, each with its moment.
        case pending(alarms: [PendingAlarm])
        /// Those it found delivered and still shown.
        case delivered(ids: [String])
        /// What the system allows this app's notifications, read as the
        /// alarms are asked for: the permission (`status`), and whether its
        /// sound, its banner, the Lock Screen and the time-sensitive level
        /// are on (`enabled`, `disabled`, `notSupported`); and whether this
        /// launch is muted (`-muteAudio`).
        case notificationSettings(
            status: String, sound: String, alert: String, lockScreen: String, timeSensitive: String, muted: Bool
        )
        /// A notification come while the app is on screen: whether it
        /// carries a sound, and what the app has the system present of it.
        case presented(id: String, sound: Bool, options: [String])

        // The sounds.
        /// One of the files an alarm can name, read at launch: whether the
        /// bundle has it, and its length, s, and its audio format's code.
        case soundFile(name: String, bundled: Bool, seconds: Double?, format: String?)
        /// The ring in the app begun: its file, how many frames it read
        /// (none if it read none), the audio session's category and whether
        /// it took, the engine running and the player playing, the media
        /// volume (0-1) and where the sound goes; and the error, if any.
        case ringing(
            file: String, frames: Int?, category: String, active: Bool, engine: Bool, playing: Bool,
            volume: Double, route: [String], error: String?
        )
        /// A ring asked for and not sounded, and why.
        case ringSkipped(deadline: String, reason: String)

        // The results log and the record.
        /// The log as written: how many eggs, how many folded, and the last.
        case log(count: Int, folded: Int, last: Encoded?)

        // The stores (`Stores.sweep`).
        case swept(key: String)
        /// A key written to the store (`Stores`), and its value if it is a
        /// number or a text.
        case wrote(key: String, number: Double?, text: String?)

        // The idle screen.
        /// An answer on screen: its time, whether it is decided on its pot's
        /// surface, and whether it has its odds.
        case answer(cookS: Double, decided: Bool, odds: Bool)

        // Corrections while a cook runs (`InHand`).
        /// A change in hand, on this group of controls.
        case edit(group: String?)
        /// The change in hand committed: the fields it changed, and the start
        /// if it moved it.
        case editCommitted(fields: [String], start: Double?)

        // The screen.
        /// A clause's panel the cook opened, and how the page scrolled to it:
        /// to its foot (`bottom`), to its head (`top`), or not at all, on
        /// screen already (`none`).
        case reveal(clause: String, scroll: String)
        /// One frame of the readout: the moment it was drawn for, and what
        /// it drew, the certainty's time range none with no certainty.
        case frame(at: Double, phase: String, big: String, sub: String, range: String?)
    }

    /// A value the app stores as JSON, written into a line as it encodes;
    /// read back from a line as the JSON it was (`JSONValue`).
    public struct Encoded: Codable, Equatable {
        public let value: any Encodable

        public init(value: any Encodable) {
            self.value = value
        }

        public init(from decoder: Decoder) throws { value = try JSONValue(from: decoder) }

        public func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }

        /// The value as `type`, decoded from its JSON; nil if it is not one.
        public func decoded<T: Decodable>(as type: T.Type) -> T? {
            guard let data = try? JSONEncoder().encode(self) else { return nil }
            return try? JSONDecoder().decode(type, from: data)
        }

        public static func == (a: Encoded, b: Encoded) -> Bool {
            (try? JSONEncoder().encode(a)) == (try? JSONEncoder().encode(b))
        }
    }

    public struct PendingAlarm: Codable, Equatable {
        public let id: String
        /// When it fires, cook time, whole s; none without an interval trigger.
        public let at: Int?

        public init(id: String, at: Int?) {
            self.id = id
            self.at = at
        }
    }
}

/// Any JSON, as a line's stored value is read back (`DebugLog.Encoded`).
public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

#if DEBUG
extension DebugLog {
    /// What the screen draws again for after a step: read by the page and
    /// by its timelines (ContentView), so that a change of it draws them at
    /// the clock's new moment, a frozen clock's timelines otherwise waiting
    /// up to a second of the system's.
    @Observable @MainActor
    public final class Probe {
        public var drawn = 0
    }

    @MainActor public static let probe = Probe()
    /// The app's model, for what `idle(after:)` waits on (`watch`).
    @MainActor static weak var model: AppModel?
    @MainActor private static var drawing: [CheckedContinuation<Void, Never>] = []

    /// The app's model, watched for what a step's `idle` waits on: once, as
    /// the screen comes up (ContentView).
    @MainActor public static func watch(_ model: AppModel) {
        self.model = model
    }

    /// Step `n` taken (`AppClock.takeStep`, off the main actor).
    static func stepped(_ n: Int) {
        Task { @MainActor in await idle(after: n) }
    }

    /// Once the app has caught up with step `n`, `idle`: the cook has
    /// ticked at the new moment; nothing is under way in the cook (a record
    /// made again among it), the planner or a change in hand; and the page
    /// has been drawn since, at the new moment. A UI test waits for it after
    /// every step, so that what it checks next, that something did not happen
    /// as much as that it did, is checked once the app is done however slow
    /// the machine, never after a span of the system's time.
    @MainActor private static func idle(after n: Int) async {
        while model == nil { try? await Task.sleep(for: .milliseconds(20)) }
        guard let model else { return }
        let ticks = model.cook.ticks
        while true {
            while underWay(model, ticks: ticks) { try? await Task.sleep(for: .milliseconds(20)) }
            // In the background the page is not drawn, and nothing waits for it.
            if appActive() { await draw() }
            if !underWay(model, ticks: ticks) { break }
        }
        log(.idle(step: n))
    }

    /// Whether the app is still at work on a step taken when the cook had
    /// ticked `ticks` times.
    @MainActor private static func underWay(_ model: AppModel, ticks: Int) -> Bool {
        let planner = model.planner
        return (model.cook.ticking && model.cook.ticks <= ticks)
            || !model.cook.isSettled
            || model.inHand.underWay
            || planner.solver.busy || planner.learner.draining
    }

    /// The page drawn again: once a pass of the screen has followed.
    @MainActor private static func draw() async {
        await withCheckedContinuation { c in
            drawing.append(c)
            probe.drawn &+= 1
        }
    }

    /// The page has drawn `probe` again (ContentView): resumed once that
    /// pass of the screen is over, with what it logged.
    @MainActor public static func drawn() {
        Task { @MainActor in
            let waiting = drawing
            drawing = []
            for c in waiting { c.resume() }
        }
    }
}
#endif
