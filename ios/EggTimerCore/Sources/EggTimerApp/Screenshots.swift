#if DEBUG
import EggTimerCore
import Foundation
import Observation

/// Launch arguments that put a debug build on a given screen, so screenshots
/// can be taken on a simulator nobody drives (`xcrun simctl launch … -uiScreen
/// settings`). Debug builds only; a release build has none of this.
///
/// - `-uiScreen settings`, `help`, `help-reliable`: push that page.
/// - `-uiScreen clause-egg`, `clause-from`, `clause-start`, `clause-cooling`:
///   open that clause's choice under the sentence.
/// - `-uiScreen heating`: start a cook, as a tap on Start would.
/// - `-uiScreen done`: start a cook and move it back in time, so its cooling
///   ended a moment ago and the eggs came out on time: the questions after
///   an egg (`Cook.skipToDone`). With `-noAlarmPrompt YES`, so no alarm is
///   set for a moment already past.
/// - `-noAlarmPrompt YES`: answer the notification question with no, without
///   asking, so the system's alert is not in the picture.
/// - `-seedEggs got-jammy,got-soft`: on a fresh install, write that many
///   eggs into the log through the app's own store, each cooked at the level
///   and setup on screen, and fold them (`Planner.seed`). A learned state
///   without cooking. `got-` and one of the five words is the yolk the cook
///   got (DECISIONS.md 92): `got-runny` to `got-hard`. An answer about the
///   white follows a slash: `got-jammy/firm`, `got-soft/tender`.
/// - `-uiScreen certainty-open`: open what the certainty line under the time
///   says when pressed.
/// - `-uiLanguage en-x-1750`: read in that catalogue, as a pick in the
///   picker would, before the first frame (`LanguageChoice.start`).
/// - `-uiScrollAnchor 0.7`: open the egg's page scrolled that far down, for
///   a screenshot of what the largest text sizes push off the screen.
/// - `-uiDo eggsIn@launch+1,set:size=3@30,drag:0.3/0.1@pull-60,release@pull-58`:
///   besides the taps below, `eggsIn` (Start, from idle; `launch` counts
///   from the launch), `set:<control>=<value>` (a control changed as a tap
///   would: `level`, `size`, `mass`, `from`, `start`, `cooling`, `heatOff`,
///   `water`, `eggs`, `altitude`, and `language`, a tag as the picker
///   would pick it), `drag:<levels>` and `release` (the
///   slider held and moved, then let go), `start:+3` (the start's + or −
///   pressed so many times), `stillIn` and `stillOut` (the two answers to
///   "still in the water?"), `open:settings` or `open:clause-start`.
/// - `-sectionAhead 540`: draw the egg in cross-section as it will be that
///   many seconds on in the cook as planned, the pull and its grace included;
///   with `-uiScreen heating`, a cook part done without waiting for it.
/// - `-perfProbe all`: after the first solve, tap, hold and drag the inputs
///   on a script and print how long each takes to reach the screen
///   (`Perf.swift`). `-settings.v1 <hex>`, the settings as stored, as JSON
///   in hex (`SettingsStore`), starts it from the same place each time.
/// - `-shareServer http://localhost:8888`: send what sharing sends there
///   rather than to the live site (`Sharing.server`), for `npm run
///   serve:dev`.
/// - `-clockAt 1791234567 -clockSpeed 0`: the app's clock at that moment and
///   frozen there (`AppClock`); `-clockSpeed 60` runs it fast. A clock so
///   launched is stepped from outside: a line `<n> <at> <speed>` written to
///   `Library/Caches/aet.clock` in the container moves it to `at` and runs
///   it on at `speed`, and the log says `clock` with its `n` once it has. The
///   scripted checks freeze it at each moment they check. Sharing sends
///   nothing under either.
/// - `-cookAgo 7190`: with `-uiScreen heating`, the cook once started moved
///   back that many seconds, every time in it (`Cook.moveBack`): a slow hob
///   past its guesses, or a cook about to be too old, on screen. The cook
///   moved, not the clock: `-clockAt` moves the clock instead, which needs
///   a cook stored to move past.
/// - `-doneAgo 3590`: with `-uiScreen done`, the cooling ended that many
///   seconds ago rather than 2.
/// - `-uiAnswer jammy`, `jammy/tender`, `/firm`: at Done, answer the yolk,
///   the white or both, as the buttons would (`AppModel.answer`), after
///   `-uiAnswerAfter 5` seconds (default 3; the system's seconds, not cook
///   time), so a simulator nobody taps can answer; with no `-uiScreen`, a
///   cook restored at Done is answered so.
/// - `-uiDo boil@470,out@pull+3,again@cooled+5`: tap, each once, when the
///   cook's clock reaches a moment of the cook (`drive`): `boil` (Full
///   rolling boil), `out` (the egg out at the pull), `cancel`, `again`
///   (Start again), `answer:jammy/tender` (as `-uiAnswer`). The moment is
///   seconds after the start, or after `boil` (the boil tapped), `pull` or
///   `cooled` (the plan's deadlines), the cook as restored included; a
///   moment once known is kept, so a tap still comes after the cook has
///   ended. What the scripted checks tap with, in place of the screen's
///   layout.
/// - `-muteAudio YES`: the ring at no volume and notifications without
///   sound, so a scripted run is silent (`npm run ios:e2e` always passes it).
/// - `-uiHoldAsRan YES`: a correction after the pull is never planned as it
///   ran while the cook runs in this launch, as if the app were killed
///   before it landed: the stale cook a relaunch then finds (`Cook`).
/// - `-uiFailRemake YES`: an ended cook's record is never made again in this
///   launch, as if it could not be: the cook left stored for the next launch
///   (`Cook`).
/// - `-provisionalAlarms YES`: ask for quiet notifications, which the system
///   grants with no prompt, so the alarms are scheduled and read back on a
///   simulator nobody taps.
///
/// `log` writes one event as a line of JSON, to standard error and to
/// `Library/Caches/aet.log` in the app's container: the phases, each plan,
/// the stored cook and the log as written, the alarms scheduled, cancelled
/// and read back, the rings, the Live Activities pushed and seen, the taps
/// of `-uiDo`, and what the screen says, which the scripted checks read
/// (`tools/iosE2e.ts`). A line is `{"t":<cook time, epoch s>,"ev":"<the
/// event>",<its fields>}`: `Event`'s case and its labelled values, as
/// `Codable` writes them, in the order of their names, a field with no value
/// left out.
public enum Screenshots {
    public static func log(_ event: Event) {
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
    }

