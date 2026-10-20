import EggTimerCopy

/// Words for a screen: a message rendered from the catalogue by `tr`, and
/// nothing else. Only `tr` and `trChosen` make one, so a helper of the app's
/// that takes `Words` (`InfoRow`, `MenuChoice`, a stepper's label) cannot be
/// handed a literal: the compiler refuses it, and a wording change stays the
/// catalogue's diff.
///
/// `string` is the rendered text, for what takes a `String`: a notification, an
/// announcement to VoiceOver, an attributed string, the Live Activity's card.
/// A `String` never becomes `Words` again.
public struct Words: Hashable, Sendable {
    public let string: String

    init(rendered: String) { string = rendered }

    public var isEmpty: Bool { string.isEmpty }

    /// Nothing: a line left empty.
    public static let none = Words(rendered: "")

    /// A line held at its height with nothing on it: a space.
    public static let blank = Words(rendered: " ")

    /// This, then `next`, a space between: two of the catalogue's sentences
    /// said one after the other.
    public func then(_ next: Words) -> Words {
        Words(rendered: string + " " + next.string)
    }
}

extension CopyArg {
    /// Words handed on, into another message.
    public static func text(_ words: Words) -> CopyArg { .text(words.string) }
}

/// Words as they read inside a sentence: their first letter lower-cased, as
/// `midSentence` does a string.
public func midSentence(_ words: Words, locale: String) -> Words {
    Words(rendered: midSentence(words.string, locale: locale))
}
