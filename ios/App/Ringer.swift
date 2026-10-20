import AVFoundation
import AudioToolbox
import EggTimerCore
import os
import UIKit
import UIKit.UIGestureRecognizerSubclass
import EggTimerApp

/// The alarm the app sounds itself, while it is on screen.
///
/// While the app is on screen it rings at each deadline itself, whether or
/// not a notification holds it: silent mode mutes a notification's sound,
/// and not this. With notifications refused, unanswered or not taken, the
/// screen says "keep the app open", and this is what makes that true. `Cook`
/// decides WHEN, through the tested rule in EggTimerApp (`deadlineToRing`);
/// this only makes the noise.
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
    private(set) var onScreenSinceS: Double?

    private var engine: AVAudioEngine?
    private var buzzing: Task<Void, Never>?
    private var touch: AnyTouch?
    private let log = Logger(subsystem: "name.danmackinlay.actualeggtimer", category: "ring")

    private init() {
        onScreenSinceS = UIApplication.shared.applicationState == .background ? nil : AppClock.nowS
        let centre = NotificationCenter.default
        // Foreground and background rather than active and inactive: a system
        // prompt, Control Centre or a banner makes the app inactive while it is
        // still on screen and still able to sound.
        centre.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated { Ringer.shared.onScreenSinceS = AppClock.nowS }
        }
        // And active, if it is not on screen yet: a launch the system began
        // in the background (prewarming) and then brought on screen may say
        // nothing of entering the foreground, and on screen the app's ring is
        // the only one that sounds (`deadlineToRing`).
        centre.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated {
                if Ringer.shared.onScreenSinceS == nil { Ringer.shared.onScreenSinceS = AppClock.nowS }
            }
        }
        centre.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated {
                Ringer.shared.onScreenSinceS = nil
                Ringer.shared.stop()
            }
        }
    }

    func ring(_ deadline: RingDeadline) {
        stop()
        // It cannot sound from the background anyway: the app has no
        // background audio mode, and the screen said "keep the app open".
        guard onScreenSinceS != nil else {
            return Screenshots.log(.ringSkipped(deadline: deadline.rawValue, reason: "not on screen"))
        }
        log.notice("ringing for \(deadline.rawValue, privacy: .public): the app is on screen")

        let sound = AlarmSoundChoice.shared.sound
        play(Self.buffer(sound, deadline), loops: true, file: AlarmSoundChoice.file(sound, deadline))

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
        play(Self.buffer(sound, .cooled, periods: 1), loops: false, file: AlarmSoundChoice.file(sound, .cooled))
        let period = alarmPeriodS(sound, .cooled)
        buzzing = Task { [weak self] in
            try? await Task.sleep(for: .seconds(period))
            if Task.isCancelled { return }
            self?.stop()
        }
    }

    /// Play a buffer on an engine of its own.
    private func play(_ buffer: AVAudioPCMBuffer?, loops: Bool, file: String) {
        // .playback, so the alarm sounds with the silent switch on. The switch
        // is for sounds nobody asked for - ringtones, other apps' alerts - and
        // this is a timer the cook set; the system Clock's timer rings through
        // it for the same reason. The cost is an asymmetry: with the app in the
        // background or the phone locked, the notification is all there is, and
        // silent mode mutes it to a vibration. Ducking rather than
        // stopping, so a podcast playing while the cook stands at the hob comes
        // back at full volume when the ring ends.
        let session = AVAudioSession.sharedInstance()
        var failed: String?
        var active = false
        do {
            try session.setCategory(.playback, mode: .default, options: [.duckOthers])
            try session.setActive(true)
            active = true
        } catch {
            failed = "audio session: \(error.localizedDescription)"
            log.error("audio session: \(error.localizedDescription, privacy: .public)")
        }
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        if buffer == nil {
            failed = failed ?? "no sound to play: its file is missing or unreadable"
            log.error("no sound to play: its file is missing or unreadable")
        }
        if let buffer {
            log.notice("playing \(buffer.frameLength) frames at \(buffer.format.sampleRate) Hz\(loops ? ", looped" : "", privacy: .public)")
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
            if Screenshots.muteAudio { engine.mainMixerNode.outputVolume = 0 }
            do {
                try engine.start()
                player.scheduleBuffer(buffer, at: nil, options: loops ? .loops : [])
                player.play()
            } catch {
                failed = failed ?? "audio engine: \(error.localizedDescription)"
                log.error("audio engine: \(error.localizedDescription, privacy: .public)")
            }
        }
        self.engine = engine
        // What was asked of the speaker and what it took: a ring that plays
        // at no media volume, or to a route nobody is near, is as silent as
        // one that never started.
        Screenshots.log(.ringing(
            file: file, frames: buffer.map { Int($0.frameLength) }, category: session.category.rawValue,
            active: active, engine: engine.isRunning, playing: player.isPlaying,
            volume: Double(session.outputVolume), route: session.currentRoute.outputs.map(\.portType.rawValue),
            error: failed
        ))
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

    /// Every file an alarm can name (`AlarmSoundChoice.file`), to the debug
    /// log as the bundle has it: there, its length and its format. The
    /// system plays a notification's sound only from a file it can find,
    /// under 30 s, in linear PCM, IMA4, µ-law or a-law (`npm run ios:e2e`
    /// holds each to that).
    static func logFiles() {
        guard Screenshots.logging else { return }
        for sound in AlarmSound.allCases {
            for moment in RingDeadline.allCases {
                let name = AlarmSoundChoice.file(sound, moment)
                let file = Bundle.main.url(forResource: name, withExtension: nil)
                    .flatMap { try? AVAudioFile(forReading: $0) }
                let format = file.map { f in
                    let id = f.fileFormat.streamDescription.pointee.mFormatID.bigEndian
                    return withUnsafeBytes(of: id) { String(decoding: $0, as: UTF8.self) }
                }
                Screenshots.log(.soundFile(
                    name: name, bundled: Bundle.main.url(forResource: name, withExtension: nil) != nil,
                    seconds: file.map { Double($0.length) / $0.fileFormat.sampleRate }, format: format
                ))
            }
        }
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

/// What the app's logic asks of the ring (`Services`, in EggTimerApp).
extension Ringer: AlarmRinging {}
