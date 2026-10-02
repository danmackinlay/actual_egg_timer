import SwiftUI
import EggTimerCore

/// The egg in cross-section, beside the running cook's sentence: how set each
/// layer is, ring by ring, as the clock moves (`DECISIONS.md` 52). The web's
/// is `src/ui/eggSection.ts`, and this draws the same egg: the same outline,
/// the same rings and the same colours (`Palette`).
///
/// The model's egg is a sphere (`EggSection`, in core); this one is drawn as
/// an egg. Each ring is a closed outline, filled outermost first, so the one
/// inside covers all but the band between them. The yolk is round; through
/// the white the outlines turn from that circle into the shell's ovoid, blunt
/// end up. Every fill is opaque, so a raw white is a colour of its own.
///
/// It says nothing the sentence and the clock do not, so it has no words and
/// VoiceOver passes over it.
struct EggSectionView: View {
    let cook: Cook
    let ticket: Cook.Ticket
    let calibration: Calibration
    /// The instant the `TimelineView` drew for.
    let now: Date

    @State private var cache = SectionCache()
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let view = sectionNow()
        Canvas { context, size in
            EggOutline.draw(view, in: context, size: size, scheme: scheme)
        }
        .accessibilityHidden(true)
    }

    /// The section at `now`: in the water until the cook said the eggs were
    /// out, or until the grace ran out with nobody saying, and on through the
    /// carryover after. At the posterior mean, the egg the countdown times.
    private func sectionNow() -> SectionView? {
        guard let startedAt = cook.startedAt, let pullAt = cook.pullAt else { return nil }
        #if DEBUG
        let clock = now.addingTimeInterval(Screenshots.sectionAhead)
        #else
        let clock = now
        #endif
        let assumedOut = pullAt.addingTimeInterval(pullGraceSeconds)
        let out = cook.outAt ?? (clock >= assumedOut ? assumedOut : nil)
        let outS = out.map { $0.timeIntervalSince(startedAt) }
        let nowS = clock.timeIntervalSince(startedAt)
        return cache.view(
            ticket: ticket, startedAt: startedAt,
            params: calibrationParams(calibration),
            toS: outS.map { min(nowS, $0 + Constants.carryoverWindow) } ?? nowS,
            outAtS: outS,
            whiteTargetMin: calibrationDoneness(calibration, level: ticket.level).whiteDoseMin
        )
    }
}

/// The section carried forward between ticks, so each second costs two steps
/// rather than a replay. A new ticket - a start, the boil tapped, a slow hob, a
/// restore - replays it from t = 0, since the water it has been in changed.
@MainActor
private final class SectionCache {
    private var section: EggSection?
    private var ticket: Cook.Ticket?
    private var startedAt: Date?

    func view(
        ticket: Cook.Ticket, startedAt: Date, params: ModelParams,
        toS: Double, outAtS: Double?, whiteTargetMin: Double
    ) -> SectionView {
        if section == nil || self.ticket != ticket || self.startedAt != startedAt {
            section = EggSection(egg: ticket.egg, setup: ticket.setup, params: params)
            self.ticket = ticket
            self.startedAt = startedAt
        }
        section!.advance(egg: ticket.egg, setup: ticket.setup, params: params, toS: toS, outAtS: outAtS)
        return section!.view(whiteTargetMin: whiteTargetMin)
    }
}

/// The egg's outline, the twin of `ringPoints` in src/ui/eggSection.ts: the
/// same numbers, so the two apps draw the same egg.
enum EggOutline {
    /// The shell's half-length, blunt end to centre, before the taper.
    private static let halfLength = 1.0
    /// Its half-width: the egg the model assumes, 1.35 times as long as wide.
    private static let halfWidth = halfLength / Constants.eggLengthRatio
    /// How much longer the blunt end is than the pointed end.
    private static let taper = 0.14
    private static let outlinePoints = 72

    /// The drawing's bounds, y up: the shell's extent, and a hair for its line.
    private static let left = -halfWidth * 1.06
    private static let right = halfWidth * 1.06
    private static let top = halfLength * (1.0 + taper) + 0.03
    private static let bottom = -halfLength * (1.0 - taper) - 0.03

    /// The shell's distance from the yolk's centre at angle `theta` (0 to the
    /// right, pi/2 up, toward the blunt end).
    static func shellRadius(_ theta: Double) -> Double {
        let c = cos(theta) / halfWidth
        let s = sin(theta) / halfLength
        return (1.0 + taper * sin(theta)) / (c * c + s * s).squareRoot()
    }

    /// The outline of everything inside `x` (r/R), y up.
    static func ringPoints(_ x: Double) -> [(Double, Double)] {
        let edge = Constants.yolkRadiusFrac
        let w = x <= edge ? 0.0 : (x - edge) / (1.0 - edge)
        return (0..<outlinePoints).map { i in
            let theta = 2.0 * Double.pi * Double(i) / Double(outlinePoints)
            let r = x * ((1.0 - w) * halfWidth + w * shellRadius(theta))
            return (r * cos(theta), r * sin(theta))
        }
    }

    /// Draw `view` into `size`, centred, as large as fits.
    static func draw(_ view: SectionView?, in context: GraphicsContext, size: CGSize, scheme: ColorScheme) {
        let scale = min(size.width / (right - left), size.height / (top - bottom))
        let midX = (left + right) / 2, midY = (top + bottom) / 2
        func path(_ x: Double) -> Path {
            var p = Path()
            let points = ringPoints(x).map { pt in
                CGPoint(x: size.width / 2 + (pt.0 - midX) * scale, y: size.height / 2 - (pt.1 - midY) * scale)
            }
            p.addLines(points)
            p.closeSubpath()
            return p
        }
        if let view {
            for i in view.outer.indices.reversed() {
                let fill = view.yolk[i]
                    ? Palette.yolk(at: view.set[i], in: scheme)
                    : Palette.white(at: view.set[i], in: scheme)
                context.fill(path(view.outer[i]), with: .color(fill))
            }
        }
        context.stroke(path(1.0), with: .color(Palette.eggLine), lineWidth: 1.5)
    }
}
