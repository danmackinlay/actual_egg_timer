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
/// - `-seedEggs right,right,right`: on a fresh install, write that many eggs
///   into the log through the app's own store, each cooked at the level and
///   setup on screen and answered `right`, `soft` or `firm` about the yolk,
///   and fold them (`Planner.seed`). A learned state without cooking. An
///   answer about the white follows a slash: `right/runny`, `soft/tender`,
///   `firm/firm`.
/// - `-uiScreen direction-info`: open the direction's (i).
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
    static var seedEggs: [(yolk: Feedback, white: WhiteReport?)] {
        guard let list = UserDefaults.standard.string(forKey: "seedEggs") else { return [] }
        return list.split(separator: ",").compactMap { entry in
            // Split at the slash, or at anything else that is not a letter.
            let words = entry.split { !$0.isLetter }
            let yolk: Feedback? = switch words.first.map(String.init) {
            case "right": .justRight
            case "soft": .tooSoft
            case "firm": .tooHard
            default: nil
            }
            guard let yolk else { return nil }
            return (yolk: yolk, white: words.count > 1 ? WhiteReport(rawValue: String(words[1])) : nil)
        }
    }
}
#endif
