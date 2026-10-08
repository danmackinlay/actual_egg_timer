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
enum Screenshots {
    static var scene: String? { UserDefaults.standard.string(forKey: "uiScreen") }
    static var language: String? { UserDefaults.standard.string(forKey: "uiLanguage") }
    static var noAlarmPrompt: Bool { UserDefaults.standard.bool(forKey: "noAlarmPrompt") }
    static var sectionAhead: Double { UserDefaults.standard.double(forKey: "sectionAhead") }
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

/// One seeded egg's answers: the yolk the cook got in the five words, or the
/// answer against the level that builds before DECISIONS.md 92 gave, never
/// both; and the white, if given.
struct SeedAnswer {
    var yolk: Feedback?
    var yolkWord: YolkWord?
    var white: WhiteReport?
}
#endif
