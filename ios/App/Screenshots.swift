#if DEBUG
import Foundation
import EggTimerCore

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
/// - `-seedEggs got-jammy,got-soft,right,soft`: on a fresh install, write
///   that many eggs into the log through the app's own store, each cooked at
///   the level and setup on screen, and fold them (`Planner.seed`). A
///   learned state without cooking. `got-` and one of the five words is the
///   yolk the cook got, as the app asks now (DECISIONS.md 92): `got-runny`
///   to `got-hard`. `right`, `soft` or `firm` alone is the answer builds
///   before it asked, against the level, so a log can hold some of each and
///   both are scored. An answer about the white follows a slash:
///   `got-jammy/firm`, `right/runny`, `soft/tender`.
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
///   `water`, `eggs`, `altitude`), `drag:<levels>` and `release` (the
///   slider held and moved, then let go), `start:+3` (the start's + or −
///   pressed so many times), `stillIn` and `stillOut` (the two answers to
///   "still in the water?"), `open:settings` or `open:clause-start`.
/// - `-sectionAhead 540`: draw the egg in cross-section as it will be that
///   many seconds on in the cook as planned, the pull and its grace included;
///   with `-uiScreen heating`, a cook part done without waiting for it.
/// - `-perfProbe all`: after the first solve, tap, hold and drag the inputs
///   on a script and print how long each takes to reach the screen
///   (`Perf.swift`). `-altitudeM 0 -waterLitres 1.5 -doneness 0.5` start it
///   from the same place each time.
/// - `-shareServer http://localhost:8888`: send what sharing sends there
///   rather than to the live site (`Sharing.server`), for `npm run
///   serve:dev`.
/// - `-clockAt 1791234567 -clockSpeed 0`: the app's clock at that moment and
///   frozen there (`AppClock`); `-clockSpeed 60` runs it fast. A clock so
///   launched is stepped from outside: a line `<n> <at> <speed>` written to
///   `Library/Caches/aet.clock` in the container moves it to `at` and runs
///   it on at `speed`, and the log says `clock <n> …` once it has. The
///   scripted checks freeze it at each moment they check. The older
///   `-clockSpeed 60 -clockOffset -900 -clockEpoch 1791234567`, passed again
///   at every launch, carries one fast clock on through a relaunch. Sharing
///   sends nothing under any of them.
/// - `-cookAgo 7190`: with `-uiScreen heating`, the cook once started moved
///   back that many seconds, every time in it (`Cook.moveBack`): a slow hob
///   past its guesses, or a cook about to be too old, on screen. The cook
///   moved, not the clock: `-clockOffset` moves the clock instead, which
///   needs a cook stored to move past.
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
/// - `-provisionalAlarms YES`: ask for quiet notifications, which the system
///   grants with no prompt, so the alarms are scheduled and read back on a
///   simulator nobody taps.
///
/// `log` writes a line with the clock in epoch seconds, cook time, to
/// standard error and to `Library/Caches/aet.log` in the app's container:
/// the phases, each plan, the stored cook and the log as written, the
/// alarms scheduled, cancelled and read back, the rings, the Live
/// Activities pushed and seen, and the taps of `-uiDo`, which the scripted
/// checks read (`tools/iosE2e.mjs`).
enum Screenshots {
    static func log(_ line: String) {
        let text = Data("AET \(Int(AppClock.now.timeIntervalSince1970)) \(line)\n".utf8)
        FileHandle.standardError.write(text)
        // And appended to Library/Caches/aet.log in the app's container, which
        // a simulator's host reads (`simctl get_app_container … data`).
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

    static var provisionalAlarms: Bool { UserDefaults.standard.bool(forKey: "provisionalAlarms") }
    static var scene: String? { UserDefaults.standard.string(forKey: "uiScreen") }
    static var cookAgo: Double { UserDefaults.standard.double(forKey: "cookAgo") }
    static var doneAgo: Double {
        UserDefaults.standard.object(forKey: "doneAgo") == nil ? 2 : UserDefaults.standard.double(forKey: "doneAgo")
    }
    static var answerAfter: Double {
        UserDefaults.standard.object(forKey: "uiAnswerAfter") == nil
            ? 3 : UserDefaults.standard.double(forKey: "uiAnswerAfter")
    }
    /// `-uiAnswer`'s yolk and white, either possibly nil; nil when not given.
    static var answer: (yolk: YolkWord?, white: WhiteReport?)? {
        guard let raw = UserDefaults.standard.string(forKey: "uiAnswer") else { return nil }
        let parts = raw.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        return (YolkWord(rawValue: parts[0]), parts.count > 1 ? WhiteReport(rawValue: parts[1]) : nil)
    }
    static var language: String? { UserDefaults.standard.string(forKey: "uiLanguage") }
    static var noAlarmPrompt: Bool { UserDefaults.standard.bool(forKey: "noAlarmPrompt") }
    static var sectionAhead: Double { UserDefaults.standard.double(forKey: "sectionAhead") }
    static var scrollAnchor: Double? {
        UserDefaults.standard.object(forKey: "uiScrollAnchor") == nil
            ? nil : UserDefaults.standard.double(forKey: "uiScrollAnchor")
    }
    static var seedEggs: [SeedAnswer] {
        guard let list = UserDefaults.standard.string(forKey: "seedEggs") else { return [] }
        return list.split(separator: ",").compactMap { entry in
            // Split at the dash and the slash, or at anything else that is
            // not a letter.
            var words = entry.split { !$0.isLetter }.map(String.init)
            var answer = SeedAnswer()
            if words.first == "got" {
                guard words.count > 1, let word = YolkWord(rawValue: words[1]) else { return nil }
                answer.yolkWord = word
                words.removeFirst(2)
            } else {
                switch words.first {
                case "right": answer.yolk = .justRight
                case "soft": answer.yolk = .tooSoft
                case "firm": answer.yolk = .tooHard
                default: return nil
                }
                words.removeFirst()
            }
            answer.white = words.first.flatMap(WhiteReport.init(rawValue:))
            return answer
        }
    }
}

extension Screenshots {
    /// One tap of `-uiDo`: what, with its argument, and when.
    struct Action {
        let raw: String
        let name: String
        let arg: String?
        let anchor: String
        let afterS: Double

