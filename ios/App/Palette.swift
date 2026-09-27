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

    /// The accent: a clause's underline, and an open clause's fill.
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
        let traits = UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light)
        func rgba(_ c: Color) -> (CGFloat, CGFloat, CGFloat) {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(c).resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            return (r, g, b)
        }
        let (from, to, t): (Color, Color, Double) = l <= yolkJammyAt
            ? (yolkRunny, yolkJammy, l / yolkJammyAt)
            : (yolkJammy, yolkHard, (l - yolkJammyAt) / (1 - yolkJammyAt))
        let a = rgba(from), b = rgba(to)
        let mix = { (x: CGFloat, y: CGFloat) in x + (y - x) * CGFloat(t) }
        return Color(red: Double(mix(a.0, b.0)), green: Double(mix(a.1, b.1)), blue: Double(mix(a.2, b.2)))
    }
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
