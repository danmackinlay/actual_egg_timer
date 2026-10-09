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
/// roman, and no small capitals, so those are capitals a size down. A
/// segmented picker's segments are UIKit's, set through its appearance
/// (`segmented`); the bar's title (`barTitle`) and a menu (`MenuChoice`) are
/// views of the app's own in 1750. What else UIKit draws itself (the menu
/// the bar's buttons fold into at the largest text sizes, the share sheet,
/// the system's alerts), the clock, a number the cook sets
/// (`systemFigures`) and the Live Activity keep the system face.
enum PeriodFace {
    static let roman = "IM_FELL_English_Roman"
    static let italic = "IM_FELL_English_Italic"

    @MainActor
    static func font(_ style: Font.TextStyle, italic: Bool = false, size: DynamicTypeSize) -> Font {
        let key = FontKey(style: style, italic: italic, size: size)
        if let hit = fonts[key] { return hit }
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size))
        let points = UIFont.preferredFont(forTextStyle: uiStyle(style), compatibleWith: traits).pointSize
        let made = Font(uiFont(italic ? Self.italic : roman, points) as CTFont)
        fonts[key] = made
        return made
    }

    /// The face at a size, with its features on.
    private static func uiFont(_ name: String, _ points: CGFloat) -> UIFont {
        // A wrong name, here or in UIAppFonts, would fall back to another
        // face without a word.
        assert(UIFont(name: name, size: points) != nil, "\(name) is not registered: see UIAppFonts in project.yml")
        let descriptor = UIFontDescriptor(fontAttributes: [.name: name, .featureSettings: features])
        return UIFont(descriptor: descriptor, size: points)
    }

    /// UIKit's own size for a segment's title: 13 pt at every Dynamic Type
    /// size, extra small to the largest accessibility size, as measured on
    /// iOS 27 (its labels shrink to fit rather than grow). The face takes
    /// the same, as it takes each text style's.
    private static let segmentPoints: CGFloat = 13

    /// Whether the segments' appearance is now the face's: the system's
    /// until it is first set.
    @MainActor private static var segmentsInPeriod = false

    /// Every segmented control made from now on, in the face in 1750 and in
    /// the system's otherwise, regular in both states, since the face has
    /// one weight. An appearance reaches only a control made after it is
    /// set; `segmented` makes one afresh when the language changes.
    @MainActor
    static func segments(period: Bool) {
        guard period != segmentsInPeriod else { return }
        segmentsInPeriod = period
        let attributes: [NSAttributedString.Key: Any]? = period ? [.font: uiFont(roman, segmentPoints)] : nil
        let proxy = UISegmentedControl.appearance()
        proxy.setTitleTextAttributes(attributes, for: .normal)
        proxy.setTitleTextAttributes(attributes, for: .selected)
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

    /// A picker as segments, in the face of the language on screen, in
    /// place of `.pickerStyle(.segmented)`.
    func segmented() -> some View {
        modifier(Segmented())
    }

    /// The navigation bar's title, in the face of the language on screen, in
    /// place of `.navigationTitle`.
    func barTitle(_ title: String) -> some View {
        modifier(BarTitle(title: title))
    }
}

/// The bar draws its title itself, in the system face, and takes another
/// only through an appearance it reads once, when it is made. So in 1750 the
/// title is a view of the app's own in the bar's middle, which the language
/// redraws in place; the bar's own title stays beneath it, for what reads it
/// (a back button's menu, the app switcher), and is the title in modern
/// English, as before. At the bar's own size, which Dynamic Type does not
/// change.
private struct BarTitle: ViewModifier {
    let title: String

    func body(content: Content) -> some View {
        let period = isPeriod(Copy.activeLocale)
        return content
            .navigationTitle(title)
            .toolbar {
                if period {
                    ToolbarItem(placement: .principal) {
                        Text(title)
                            .font(PeriodFace.font(.headline, size: .large))
                            .lineLimit(1)
                            .accessibilityAddTraits(.isHeader)
                    }
                }
            }
    }
}

/// A choice as a menu (`.pickerStyle(.menu)`), in the face of the language on
/// screen. UIKit draws a menu, its button and its list, in the system face,
/// and its list takes no other; so in 1750 the button is the app's own and
/// its list a popover of the app's own, as the system's looks: the choices
/// in a column, a tick at the one chosen, closed by a choice. In modern
/// English it is the system's menu, as before.
struct MenuChoice<Tag: Hashable>: View {
    let label: String
    let choices: [(title: String, tag: Tag)]
    @Binding var selection: Tag
    @State private var open = false
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        if isPeriod(Copy.activeLocale) {
            period
        } else {
            Picker(label, selection: $selection) {
                ForEach(choices.indices, id: \.self) { i in
                    Text(choices[i].title).tag(choices[i].tag)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
        }
    }

    private var chosen: String {
        choices.first { $0.tag == selection }?.title ?? ""
    }

    private var period: some View {
        Button {
            open = true
        } label: {
            HStack(spacing: 5) {
                Text(chosen).appFont(.body)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(.tint)
            // The system's button's height, so the row is as tall.
            .padding(.vertical, 5)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
        .accessibilityValue(chosen)
        .popover(isPresented: $open) {
            ViewThatFits(in: .vertical) {
                list
                ScrollView { list }
            }
            .presentationCompactAdaptation(.popover)
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(choices.indices, id: \.self) { i in
                let picked = choices[i].tag == selection
                Button {
                    selection = choices[i].tag
                    open = false
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.body.weight(.semibold))
                            .opacity(picked ? 1 : 0)
                            .accessibilityHidden(true)
                        Text(choices[i].title)
                            .appFont(.body)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? .isSelected : [])
            }
        }
        .padding(.vertical, 8)
        // As wide as the system's menu, and at the accessibility sizes as
        // wide as the screen allows, as its is.
        .frame(minWidth: 240, maxWidth: size.isAccessibilitySize ? .infinity : 340, alignment: .leading)
        // Not the style of what the button sits in (a `LabeledContent`'s
        // value is secondary): the list's own, as the system's menu.
        .foregroundStyle(Color.primary)
    }
}

/// UIKit draws the segments, so their face is the control's appearance,
/// which a control takes once, when it is made (`PeriodFace.segments`). Set
/// here, before the control below is made; and the language is the
/// control's identity, so a change of it makes a new control, in the new
/// face, in place of the one on screen.
private struct Segmented: ViewModifier {
    func body(content: Content) -> some View {
        let period = isPeriod(Copy.activeLocale)
        PeriodFace.segments(period: period)
        return content.pickerStyle(.segmented).id(period)
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