    /// Where a line goes: standard error, and appended to
    /// Library/Caches/aet.log in the app's container, which a simulator's
    /// host reads (`simctl get_app_container … data`). The tests take the
    /// events instead, and write nothing to the Mac's own Caches.
    nonisolated(unsafe) public static var output: (Event, Data) -> Void = { _, text in
        FileHandle.standardError.write(text)
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        let url = dir.appendingPathComponent("aet.log")
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(text)
            try? handle.close()
        } else {
            try? text.write(to: url)
        }
    }

    /// Whether the app is in the foreground, where the page is drawn
    /// (`idle(after:)`): UIApplication's, set by the app.
    @MainActor public static var appActive: () -> Bool = { true }

    public static var provisionalAlarms: Bool { UserDefaults.standard.bool(forKey: "provisionalAlarms") }
    /// `-muteAudio YES`: the in-app ring plays at no volume and notifications
    /// carry no sound, so a scripted run (`npm run ios:e2e`) is silent on the
    /// Mac's speakers; everything else about the ring and the alarms is as is.
    public static var muteAudio: Bool { UserDefaults.standard.bool(forKey: "muteAudio") }
    /// `-uiHoldAsRan YES`: a correction after the pull never has its record
    /// made again while the cook runs in this launch (`Cook`), as if the app
    /// were killed before it landed, so a script can find the stale cook
    /// stored at the next launch. Read at launch; a test sets it.
    nonisolated(unsafe) public static var holdAsRan = UserDefaults.standard.bool(forKey: "uiHoldAsRan")
    /// `-uiFailRemake YES`: an ended cook's record is never made again in
    /// this launch (`Cook`): the cook stays stored for the next. Read at
    /// launch; a test sets it.
    nonisolated(unsafe) public static var failRemake = UserDefaults.standard.bool(forKey: "uiFailRemake")
    public static var scene: String? { UserDefaults.standard.string(forKey: "uiScreen") }
    public static var cookAgo: Double { UserDefaults.standard.double(forKey: "cookAgo") }
    public static var doneAgo: Double {
        UserDefaults.standard.object(forKey: "doneAgo") == nil ? 2 : UserDefaults.standard.double(forKey: "doneAgo")
    }
    public static var answerAfter: Double {
        UserDefaults.standard.object(forKey: "uiAnswerAfter") == nil
            ? 3 : UserDefaults.standard.double(forKey: "uiAnswerAfter")
    }
    /// `-uiAnswer`'s yolk and white, either possibly nil; nil when not given.
    public static var answer: (yolk: YolkWord?, white: WhiteReport?)? {
        guard let raw = UserDefaults.standard.string(forKey: "uiAnswer") else { return nil }
        let parts = raw.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        return (YolkWord(rawValue: parts[0]), parts.count > 1 ? WhiteReport(rawValue: parts[1]) : nil)
    }
    public static var language: String? { UserDefaults.standard.string(forKey: "uiLanguage") }
    public static var noAlarmPrompt: Bool { UserDefaults.standard.bool(forKey: "noAlarmPrompt") }
    public static var sectionAhead: Double { UserDefaults.standard.double(forKey: "sectionAhead") }
    public static var scrollAnchor: Double? {
        UserDefaults.standard.object(forKey: "uiScrollAnchor") == nil
            ? nil : UserDefaults.standard.double(forKey: "uiScrollAnchor")
    }
    public static var seedEggs: [SeedAnswer] {
        guard let list = UserDefaults.standard.string(forKey: "seedEggs") else { return [] }
        return list.split(separator: ",").compactMap { entry in
            // Split at the dash and the slash, or at anything else that is
            // not a letter.
            var words = entry.split { !$0.isLetter }.map(String.init)
            var answer = SeedAnswer()
            guard words.first == "got", words.count > 1, let word = YolkWord(rawValue: words[1]) else { return nil }
            answer.yolkWord = word
            words.removeFirst(2)
            answer.white = words.first.flatMap(WhiteReport.init(rawValue:))
            return answer
        }
    }
}

