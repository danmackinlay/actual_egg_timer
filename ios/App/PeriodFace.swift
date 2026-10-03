import SwiftUI
import UIKit
import CoreText
import EggTimerCore

/// The face of the English of 1750 (LANGUAGE.md section 6, *The face*): the
/// files in `App/Fonts`, registered by `UIAppFonts` in project.yml.
///
/// `appFont` sets a text style: the system's in modern English, and in 1750
/// this face at the size Dynamic Type gives that style. `Font.custom` turns
/// on only the common ligatures, so the face is built from a descriptor that
/// names its OpenType features. It has one weight, so a semibold is its
/// roman, and no small capitals, so those are capitals a size down. What
/// UIKit draws itself (the bar, a segmented control, a menu), the clock, a
/// number the cook sets (`systemFigures`) and the Live Activity keep the
/// system face.
enum PeriodFace {
    static let roman = "IM_FELL_English_Roman"
    static let italic = "IM_FELL_English_Italic"

    @MainActor
    static func font(_ style: Font.TextStyle, italic: Bool = false, size: DynamicTypeSize) -> Font {
        let key = FontKey(style: style, italic: italic, size: size)
        if let hit = fonts[key] { return hit }
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size))
        let points = UIFont.preferredFont(forTextStyle: uiStyle(style), compatibleWith: traits).pointSize
        let name = italic ? Self.italic : roman
        // A wrong name, here or in UIAppFonts, would fall back to another
        // face without a word.
        assert(UIFont(name: name, size: points) != nil, "\(name) is not registered: see UIAppFonts in project.yml")
        let descriptor = UIFontDescriptor(fontAttributes: [.name: name, .featureSettings: features])
        let made = Font(UIFont(descriptor: descriptor, size: points) as CTFont)
        fonts[key] = made
        return made
    }

    private struct FontKey: Hashable {
        let style: Font.TextStyle
        let italic: Bool
        let size: DynamicTypeSize
    }

    @MainActor private static var fonts: [FontKey: Font] = [:]

    /// `liga` (fi, and the long s's own: ſt, ſh, ſi, ſl, ſſ), `dlig` (ct;
    /// ſs, which this face draws as ß) and `hist` (s as ſ before a letter).
    private static var features: [[UIFontDescriptor.FeatureKey: Any]] {
        ["liga", "dlig", "hist"].map { [
            UIFontDescriptor.FeatureKey(rawValue: kCTFontOpenTypeFeatureTag as String): $0,
            UIFontDescriptor.FeatureKey(rawValue: kCTFontOpenTypeFeatureValue as String): 1,
        ] }
    }

    private static func uiStyle(_ style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

extension Font {
    /// A text style as the app sets it (`appFont`), as a value, for an
    /// `AttributedString` run, which takes a font and not a modifier.
    @MainActor
    static func app(
        _ style: Font.TextStyle, weight: Font.Weight? = nil, italic: Bool = false,
        smallCaps: Bool = false, size: DynamicTypeSize
    ) -> Font {
        if isPeriod(Copy.activeLocale) {
            return PeriodFace.font(smallCaps ? .caption2 : style, italic: italic, size: size)
        }
        var font = Font.system(style)
        if let weight { font = font.weight(weight) }
        if italic { font = font.italic() }
        if smallCaps { font = font.smallCaps() }
        return font
    }
}

extension View {
    /// A text style: the system's in modern English, the period face in 1750.
    /// `weight` is the system's alone, since the face has one.
    func appFont(
        _ style: Font.TextStyle, weight: Font.Weight? = nil, italic: Bool = false, smallCaps: Bool = false
    ) -> some View {
        modifier(AppFont(style: style, weight: weight, italic: italic, smallCaps: smallCaps))
    }

    /// The period face for everything beneath that sets no style of its own:
    /// at the root, as `.body`. Nothing in modern English.
    func periodFace() -> some View {
        modifier(PeriodBody())
    }

    /// A number the cook sets, in the system face in 1750 too, at the style
    /// around it: its figures line up, and its 0 is not an o.
    func systemFigures() -> some View {
        modifier(SystemFigures())
    }
}

/// The text style `appFont` last set, for `systemFigures` to keep.
private struct AppTextStyleKey: EnvironmentKey {
    static let defaultValue = Font.TextStyle.body
}

private extension EnvironmentValues {
    var appTextStyle: Font.TextStyle {
        get { self[AppTextStyleKey.self] }
        set { self[AppTextStyleKey.self] = newValue }
    }
}

private struct AppFont: ViewModifier {
    let style: Font.TextStyle
    let weight: Font.Weight?
    let italic: Bool
    let smallCaps: Bool
    @Environment(\.dynamicTypeSize) private var size

    func body(content: Content) -> some View {
        let capitals = smallCaps && isPeriod(Copy.activeLocale)
        content
            .font(.app(style, weight: weight, italic: italic, smallCaps: smallCaps, size: size))
            .environment(\.appTextStyle, style)
            .transformEnvironment(\.textCase) { if capitals { $0 = .uppercase } }
    }
}

// These two change nothing in modern English: each transforms what is
// inherited rather than setting it, since even `.font(nil)` would reset it.

private struct PeriodBody: ViewModifier {
    @Environment(\.dynamicTypeSize) private var size

    func body(content: Content) -> some View {
        let period = isPeriod(Copy.activeLocale)
        let face = PeriodFace.font(.body, size: size)
        return content.transformEnvironment(\.font) { if period { $0 = face } }
    }
}

private struct SystemFigures: ViewModifier {
    @Environment(\.appTextStyle) private var style

    func body(content: Content) -> some View {
        let period = isPeriod(Copy.activeLocale)
        let figures = Font.system(style)
        return content.transformEnvironment(\.font) { if period { $0 = figures } }
    }
}
