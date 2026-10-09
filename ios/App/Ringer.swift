import AVFoundation
import AudioToolbox
import EggTimerCore
import os
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The alarm the app sounds itself, when no notification will.
///
/// With notifications refused, unanswered or not taken, the screen says "keep
/// the app open". This is what makes that true: while the app is on screen it
/// rings at each deadline itself. `Cook` decides WHEN, through the tested rule
/// in EggTimerCore (`deadlineToRing`); this only makes the noise.
///
/// The sound is the one the cook chose (`AlarmSoundChoice`), the web's
/// (`src/ui/alarmSounds.ts`), from the file the notification plays: whole
/// periods of its pattern, the urgent form at the pull, looped. It rings for
/// up to 40 s (`alarmRingS`), as the web's does, and stops as soon as the cook
/// does anything - touches the screen anywhere, taps the pull button or
/// Cancel, or leaves the app. Up to 40
/// s rather than until answered, because an unattended phone beeping for ever
/// in an empty kitchen helps nobody, and the screen still says what to do when
/// they come back; rather than one short chime, because a cook across the room
/// with wet hands has to hear it and then walk over. Each burst also vibrates,
/// which is what an iPhone on silent, or on a worktop, can still do.
@MainActor
final class Ringer {
    static let shared = Ringer()

    /// When the app last came on screen, in cook time (`AppClock`); nil while
    /// it is in the background.
    /// A deadline that passed before this is not rung (see `deadlineToRing`).
    private(set) var onScreenSince: Date?

    private var engine: AVAudioEngine?
    private var buzzing: Task<Void, Never>?
    private var touch: AnyTouch?
    private let log = Logger(subsystem: "name.danmackinlay.actualeggtimer", category: "ring")

    private init() {
        onScreenSince = UIApplication.shared.applicationState == .background ? nil : AppClock.now
        let centre = NotificationCenter.default
        // Foreground and background rather than active and inactive: a system
        // prompt, Control Centre or a banner makes the app inactive while it is
        // still on screen and still able to sound.
        centre.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated { Ringer.shared.onScreenSince = AppClock.now }
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

        let sound = AlarmSoundChoice.shared.sound
        play(Self.buffer(sound, deadline), loops: true)

        // Each period vibrates; the last one ends the ring.
        let period = alarmPeriodS(sound, deadline)
        let repeats = alarmRepeats(sound, deadline)
        buzzing = Task { [weak self] in
            for _ in 0..<repeats {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                try? await Task.sleep(for: .seconds(period))
                if Task.isCancelled { return }
            }
            self?.stop()
        }
        listenForAnyTouch()
    }

    /// The sound played once, as it rings when the cooling is done, for the
    /// cook choosing it in Settings. Through the silent switch, as the ring
    /// is, since the cook asked to hear it; no vibration, and a touch does
    /// not stop it, since the touch is what chose it.
    func preview(_ sound: AlarmSound) {
        stop()
        play(Self.buffer(sound, .cooled, periods: 1), loops: false)
        let period = alarmPeriodS(sound, .cooled)
        buzzing = Task { [weak self] in
            try? await Task.sleep(for: .seconds(period))
            if Task.isCancelled { return }
            self?.stop()
        }
    }

    /// Play a buffer on an engine of its own.
    private func play(_ buffer: AVAudioPCMBuffer?, loops: Bool) {
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
        if buffer == nil { log.error("no sound to play: its file is missing or unreadable") }
        if let buffer {
            log.notice("playing \(buffer.frameLength) frames at \(buffer.format.sampleRate) Hz\(loops ? ", looped" : "", privacy: .public)")
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
            #if DEBUG
            if Screenshots.muteAudio { engine.mainMixerNode.outputVolume = 0 }
            #endif
            do {
                try engine.start()
                player.scheduleBuffer(buffer, at: nil, options: loops ? .loops : [])
                player.play()
            } catch {
                log.error("audio engine: \(error.localizedDescription, privacy: .public)")
            }
        }
        self.engine = engine
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

    /// A sound's file for a moment, or its first `periods` periods, read
    /// whole: whole periods, so it loops without a seam. Nil if the file is
    /// missing or unreadable, and the ring is then only the vibration.
    private static func buffer(_ sound: AlarmSound, _ moment: RingDeadline, periods: Int? = nil) -> AVAudioPCMBuffer? {
        let name = AlarmSoundChoice.file(sound, moment)
        guard let url = Bundle.main.url(forResource: name, withExtension: nil),
              let file = try? AVAudioFile(forReading: url) else { return nil }
        let whole = AVAudioFrameCount(file.length)
        let frames = periods.map {
            min(whole, AVAudioFrameCount((Double($0) * alarmPeriodS(sound, moment) * file.processingFormat.sampleRate).rounded()))
        } ?? whole
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames),
              (try? file.read(into: buffer, frameCount: frames)) != nil else { return nil }
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