extension Screenshots {
    /// What the debug log says, one case an event, its values the line's
    /// fields (`log`). Times are epoch s in cook time unless said; a value
    /// that is none is left out of the line.
    public enum Event: Encodable, Equatable {
        // The clock and the taps.
        /// The clock stepped from outside (`AppClock.takeStep`): step `n`,
        /// to `at`, running on at `speed` (0 frozen).
        case clock(n: Int, at: Double, speed: Double)
        /// After step `step`, the app caught up with it: nothing under way
        /// and the screen drawn (`idle(after:)`). What a script waits for
        /// after every step.
        case idle(step: Int)
        /// A tap of `-uiDo` (`name`, as `boil`, `set`), as given (`raw`).
        case action(name: String, raw: String)
        case actionUnknown(raw: String)

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
        case verdict(kind: String, whiteSets: Bool, cookS: Double)
        /// What Done shows, the peak yolk as it ran once kept (°C), and the
        /// plan's own.
        case shown(peak: Double?, level: Double?, plannedPeak: Double)
        /// The cook as stored, as the store holds it; none when cleared.
        case stored(value: Encoded?)
        /// A cook picked back up at launch, in this phase, and whether the
        /// clock wrote events it found past.
        case restore(phase: String, eventsWritten: Bool)
        case restoreTooOld
        case restoreUnreadable
        /// A cook picked back up has its alarms and its card again.
        case restored
        case cookEnded
        case ring(deadline: String)
        /// A card pushed (`what`: `start`, `update`): its stage, its end,
        /// whether it counts up, and what it says of the cook.
        case activity(what: String, stage: String, ends: Int, up: Bool, cook: [String?])
        case activityEnd
        /// A card the system holds, read at launch (`when`: `launch`,
        /// `launch+3s`).
        case activitySeen(when: String, state: String, stage: String, ends: Int)

