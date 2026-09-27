import AVFoundation
import AudioToolbox
import EggTimerRing
import os
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The alarm the app sounds itself, when no notification will.
///
/// With notifications refused, unanswered or not taken, the screen says "keep
/// the app open". This is what makes that true: while the app is on screen it
/// rings at each deadline itself. `Cook` decides WHEN, through the tested rule
/// in EggTimerRing (`deadlineToRing`); this only makes the noise.
///
/// The sound is the web app's (`src/ui/clock.ts`, `ringAlarm`), generated here
/// rather than shipped as a file: two 880 Hz beeps every 1.6 s, with a third,
/// higher one at the pull, which is the urgent moment. It rings for up to 40 s,
/// as the web's does, and stops as soon as the cook does anything - touches the
/// screen anywhere, taps the pull button or Cancel, or leaves the app. Up to 40
/// s rather than until answered, because an unattended phone beeping for ever
/// in an empty kitchen helps nobody, and the screen still says what to do when
/// they come back; rather than one short chime, because a cook across the room
/// with wet hands has to hear it and then walk over. Each burst also vibrates,
/// which is what an iPhone on silent, or on a worktop, can still do.
@MainActor
final class Ringer {
    static let shared = Ringer()

    /// When the app last came on screen; nil while it is in the background.
    /// A deadline that passed before this is not rung (see `deadlineToRing`).
    private(set) var onScreenSince: Date?

    private var engine: AVAudioEngine?
    private var buzzing: Task<Void, Never>?
    private var touch: AnyTouch?
    private let log = Logger(subsystem: "name.danmackinlay.actualeggtimer", category: "ring")

    /// The web app's pattern: `BURST_PERIOD_S` and `BURSTS` in clock.ts.
    private static let burstPeriodS = 1.6
    private static let bursts = 25
    private static let sampleRate = 44_100.0

    private init() {
        onScreenSince = UIApplication.shared.applicationState == .background ? nil : .now
        let centre = NotificationCenter.default
        // Foreground and background rather than active and inactive: a system
        // prompt, Control Centre or a banner makes the app inactive while it is
        // still on screen and still able to sound.
        centre.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated { Ringer.shared.onScreenSince = .now }
        }
        centre.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated {
                Ringer.shared.onScreenSince = nil
                Ringer.shared.stop()
            }
        }
    }

    /// Start watching whether the app is on screen. Called when a cook starts
    /// or is restored, so that the first deadline is measured against then and
    /// not against whenever this object happened to be made.
    func activate() {}

    func ring(_ deadline: RingDeadline) {
        stop()
        // It cannot sound from the background anyway: the app has no
        // background audio mode, and the screen said "keep the app open".
        guard onScreenSince != nil else { return }
        log.notice("ringing for \(deadline.rawValue, privacy: .public): no notification holds it")

        // .playback, so the alarm sounds with the silent switch on. The switch
        // is for sounds nobody asked for - ringtones, other apps' alerts - and
        // this is a timer the cook set and was told to keep the app open for;
        // the system Clock's timer rings through it for the same reason. The
        // cost is an asymmetry: a notification, when there is one, is silenced
        // by the switch and only vibrates. That path also puts a banner on the
        // Lock Screen; this one has only the noise. Ducking rather than
        // stopping, so a podcast playing while the cook stands at the hob comes
        // back at full volume when the ring ends.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            log.error("audio session: \(error.localizedDescription, privacy: .public)")
        }

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        if let format = AVAudioFormat(standardFormatWithSampleRate: Self.sampleRate, channels: 1),
           let burst = Self.burst(urgent: deadline == .pull, format: format) {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            do {
                try engine.start()
                player.scheduleBuffer(burst, at: nil, options: .loops)
                player.play()
            } catch {
                log.error("audio engine: \(error.localizedDescription, privacy: .public)")
            }
        }
        self.engine = engine

        buzzing = Task { [weak self] in
            for _ in 0..<Self.bursts {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                try? await Task.sleep(for: .seconds(Self.burstPeriodS))
                if Task.isCancelled { return }
            }
            self?.stop()
        }
        listenForAnyTouch()
    }

    func stop() {
        buzzing?.cancel()
        buzzing = nil
        if let touch { touch.view?.removeGestureRecognizer(touch) }
        touch = nil
        guard let engine else { return }
        engine.stop()
        self.engine = nil
        log.notice("ring stopped")
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Any touch on the screen silences the ring. The recogniser fails on the
    /// touch it hears, so the button under the finger still gets it.
    private func listenForAnyTouch() {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        guard let window else { return }
        let recogniser = AnyTouch { Ringer.shared.stop() }
        window.addGestureRecognizer(recogniser)
        touch = recogniser
    }

    /// One period of the pattern, looped by the player: beeps at 0, 0.2 and (at
    /// the pull) 0.4 s, then silence to 1.6 s. Triangle waves with ramped edges,
    /// as the web's are - a square-edged gate clicks.
    private static func burst(urgent: Bool, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let frames = AVAudioFrameCount(burstPeriodS * sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let samples = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frames
        for i in 0..<Int(frames) { samples[i] = 0 }

        var beeps: [(at: Double, hz: Double, length: Double)] = [(0, 880, 0.14), (0.2, 880, 0.14)]
        if urgent { beeps.append((0.4, 1175, 0.2)) }
        let peak = 0.35, floor = 0.0001, attack = 0.012, release = 0.03
        for beep in beeps {
            let first = Int(beep.at * sampleRate)
            let count = Int(beep.length * sampleRate)
            for n in 0..<count where first + n < Int(frames) {
                let t = Double(n) / sampleRate
                let gain: Double
                if t < attack {
                    gain = floor * pow(peak / floor, t / attack)
                } else if t < beep.length - release {
                    gain = peak
                } else {
                    gain = peak * pow(floor / peak, (t - (beep.length - release)) / release)
                }
                let cycle = (t * beep.hz).truncatingRemainder(dividingBy: 1)
                let triangle = 4 * abs(cycle - 0.5) - 1
                samples[first + n] += Float(gain * triangle)
            }
        }
        return buffer
    }
}

/// Hears the start of every touch in the window and then fails, so it never
/// takes a touch from anything else.
private final class AnyTouch: UIGestureRecognizer, UIGestureRecognizerDelegate {
    private let onTouch: () -> Void

    init(_ onTouch: @escaping () -> Void) {
        self.onTouch = onTouch
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        state = .failed
        // After this touch has been delivered, since answering it takes this
        // recogniser off the window.
        Task { self.onTouch() }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
}
