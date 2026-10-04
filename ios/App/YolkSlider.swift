import SwiftUI
import UIKit
import EggTimerCore

/// The doneness slider, whose track is the yolk (UI.md section 8, "the track
/// is a yolk"): the system's thumb, its drag and its VoiceOver adjusting, on
/// no track of its own, laid over `OddsTrack`, which is the one track there
/// is: the system's blue track above a separate yolk strip would make two,
/// and the web has one.
///
/// A `UISlider` rather than SwiftUI's `Slider`, because only UIKit lets the
/// track go and says where the thumb's centre travels: `inset` is half a
/// thumb, read off the slider itself, so the strip, the bracket and the words
/// under it put each level exactly under the thumb that asks for it, whatever
/// size the system draws the thumb.
struct YolkSlider: UIViewRepresentable {
    @Binding var value: Double
    let range: ClosedRange<Double>
    /// The slider's grid: the web's `step="0.01"`.
    let step: Double
    /// What VoiceOver calls it, and what it reads as its value.
    let label: String
    let valueText: String
    /// Where the thumb's centre stops short of each end, pt: half a thumb.
    @Binding var inset: CGFloat

    func makeUIView(context: Context) -> TracklessSlider {
        let slider = TracklessSlider()
        slider.minimumValue = Float(range.lowerBound)
        slider.maximumValue = Float(range.upperBound)
        slider.step = Float(step)
        slider.value = Float(value)
        slider.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
        slider.addTarget(
            context.coordinator, action: #selector(Coordinator.released(_:)),
            for: [.touchUpInside, .touchUpOutside, .touchCancel]
        )
        slider.onLayout = { [coordinator = context.coordinator] measured in
            coordinator.measured(measured)
        }
        slider.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return slider
    }

    func updateUIView(_ slider: TracklessSlider, context: Context) {
        context.coordinator.parent = self
        if abs(Double(slider.value) - value) > step / 2, !slider.isTracking {
            slider.value = Float(value)
            context.coordinator.sent = nil
        }
        slider.accessibilityLabel = label
        slider.accessibilityValue = valueText
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor
    final class Coordinator: NSObject {
        var parent: YolkSlider
        /// A tick each time the drag crosses into another doneness word, so a
        /// thumb feels where Soft ends and Jammy begins.
        private let haptic = UISelectionFeedbackGenerator()
        private var word: String?
        /// The last level the finger put on the grid. UIKit sends the same
        /// value again - while the finger rests, and once more as it lifts -
        /// and passing that on would undo a snap that landed in between.
        var sent: Double?

        init(_ parent: YolkSlider) { self.parent = parent }

        @objc func changed(_ slider: TracklessSlider) {
            // On the grid, as SwiftUI's `Slider(step:)` put it.
            let stepped = (Double(slider.value) / parent.step).rounded() * parent.step
            let next = min(parent.range.upperBound, max(parent.range.lowerBound, stepped))
            let nearest = anchorNear(next).key
            if let word, word != nearest, slider.isTracking {
                haptic.selectionChanged()
                haptic.prepare()
            }
            word = nearest
            guard next != sent else { return }
            sent = next
            if next != parent.value { parent.value = next }
        }

        /// The finger is off: put the thumb where the value is. A snap that
        /// lands while the finger is still down (to the softest level the
        /// white allows, say) moves the value but not the thumb, which
        /// `updateUIView` leaves alone while tracking, and nothing need redraw
        /// after the finger lifts. Without this, and `sent`, the thumb rested
        /// on the stripes at the far left while the time and the bracket were
        /// for the level the slider had been moved to (LOGBOOK.md, 5 October
        /// 2026). The web's thumb goes there.
        @objc func released(_ slider: TracklessSlider) {
            sent = nil
            if abs(Double(slider.value) - parent.value) > parent.step / 2 {
                slider.value = Float(parent.value)
            }
        }

        func measured(_ inset: CGFloat) {
            guard abs(inset - parent.inset) > 0.25 else { return }
            // Not while SwiftUI is laying out: the next pass takes it up.
            Task { @MainActor [weak self] in self?.parent.inset = inset }
        }
    }
}

/// A `UISlider` with no track: clear images at both ends, so the yolk under
/// it is the track. Reports where its thumb's centre travels after every
/// layout, and adjusts by a tenth of the range to VoiceOver, on the grid.
final class TracklessSlider: UISlider {
    var step: Float = 0.01
    var onLayout: (@MainActor (CGFloat) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        let clear = UIImage()
        setMinimumTrackImage(clear, for: .normal)
        setMaximumTrackImage(clear, for: .normal)
        minimumTrackTintColor = .clear
        maximumTrackTintColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let track = trackRect(forBounds: bounds)
        let thumb = thumbRect(forBounds: bounds, trackRect: track, value: minimumValue)
        onLayout?(max(0, thumb.midX - bounds.minX))
    }

    override func accessibilityIncrement() { nudge(+1) }
    override func accessibilityDecrement() { nudge(-1) }

    private func nudge(_ sign: Float) {
        let tenth = (maximumValue - minimumValue) / 10
        let next = ((value + sign * tenth) / step).rounded() * step
        setValue(min(maximumValue, max(minimumValue, next)), animated: false)
        sendActions(for: .valueChanged)
    }
}
