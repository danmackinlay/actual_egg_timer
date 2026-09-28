import SwiftUI
import EggTimerCore

/// The strip under the doneness slider: where this pan works.
///
/// Three things, the web app's track in the same order:
///  - the odds at each level, relative to the best level's (`shadingOf`), as
///    the opacity of a band whose hue is the yolk's at that level - deep
///    orange runny, golden jammy, pale yellow hard (`Palette`, the web's
///    `--yolk-*`) - strong where this pan hits the mark most often, faint
///    where it rarely does, so it reads in grey as well as in colour;
///  - dots over the levels the pan can deliver but the odds do not offer yet
///    (under 3/10, once an egg has taught something);
///  - diagonal stripes over the levels the pan cannot deliver at all, as the
///    web app has always drawn them.
///
/// It is the slider's only track (`YolkSlider` draws none of its own), so it
/// is drawn bare before there is a solution and in sous-vide, where there are
/// no odds to shade it with.
///
/// Levels map to the thumb's centre, which travels the slider's width less a
/// thumb at each end; the caller insets the strip to match, as the web's
/// track is inset by half a thumb. Decorative: the direction and the refusal
/// say the same in words.
struct OddsTrack: View {
    /// Nil before the first answer, and in sous-vide: the bare track.
    let solution: Solution?
    let profile: OddsProfile?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            let track = Path(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: h / 2)
            context.fill(track, with: .color(.secondary.opacity(0.18)))
            context.clip(to: track)
            guard let solution else { return }

            let softest = solution.whiteSets ? solution.softestLevel : 1
            let hardest = solution.whiteSets ? solution.hardestLevel : 0
            func x(_ level: Double) -> CGFloat { CGFloat(min(1, max(0, level))) * w }

            // The odds, stop by stop between the profile's points.
            if let profile, solution.whiteSets {
                let shades = shadingOf(profile)
                if let first = shades.first, let last = shades.last, last.level > first.level {
                    let span = last.level - first.level
                    let stops = shades.map {
                        Gradient.Stop(
                            color: Palette.yolk(at: $0.level, in: scheme).opacity($0.strength),
                            location: CGFloat(($0.level - first.level) / span)
                        )
                    }
                    let band = CGRect(x: x(first.level), y: 0, width: x(last.level) - x(first.level), height: h)
                    context.fill(
                        Path(band),
                        with: .linearGradient(
                            Gradient(stops: stops),
                            startPoint: CGPoint(x: band.minX, y: 0), endPoint: CGPoint(x: band.maxX, y: 0)
                        )
                    )
                }
                // Deliverable, but under 3/10 so far: dots.
                if let s = profile.softest, let hd = profile.hardest {
                    dots(context, from: x(profile.physicalSoftest), to: x(s), height: h)
                    dots(context, from: x(hd), to: x(profile.physicalHardest), height: h)
                }
            }

            // Not deliverable at all: stripes.
            stripes(context, from: 0, to: x(softest), height: h)
            stripes(context, from: x(hardest), to: w, height: h)
        }
        .accessibilityHidden(true)
    }

    private func stripes(_ context: GraphicsContext, from: CGFloat, to: CGFloat, height h: CGFloat) {
        guard to > from else { return }
        var ctx = context
        ctx.clip(to: Path(CGRect(x: from, y: 0, width: to - from, height: h)))
        ctx.fill(Path(CGRect(x: from, y: 0, width: to - from, height: h)), with: .color(.secondary.opacity(0.25)))
        var lines = Path()
        var x = from - h
        while x < to + h {
            lines.move(to: CGPoint(x: x, y: h))
            lines.addLine(to: CGPoint(x: x + h, y: 0))
            x += 5
        }
        ctx.stroke(lines, with: .color(.primary.opacity(0.35)), lineWidth: 1.5)
    }

    private func dots(_ context: GraphicsContext, from: CGFloat, to: CGFloat, height h: CGFloat) {
        guard to > from else { return }
        var dots = Path()
        var x = from + 2.5
        while x < to {
            var y = h / 4
            while y < h {
                dots.addEllipse(in: CGRect(x: x - 1, y: y - 1, width: 2, height: 2))
                y += h / 2
            }
            x += 5
        }
        context.fill(dots, with: .color(.primary.opacity(0.55)))
    }
}

/// The bracket under the track (UI.md section 8): the yolk's likely range,
/// from the outcome's 10% point to its 90%, open at the top so it cups the
/// track, with a short mark at its median. The foreground at 70%, not the
/// accent and not the yolk, so it reads in both schemes and never covers the
/// shading. Inset as the track is. VoiceOver reads it as `outcome.range`.
struct YolkBracket: View {
    let forecast: Forecast

    var body: some View {
        Canvas { context, size in
            let w = size.width
            func x(_ level: Double) -> CGFloat { CGFloat(min(1, max(0, level))) * w }
            let low = x(forecast.levelLow)
            let high = max(x(forecast.levelHigh), low + 2)
            let depth: CGFloat = 7
            var cup = Path()
            cup.move(to: CGPoint(x: low + 1, y: 0))
            cup.addLine(to: CGPoint(x: low + 1, y: depth - 3))
            cup.addQuadCurve(to: CGPoint(x: low + 4, y: depth - 1), control: CGPoint(x: low + 1, y: depth - 1))
            cup.addLine(to: CGPoint(x: high - 4, y: depth - 1))
            cup.addQuadCurve(to: CGPoint(x: high - 1, y: depth - 3), control: CGPoint(x: high - 1, y: depth - 1))
            cup.addLine(to: CGPoint(x: high - 1, y: 0))
            let ink = Color.primary.opacity(0.7)
            context.stroke(cup, with: .color(ink), style: StrokeStyle(lineWidth: 2, lineCap: .butt, lineJoin: .round))
            let span = forecast.levelHigh - forecast.levelLow
            let middle = span > 0 ? (forecast.levelMedian - forecast.levelLow) / span : 0.5
            let mid = low + (high - low) * CGFloat(min(1, max(0, middle)))
            context.fill(Path(CGRect(x: mid - 1, y: 0, width: 2, height: depth + 2)), with: .color(ink))
        }
        .frame(height: 9)
        .accessibilityElement()
        .accessibilityLabel(Direction.range(forecast))
    }
}