        // The alarms.
        /// An alarm asked for, for `at`, `inS` of the system's seconds on.
        case scheduled(id: String, at: Double, inS: Double)
        case notScheduled(id: String, error: String)
        case alarmsCancelled
        /// The alarms a read-back found pending, each with its moment.
        case pending(alarms: [PendingAlarm])
        /// Those it found delivered and still shown.
        case delivered(ids: [String])

        // The results log and the record.
        /// The log as written: how many eggs, how many folded, and the last.
        case log(count: Int, folded: Int, last: Encoded?)
        case asRanCorrected
        case asRanRemade
        case asRanNotRemade
        case answerHeld
        case answerHeldMade

        // The stores (`Stores.claim`).
        case stores(verdict: String, mark: String?, markBuild: String?, version: String, build: String)
        case swept(key: String)
        /// A key written to the store (`Stores`), and its value if it is a
        /// number or a text.
        case wrote(key: String, number: Double?, text: String?)

        // The idle screen.
        /// An answer on screen: its time, whether it is decided on its pot's
        /// surface, and whether it has its odds.
        case answer(cookS: Double, decided: Bool, odds: Bool)

        // Corrections while a cook runs (`Edits`).
        /// A change in hand, on this group of controls.
        case edit(group: String?)
        case editLeaving
        /// The change in hand committed: the fields it changed, and the start
        /// if it moved it.
        case editCommitted(fields: [String], start: Double?)
        case startLimit(kind: String, at: Double)
        case announce(text: String)

        // The screen.
        /// The page on top (`egg` for none pushed).
        case view(page: String)
        /// Where a part of the screen sits, pt from the window's top.
        case layout(part: String, y: Double)
        case newerNote
        case sentence(text: String)
        case panelStart(at: Double)
        case readout(phase: String, big: String, sub: String)
        /// One frame of the readout: the moment it was drawn for, and what
        /// it drew, the certainty's time range none with no certainty.
        case frame(at: Double, phase: String, big: String, sub: String, range: String?)
        /// The certainty line's word and the time range it opens; none with
        /// no line.
        case certainty(word: String?, time: String?)
        case white(shown: Bool)
        case likely(shown: Bool)
        /// The egg in cross-section: its reading (`aim`, `live`, `ran`) and
        /// how set its yolk is, to a thousandth; no yolk with no egg drawn.
        case egg(reading: String, yolk: Double?)
        case slot(text: String)
        case note(text: String)
    }

    /// A value the app stores as JSON, written into a line as it encodes.
    public struct Encoded: Encodable, Equatable {
        public let value: any Encodable

        public func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }

        public static func == (a: Encoded, b: Encoded) -> Bool {
            (try? JSONEncoder().encode(a)) == (try? JSONEncoder().encode(b))
        }
    }

    public struct PendingAlarm: Encodable, Equatable {
        public let id: String
        /// When it fires, cook time, whole s; none without an interval trigger.
        public let at: Int?

        public init(id: String, at: Int?) {
            self.id = id
            self.at = at
        }
    }
}

extension Screenshots {
    /// One tap of `-uiDo`: what, with its argument, and when.
    public struct Action {
        public let raw: String
        public let name: String
        public let arg: String?
        public let anchor: String
        public let afterS: Double

        /// The moment it is due, epoch s, cook time; nil until it can be.
        /// `launch` is the clock at this launch, before any cook.
        public func due(_ cook: RunningCook?, _ plan: CookPlan?) -> Double? {
            if anchor == "launch" { return Screenshots.launchedAtS + afterS }
            guard let cook, let plan else { return nil }
            let base: Double?
            switch anchor {
            case "start": base = cook.startedAtS
            case "boil": base = cook.events.boilAtS
            case "pull": base = plan.deadlines.cookEndS
            case "cooled": base = plan.deadlines.coolEndS ?? plan.deadlines.cookEndS + pullGraceSeconds
            default: base = nil
            }
            return base.map { $0 + afterS }
        }
    }