        /// The moment it is due, epoch s, cook time; nil until it can be.
        /// `launch` is the clock at this launch, before any cook.
        func due(_ cook: RunningCook?, _ plan: CookPlan?) -> Double? {
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
    static var actions: [Action] {
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
    static func drive(_ model: AppModel) {
        let all = actions
        guard !all.isEmpty else { return }
        // Read now, at the launch, for `launch`.
        _ = launchedAtS
        Task { @MainActor in
            var left = all.map { (action: $0, due: Double?.none) }
            while !left.isEmpty {
                try? await AppClock.sleep(0.25)
                for i in left.indices {
                    if let due = left[i].action.due(model.cook.running, model.cook.plan) { left[i].due = due }
                }
                let now = AppClock.now.timeIntervalSince1970
                guard let i = left.firstIndex(where: { $0.due.map { now >= $0 } ?? false }) else { continue }
                let action = left.remove(at: i).action
                log("action \(action.raw)")
                tap(action, model)
            }
        }
    }

    /// `open:settings` pushes Settings, `open:clause-start` opens a
    /// clause's choice, as a press on its link would (set by the screen).
    @MainActor static var open: ((String) -> Void)?

    /// The clock at this launch, cook time: what `launch` counts from.
    static let launchedAtS = AppClock.now.timeIntervalSince1970

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
            Task { @MainActor in
                for level in levels {
                    model.planner.doneness = level
                    try? await Task.sleep(for: .milliseconds(50))
                }
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
        default: log("action unknown \(action.name)")
        }
    }

    /// `set:<control>=<value>`: one control changed as a tap on it would,
    /// through the planner, so a change while a cook runs is a correction in
    /// hand that settles before it is committed.
    @MainActor
    private static func set(_ arg: String, _ planner: Planner) {
        let parts = arg.split(separator: "=", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return log("action unknown set:\(arg)") }
        let value = parts[1]
        let number = Double(value) ?? .nan
        switch parts[0] {
        case "level": planner.doneness = number
        case "size": planner.chooseSize(Int(number))
        case "mass": planner.weigh(number)
        case "from": if let v = EggFrom(rawValue: value) { planner.startTemp = v }
        case "start": if let v = StartChoice(rawValue: value) { planner.start = v }
        case "cooling": if let v = Cooling(rawValue: value) { planner.cooling = v }
        case "heatOff": planner.heatOff = value == "1"
        case "water": planner.waterLitres = number
        case "eggs": planner.eggCount = Int(number)
        case "altitude": planner.altitudeM = number
        default: log("action unknown set:\(arg)")
        }
    }
}

/// One seeded egg's answers: the yolk the cook got in the five words, or the
/// answer against the level that builds before DECISIONS.md 92 gave, never
/// both; and the white, if given.
struct SeedAnswer {
    var yolk: Feedback?
    var yolkWord: YolkWord?
    var white: WhiteReport?
}
#endif
