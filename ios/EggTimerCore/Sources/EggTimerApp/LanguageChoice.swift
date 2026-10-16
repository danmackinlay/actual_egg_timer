import Foundation
import EggTimerCore
import EggTimerCopy
import EggTimerShared

/// The language the cook reads, kept: the picker in Settings, and the units
/// switch into the English of 1750 (LANGUAGE.md section 6), by the web's rule
/// (`languageAfterFlip` in src/ui/settings.ts). This file keeps the state,
/// reads it back (`readLanguageState`), and puts the catalogue it names on
/// screen (`Copy.use`), which redraws every word in place.
///
/// The switch listens for `.unitsFlipped`, which `Planner.chooseUnits` posts
/// when the cook changes the system on screen and never for a default.
/// Nothing here touches the units: a change of language never changes them.
@MainActor
public final class LanguageChoice {
    public static let shared = LanguageChoice()

    /// Under its own key, not "language": a launch argument of that name
    /// would shadow it (UserDefaults' argument domain), and the debug builds
    /// take one (`-uiLanguage`, Screenshots.swift).
    private static let key = StoreRegistry.languageState.key

    public private(set) var state = LanguageState.fresh
    private var observer: NSObjectProtocol?

    private init() {}

    /// Read the stored state and speak it, then start listening for the
    /// units switch. Called once, before the first view is drawn, so the
    /// first frame is already in the cook's language.
    public func start() {
        state = Self.read()
        if let tag = Screenshots.language, languages.contains(tag) {
            state = LanguageState(chosen: tag)
        }
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
    public func pick(_ tag: String) {
        set(LanguageState(chosen: tag))
    }

    private func set(_ next: LanguageState) {
        guard next != state else { return }
        state = next
        Self.write(next)
        Copy.use(effectiveLanguage(next))
    }

    private static func read() -> LanguageState {
        guard let data = Stores.store.data(forKey: key),
              let raw = inFormat(StoreRegistry.languageState, try? JSONSerialization.jsonObject(with: data)) else {
            return .fresh
        }
        return readLanguageState(raw, known: languages)
    }

    private static func write(_ state: LanguageState) {
        let stored = stamped(StoreRegistry.languageState, state.jsonObject)
        guard let data = try? JSONSerialization.data(withJSONObject: stored) else { return }
        Stores.set(data, forKey: key)
    }
}

/// Every catalogue the picker offers, in its order.
public let languages: [String] = [defaultLanguage, periodLanguage]

/// Which catalogue the cook reads: the cook's pick, or 1750 put there by the
/// units switch, or nil for the default, kept apart from it as the units are.
public struct LanguageState: Sendable, Equatable {
    public let chosen: String?

    public init(chosen: String?) {
        self.chosen = chosen
    }

    /// The state of a cook who never chose a language.
    public static let fresh = LanguageState(chosen: nil)

    /// As it is stored, for JSONSerialization: an absent value is JSON's
    /// null, so that `readLanguageState` gives back the same state.
    var jsonObject: [String: Any] {
        ["chosen": chosen ?? NSNull()]
    }
}

/// A stored state, read defensively: anything malformed is the fresh one. A
/// tag is kept only if it is one of `known`, so a catalogue that has gone
/// cannot be asked for. Any other field, such as the retired `flippedFrom`,
/// is ignored.
func readLanguageState(_ raw: Any?, known: [String]) -> LanguageState {
    guard let r = raw as? [String: Any] else { return .fresh }
    guard let chosen = r["chosen"] as? String, known.contains(chosen) else { return .fresh }
    return LanguageState(chosen: chosen)
}

/// The catalogue on screen.
public func effectiveLanguage(_ state: LanguageState) -> String {
    state.chosen ?? defaultLanguage
}

/// The language after the cook's own switch of units: metric to Imperial in
/// modern English goes into 1750; anything else leaves it, and the cook
/// leaves 1750 with the picker.
func languageAfterFlip(_ state: LanguageState, _ flip: UnitsFlip) -> LanguageState {
    let tag = effectiveLanguage(state)
    guard flip == .metricToImperial, languageOf(tag) == "en", !isPeriod(tag) else { return state }
    return LanguageState(chosen: periodLanguage)
}

/// Text as a screen reader should hear it: every long s an s. The title is
/// the one string drawn with the long s (LANGUAGE.md section 6), and its
/// label is this, as the web's `applyCopy` does for any text that has one.
public func withoutLongS(_ text: String) -> String {
    String(text.unicodeScalars.map { $0 == longS ? "s" : Character($0) })
}

/// U+017F LATIN SMALL LETTER LONG S.
private let longS = Unicode.Scalar(0x017F)!