    /// `-uiDo`'s taps, in order; one that does not read is left out.
    public static var actions: [Action] {
        guard let list = UserDefaults.standard.string(forKey: "uiDo") else { return [] }
        return list.split(separator: ",").compactMap { entry in
            let parts = entry.split(separator: "@", maxSplits: 1).map(String.init)
            let what = parts[0].split(separator: ":", maxSplits: 1).map(String.init)
            var anchor = "start", after = 0.0
            if parts.count > 1 {
                let when = parts[1]
                if let s = Double(when) {
                    after = s
                } else if let sign = when.firstIndex(where: { $0 == "+" || $0 == "-" }) {
                    anchor = String(when[..<sign])
                    guard let s = Double(when[sign...]) else { return nil }
                    after = s
                } else {
                    anchor = when
                }
            }
            return Action(
                raw: String(entry), name: what[0], arg: what.count > 1 ? what[1] : nil, anchor: anchor, afterS: after
            )
        }
    }

    /// Tap `-uiDo`'s taps as each comes due, on the cook's clock. A tap's
    /// moment follows the plan while a cook runs; once known, it is kept, so
    /// a tap still comes at it after the cook has ended, as a finger would
    /// (an answer after the egg's hour).
    @MainActor
    public static func drive(_ model: AppModel) {
        self.model = model
        let all = actions
        guard !all.isEmpty else { return }
        // Read now, at the launch, for `launch`.
        _ = launchedAtS
        driving = true
        Task { @MainActor in
            var left = all.map { (action: $0, due: Double?.none) }
            while !left.isEmpty {
                try? await AppClock.sleep(0.25)
                for i in left.indices {
                    if let due = left[i].action.due(model.cook.running, model.cook.plan) { left[i].due = due }
                }
                let now = AppClock.nowS
                guard let i = left.firstIndex(where: { $0.due.map { now >= $0 } ?? false }) else {
                    nothingDue &+= 1
                    continue
                }
                let action = left.remove(at: i).action
                log(.action(name: action.name, raw: action.raw))
                tappedAtTick = model.cook.ticks
                tap(action, model)
            }
            driving = false
        }
    }

    /// Whether `-uiDo` has taps still to come; how many of its looks found
    /// none due; and the cook's ticks at its last tap: for `idle(after:)`.
    @MainActor private static var driving = false
    @MainActor private static var nothingDue = 0
    @MainActor private static var tappedAtTick = 0
    /// Drags of `-uiDo` still moving the slider.
    @MainActor private static var dragging = 0

    /// `open:settings` pushes Settings, `open:clause-start` opens a
    /// clause's choice, as a press on its link would (set by the screen).
    @MainActor public static var open: ((String) -> Void)?

    /// The clock at this launch, cook time: what `launch` counts from.
    public static let launchedAtS = AppClock.nowS

    @MainActor
    private static func tap(_ action: Action, _ model: AppModel) {
        switch action.name {
        case "eggsIn": model.eggsIn()
        case "boil": model.cook.boil()
        case "out": model.cook.pulledOut()
        case "cancel": model.cancel()
        case "again": model.startAgain()
        case "answer":
            let parts = (action.arg ?? "").split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            model.answer(
                yolk: YolkWord(rawValue: parts[0]), white: parts.count > 1 ? WhiteReport(rawValue: parts[1]) : nil
            )
        case "set": set(action.arg ?? "", model.planner)
        case "drag":
            // The finger down on the slider and moved through each level,
            // a twentieth of a second apart; it stays down (`release`).
            let levels = (action.arg ?? "").split(separator: "/").compactMap { Double($0) }
            model.edits.fingerDown(.level, slider: true)
            dragging += 1
            Task { @MainActor in
                for level in levels {
                    model.planner.settings.doneness = level
                    try? await Task.sleep(for: .milliseconds(50))
                }
                dragging -= 1
            }
        case "release": model.edits.fingerUp()
        case "start":
            // `start:+3`: the start's + pressed three times, or − for a
            // minus; each a tap, so the correction settles.
            let n = Int(action.arg ?? "") ?? 0
            for _ in 0..<abs(n) { model.edits.stepStart(up: n > 0) }
        case "stillIn": model.stillIn()
        case "stillOut": model.stillOut()
        case "open": open?(action.arg ?? "")
        default: log(.actionUnknown(raw: action.raw))
        }
    }

