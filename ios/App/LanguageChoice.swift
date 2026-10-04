import Foundation
import EggTimerCore

/// The language the cook reads, kept: the picker in Settings, and the units
/// switch into the English of 1750 (LANGUAGE.md section 6).
///
/// The rule is the core's (`languageAfterFlip`, `languageAfterPick`), the
/// same as the web's and held to it by `fixtures/language.json`. This file
/// only stores the state, as the JSON the web stores, and puts the catalogue
/// it names on screen (`Copy.use`), which redraws every word in place.
///
/// The switch listens for `.unitsFlipped`, which `Planner.chooseUnits` posts
/// when the cook changes the system on screen and never for a default.
/// Nothing here touches the units: a change of language never changes them.
@MainActor
final class LanguageChoice {
    static let shared = LanguageChoice()

    /// Under its own key, not "language": a launch argument of that name
    /// would shadow it (UserDefaults' argument domain), and the debug builds
    /// take one (`-uiLanguage`, Screenshots.swift).
    private static let key = "languageState"

    private(set) var state = LanguageState.fresh
    private var observer: NSObjectProtocol?

    private init() {}

    /// Read the stored state and speak it, then start listening for the
    /// units switch. Called once, before the first view is drawn, so the
    /// first frame is already in the cook's language.
    func start() {
        state = Self.read()
        #if DEBUG
        if let tag = Screenshots.language, languages.contains(tag) {
            state = languageAfterPick(state, tag)
        }
        #endif
        Copy.use(effectiveLanguage(state))
        guard observer == nil else { return }
        // Posted synchronously from the main actor, so the block runs there.
        observer = NotificationCenter.default.addObserver(forName: .unitsFlipped, object: nil, queue: nil) { note in
            guard let raw = note.userInfo?["flip"] as? String, let flip = UnitsFlip(rawValue: raw) else { return }
            MainActor.assumeIsolated {
                LanguageChoice.shared.set(languageAfterFlip(LanguageChoice.shared.state, flip))
            }
        }
    }

    /// The cook's pick in the picker. Choosing English leaves 1750 and keeps
    /// °F; it is the only way out of 1750.
    func pick(_ tag: String) {
        set(languageAfterPick(state, tag))
    }

    private func set(_ next: LanguageState) {
        guard next != state else { return }
        state = next
        Self.write(next)
        Copy.use(effectiveLanguage(next))
    }

    private static func read() -> LanguageState {
        guard let data = UserDefaults.standard.data(forKey: key),
              let raw = try? JSONSerialization.jsonObject(with: data) else { return .fresh }
        return readLanguageState(raw, known: languages)
    }

    private static func write(_ state: LanguageState) {
        guard let data = try? JSONSerialization.data(withJSONObject: state.jsonObject) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

/// Text as a screen reader should hear it: every long s an s. The title is
/// the one string drawn with the long s (LANGUAGE.md section 6), and its
/// label is this, as the web's `applyCopy` does for any text that has one.
func withoutLongS(_ text: String) -> String {
    String(text.unicodeScalars.map { $0 == longS ? "s" : Character($0) })
}

/// U+017F LATIN SMALL LETTER LONG S.
private let longS = Unicode.Scalar(0x017F)!
