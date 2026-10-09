import SwiftUI
import EggTimerCore

/// The egg in cross-section, beside the setup sentence in every phase: how
/// set each layer is, ring by ring (`DECISIONS.md` 52). The web's is
/// `src/ui/eggSection.ts` and `render.ts`, and this draws the same egg: the
/// same outline, the same rings and the same colours (`Palette`).
///
/// It has two readings (design/one-screen.md section 5; DECISIONS.md 91, 97
/// and 98), which the debug log names as the web's drawing does:
///
/// - `aim`, the egg the settings on screen aim for, as eaten at the end of
///   the cooling (`previewSection`), so the yolk reads the level asked: idle,
///   the controls' egg at the time on screen; during a cook, while a control
///   is held and for a moment after (`AppModel`'s edits), the egg the
///   correction in hand would cook.
/// - `live`, the egg in the water now, carried forward a tick at a time and
///   replayed from raw when the cook's pot or start changes, on through the
///   cooling; and at Done `ran`, the egg as it ran, eaten: the time that ran,
///   to the egg out, with the model's parameters it ran under.
///
/// The model's egg is a sphere (`EggSection`, in core); this one is drawn as
/// an egg. Each ring is a closed outline, filled outermost first, so the one
/// inside covers all but the band between them. The yolk is round; through
/// the white the outlines turn from that circle into the shell's egg,
/// standing on its blunt end rather than balanced on its point. Every fill is
/// opaque, so a raw white is a colour of its own.
///
/// It says nothing the sentence and the clock do not, so it has no words and
/// VoiceOver passes over it.
struct EggSectionView: View {
    let model: AppModel
    /// The phase and the instant the `TimelineView` drew for.
    let phase: Phase
    let now: Date

    @State private var cache = SectionCache()
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let (view, reading) = section()
        Canvas { context, size in
            EggOutline.draw(view, in: context, size: size, scheme: scheme)
        }
        .accessibilityHidden(true)
        #if DEBUG
        .onChange(of: Self.summary(view, reading), initial: true) { _, said in
            Screenshots.log("egg \(said)")
        }
        #endif
    }

    #if DEBUG
    /// The reading and how set the yolk is, its rings' mean, for the log.
    private static func summary(_ view: SectionView?, _ reading: EggReading) -> String {
        guard let view else { return "\(reading.rawValue) none" }
        let yolk = view.set.indices.filter { view.yolk[$0] }.map { view.set[$0] }
        return String(format: "%@ yolk %.3f", reading.rawValue, yolk.isEmpty ? 0 : yolk.reduce(0, +) / Double(yolk.count))
    }
    #endif

    /// What to draw, and which reading it is.
    private func section() -> (SectionView?, EggReading) {
        let planner = model.planner
        let calibration = planner.calibration
        guard phase != .idle, let running = model.cook.running, let plan = model.cook.plan else {
            // Idle: the egg the controls aim for, at the time on screen.
            guard !planner.isSousVide, let solution = planner.solution else { return (nil, .aim) }
            let level = planner.doneness
            return (cache.preview(
                egg: planner.egg, setup: planner.setup, params: calibrationParams(calibration),
                cookTimeS: solution.result.cookTimeS,
                whiteTargetMin: calibrationDoneness(calibration, level: level).whiteDoseMin
            ), .aim)
        }
        // A change in hand: the egg it aims for.
        if let aim = model.aimView { return (aim, .aim) }
        // Once the egg is out, under the model and at the level it ran with
        // (`asRanShown`), not a posterior that has since learned from it.
        let ran = asRanShown(running, plan: plan)
        let params = ran?.params ?? calibrationParams(calibration)
        let whiteTarget = calibrationDoneness(calibration, level: ran?.level ?? plan.answer.level).whiteDoseMin
        let start = running.startedAtS
        if phase == .done, let pulled = running.events.pulled {
            return (cache.preview(
                egg: plan.egg, setup: plan.setup, params: params, cookTimeS: pulled.outS - start,
                whiteTargetMin: whiteTarget
            ), .ran)
        }
        #if DEBUG
        let clock = now.addingTimeInterval(Screenshots.sectionAhead).timeIntervalSince1970
        #else
        let clock = now.timeIntervalSince1970
        #endif
        // In the water until the cook said the eggs were out, or until the
        // grace ran out with nobody saying, and on through the carryover.
        let assumedOut = plan.deadlines.cookEndS + pullGraceSeconds
        let out = running.events.pulled?.outS ?? (clock >= assumedOut ? assumedOut : nil)
        let outS = out.map { $0 - start }
        let nowS = clock - start
        return (cache.live(
            egg: plan.egg, setup: plan.setup, startedAtS: start, params: params,
            toS: outS.map { min(nowS, $0 + Constants.carryoverWindow) } ?? nowS,
            outAtS: outS, whiteTargetMin: whiteTarget
        ), .live)
    }
}