    /// `set:<control>=<value>`: one control changed as a tap on it would,
    /// through the planner, so a change while a cook runs is a correction in
    /// hand that settles before it is committed.
    @MainActor
    private static func set(_ arg: String, _ planner: Planner) {
        let parts = arg.split(separator: "=", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return log(.actionUnknown(raw: "set:\(arg)")) }
        let value = parts[1]
        let number = Double(value) ?? .nan
        switch parts[0] {
        case "level": planner.settings.doneness = number
        case "size": planner.chooseSize(Int(number))
        case "mass": planner.weigh(number)
        case "from": if let v = EggFrom(rawValue: value) { planner.settings.startTempMode = v }
        case "start": if let v = StartChoice(rawValue: value) { planner.start = v }
        case "cooling": if let v = Cooling(rawValue: value) { planner.settings.cooling = v }
        case "heatOff": planner.heatOff = value == "1"
        case "water": planner.settings.waterLitres = number
        case "eggs": planner.settings.eggCount = Int(number)
        case "altitude": planner.settings.altitudeM = number
        case "language": Services.language.pick(value)
        default: log(.actionUnknown(raw: "set:\(arg)"))
        }
    }
}

extension Screenshots {
    /// What the screen draws again for after a step: read by the page and
    /// by its timelines (ContentView), so that a change of it draws them at
    /// the clock's new moment, a frozen clock's timelines otherwise waiting
    /// up to a second of the system's.
    @Observable @MainActor
    public final class Probe {
        public var drawn = 0
    }

    @MainActor public static let probe = Probe()
    /// The app's model, for what `idle(after:)` waits on (`drive`).
    @MainActor public static weak var model: AppModel?
    @MainActor private static var drawing: [CheckedContinuation<Void, Never>] = []

    /// Step `n` taken (`AppClock.takeStep`, off the main actor).
    public static func stepped(_ n: Int) {
        Task { @MainActor in await idle(after: n) }
    }

    /// Once the app has caught up with step `n`, `idle`: the cook has
    /// ticked at the new moment, and after the last tap; `-uiDo` has looked
    /// and found nothing more due, and is moving no slider; nothing is under
    /// way in the cook (a record made again among it), the planner or a
    /// change in hand; and the page has been drawn since, at the new moment. A script
    /// waits for it after every step, so that what it checks next, that
    /// something did not happen as much as that it did, is checked once the
    /// app is done however slow the machine, never after a span of the
    /// system's time.
    @MainActor private static func idle(after n: Int) async {
        while model == nil { try? await Task.sleep(for: .milliseconds(20)) }
        guard let model else { return }
        let ticks = model.cook.ticks
        let looks = nothingDue
        while true {
            while underWay(model, ticks: ticks, looks: looks) { try? await Task.sleep(for: .milliseconds(20)) }
            // In the background the page is not drawn, and nothing waits for it.
            if appActive() { await draw() }
            if !underWay(model, ticks: ticks, looks: looks) { break }
        }
        log(.idle(step: n))
    }

    /// Whether the app is still at work on a step taken when the cook had
    /// ticked `ticks` times and `-uiDo` had looked `looks` times.
    @MainActor private static func underWay(_ model: AppModel, ticks: Int, looks: Int) -> Bool {
        let planner = model.planner
        return (model.cook.ticking && model.cook.ticks <= max(ticks, tappedAtTick))
            || (driving && nothingDue <= looks) || dragging > 0
            || !model.cook.isSettled
            || model.edits.underWay
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

/// One seeded egg's answers: the yolk the cook got in the five words, and
/// the white, if given.
public struct SeedAnswer {
    public var yolkWord: YolkWord?
    public var white: WhiteReport?
}
#endif
