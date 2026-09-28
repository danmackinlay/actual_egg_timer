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
/// - `-noAlarmPrompt YES`: answer the notification question with no, without
///   asking, so the system's alert is not in the picture.
/// - `-seedEggs right,right,right`: on a fresh install, write that many eggs
///   into the log through the app's own store, each cooked at the level and
///   setup on screen and answered `right`, `soft` or `firm` about the yolk,
///   and fold them (`Kitchen.seed`). A learned state without cooking.
/// - `-uiScreen direction-info`: open the direction's (i).
/// - `-uiLanguage en-x-1750`: read in that catalogue, as a pick in the
///   picker would, before the first frame (`LanguageChoice.start`).
enum Screenshots {
    static var scene: String? { UserDefaults.standard.string(forKey: "uiScreen") }
    static var language: String? { UserDefaults.standard.string(forKey: "uiLanguage") }
    static var noAlarmPrompt: Bool { UserDefaults.standard.bool(forKey: "noAlarmPrompt") }
    static var seedEggs: [Feedback] {
        guard let list = UserDefaults.standard.string(forKey: "seedEggs") else { return [] }
        return list.split(separator: ",").compactMap { word in
            switch word.trimmingCharacters(in: .whitespaces) {
            case "right": .justRight
            case "soft": .tooSoft
            case "firm": .tooHard
            default: nil
            }
        }
    }
}
#endif
