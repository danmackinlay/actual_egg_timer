import SwiftUI
import EggTimerCore

/// The strip under the doneness slider: where this pan works.
///
/// Three things, the web app's track in the same order:
///  - the odds at each level, relative to the best level's (`shadingOf`), as
///    the opacity of a green band - strong where this pan hits the mark most
///    often, faint where it rarely does - so it reads in grey as well as in
///    colour;
///  - dots over the levels the pan can deliver but the odds do not offer yet
///    (under 3/10, once an egg has taught something);
///  - diagonal stripes over the levels the pan cannot deliver at all, as the
///    web app has always drawn them.
///
/// Levels map to the thumb's centre, which travels the slider's width less a
/// thumb at each end; the caller insets the strip to match. Decorative: the
/// odds line and the refusal say the same in words.
struct OddsTrack: View {
    let solution: Solution
    let profile: OddsProfile?

    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            let track = Path(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: h / 2)
            context.fill(track, with: .color(.secondary.opacity(0.18)))
            context.clip(to: track)

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
                            color: Color.green.opacity($0.strength),
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
