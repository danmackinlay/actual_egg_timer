import SwiftUI
import UIKit

/// The web's colours where iOS needs the same ones (styles.css `:root`), each
/// with its dark and its light value. Everything else is the system's.
enum Palette {
    /// A colour that follows the scheme, as the web's `prefers-color-scheme`
    /// override does.
    private static func scheme(dark: UInt32, light: UInt32) -> Color {
        Color(UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }

    /// The accent: a clause's underline, and an open clause's fill. The same
    /// two values are the app's tint, the asset catalog's AccentColor, which
    /// is what Start, the links and the controls are drawn in.
    static let accent = scheme(dark: 0xFFB020, light: 0x8A4B00)
    /// Text on the accent.
    static let accentText = scheme(dark: 0x1A1200, light: 0xFFFFFF)

    /// The doneness track's hue, a yolk's: deep orange runny, golden jammy,
    /// pale yellow hard (`--yolk-runny`, `--yolk-jammy`, `--yolk-hard`).
    /// Deeper in the light scheme, since a pale yellow vanishes on a light
    /// track.
    static let yolkRunny = scheme(dark: 0xFF7417, light: 0xD9530A)
    static let yolkJammy = scheme(dark: 0xFFB31F, light: 0xE89400)
    static let yolkHard = scheme(dark: 0xFFE680, light: 0xE8C410)
    /// Where jammy sits on the slider, and so where the golden stop goes:
    /// the default level, as the web's gradient has it at 41%.
    static let yolkJammyAt = 0.41

    /// The yolk's colour at a level, 0 runny to 1 hard, between the three
    /// stops as the web's linear gradient blends them.
    static func yolk(at level: Double, in scheme: ColorScheme) -> Color {
        let l = min(1, max(0, level))
        return l <= yolkJammyAt
            ? mix(yolkRunny, yolkJammy, l / yolkJammyAt, in: scheme)
            : mix(yolkJammy, yolkHard, (l - yolkJammyAt) / (1 - yolkJammyAt), in: scheme)
    }

    /// The egg in cross-section's white (`--white-raw`, `--white-set`), from
    /// raw to set. Both opaque, since its rings are stacked, so the raw one is
    /// a colour of its own: the page's, a touch lighter and a touch blue.
    static let whiteRaw = scheme(dark: 0x19202B, light: 0xE6EDF6)
    static let whiteSet = scheme(dark: 0xF2EFE6, light: 0xFFFFFF)
    /// Its shell's line (`--line`).
    static let eggLine = scheme(dark: 0x2A2C31, light: 0xD8D9DD)

    /// The white at how set it is, 0 raw to 1 set.
    static func white(at set: Double, in scheme: ColorScheme) -> Color {
        mix(whiteRaw, whiteSet, min(1, max(0, set)), in: scheme)
    }

    /// `from` to `to` at `t`, in RGB as the web blends, in `scheme`.
    private static func mix(_ from: Color, _ to: Color, _ t: Double, in scheme: ColorScheme) -> Color {
        let traits = UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light)
        func rgba(_ c: Color) -> (CGFloat, CGFloat, CGFloat) {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(c).resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            return (r, g, b)
        }
        let a = rgba(from), b = rgba(to)
        let mix = { (x: CGFloat, y: CGFloat) in x + (y - x) * CGFloat(t) }
        return Color(red: Double(mix(a.0, b.0)), green: Double(mix(a.1, b.1)), blue: Double(mix(a.2, b.2)))
    }
}

/// A prominent button's label on the accent, in `--accent-fg`: near-black on
/// the dark scheme's amber, white on the light scheme's brown, where the
/// system's white on amber would be unreadable. Disabled, it is left to the
/// system, whose grey fill wants its own grey text.
struct OnAccent: ViewModifier {
    @Environment(\.isEnabled) private var enabled

    func body(content: Content) -> some View {
        if enabled {
            content.foregroundStyle(Palette.accentText)
        } else {
            content
        }
    }
}

extension View {
    /// See `OnAccent`.
    func onAccent() -> some View { modifier(OnAccent()) }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