/// Which egg the drawing is (the web's `data-egg`).
enum EggReading: String {
    case aim, live, ran
}

/// The live section carried forward between ticks, so each second costs two
/// steps rather than a replay. A new egg, water, start or model - the boil
/// tapped, a slow hob, a restore, a correction - replays it from t = 0, since
/// the water it has been in changed. And the last preview worked out, which
/// is a few thousand steps, so once for each thing it is of.
@MainActor
final class SectionCache {
    private var section: EggSection?
    private var key = ""
    private var preview: SectionView?
    private var previewKey = ""

    func live(
        egg: Egg, setup: CookSetup, startedAtS: Double, params: ModelParams,
        toS: Double, outAtS: Double?, whiteTargetMin: Double
    ) -> SectionView {
        let k = "\(egg)|\(setup)|\(startedAtS)|\(params)"
        if section == nil || key != k {
            section = EggSection(egg: egg, setup: setup, params: params)
            key = k
        }
        section!.advance(egg: egg, setup: setup, params: params, toS: toS, outAtS: outAtS)
        return section!.view(whiteTargetMin: whiteTargetMin)
    }

    /// `previewSection`, the egg as eaten for a pot, a time in the water and
    /// a white's target.
    func preview(
        egg: Egg, setup: CookSetup, params: ModelParams, cookTimeS: Double, whiteTargetMin: Double
    ) -> SectionView {
        let k = "\(egg)|\(setup)|\(params)|\(cookTimeS)|\(whiteTargetMin)"
        if let preview, previewKey == k { return preview }
        let view = previewSection(
            egg: egg, setup: setup, params: params, cookTimeS: cookTimeS, whiteTargetMin: whiteTargetMin
        )
        preview = view
        previewKey = k
        return view
    }
}

/// The egg's outline, the twin of `ringPoints` in src/ui/eggSection.ts: the
/// same numbers, so the two apps draw the same egg.
enum EggOutline {
    /// The shell's half-length, the drawing's unit.
    private static let halfLength = 1.0
    /// Its half-width at the middle: the egg the model assumes, 1.35 times as
    /// long as wide.
    private static let halfWidth = halfLength / Constants.eggLengthRatio
    /// How much the width swells toward the blunt end, at the bottom, and
    /// narrows toward the pointed one, at the top.
    private static let taper = 0.18
    /// How far the yolk's centre sits below the egg's middle, toward the
    /// blunt end.
    private static let yolkDrop = 0.06
    private static let outlinePoints = 72

    /// The shell at parameter `t` (0 to the right, pi/2 up, toward the
    /// pointed end), relative to the yolk's centre, y up.
    static func shellPoint(_ t: Double) -> (Double, Double) {
        (halfWidth * cos(t) * (1.0 - taper * sin(t)), halfLength * sin(t) + yolkDrop)
    }

    /// The outline of everything inside `x` (r/R): a circle across the yolk,
    /// turning into the shell's egg evenly across the white. Y up, the yolk's
    /// centre at the origin.
    static func ringPoints(_ x: Double) -> [(Double, Double)] {
        let edge = Constants.yolkRadiusFrac
        let w = x <= edge ? 0.0 : (x - edge) / (1.0 - edge)
        return (0..<outlinePoints).map { i in
            let t = 2.0 * Double.pi * Double(i) / Double(outlinePoints)
            let shell = shellPoint(t)
            return (
                x * ((1.0 - w) * halfWidth * cos(t) + w * shell.0),
                x * ((1.0 - w) * halfWidth * sin(t) + w * shell.1)
            )
        }
    }

    /// The drawing's bounds, y up: the shell's extent, and a hair for its line.
    private static let bounds: (left: Double, right: Double, top: Double, bottom: Double) = {
        let shell = ringPoints(1.0)
        let pad = 0.03
        return (
            shell.map(\.0).min()! - pad, shell.map(\.0).max()! + pad,
            shell.map(\.1).max()! + pad, shell.map(\.1).min()! - pad
        )
    }()

    /// Draw `view` into `size`, centred, as large as fits.
    static func draw(_ view: SectionView?, in context: GraphicsContext, size: CGSize, scheme: ColorScheme) {
        let (left, right, top, bottom) = bounds
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
