import Foundation
import EggTimerCore

extension Planner {
    // MARK: - Learning from an egg

    /// An egg's record, as core made it (the cook's `log` effect): written
    /// down FIRST, before any arithmetic, so an app killed during the fold
    /// folds it again at the next launch rather than losing it; then learned
    /// from, if it says anything. In place of the egg logged last when
    /// `replaces`: a later answer, or a correction after the pull.
    public func logRecord(_ record: EggRecord, replaces: Bool) {
        // A newer build's results are left alone (`Stores`): nothing is
        // written down, so nothing is learned either.
        guard !Stores.readOnly else { return }
        if replaces, let index = kept.log.indices.last {
            replaceLogged(index, record)
            return
        }
        if recordTeaches(record) {
            folded = nil
            liveIndex = kept.log.count
        }
        kept.log.append(record)
        Calibrations.save(kept)
        Task { await drain() }
    }

    /// The calibration before the egg at `index` in the log, for a
    /// correction made after its pull (design/one-screen.md section 4,
    /// "Never from its own outcome"; core `asRanCorrected`): a plan made for
    /// that cook on a posterior that has folded its own answer would score
    /// the model against what it already learned from it. The web's
    /// `calibrationBefore`.
    ///
    /// - Not in the log (nil), or not folded yet: the calibration as it
    ///   stands, which has learned nothing from it.
    /// - Folded in this process: the calibration held before folding it
    ///   (`folded.before`), as a second answer refolds from.
    /// - Otherwise (folded before a relaunch): the log replayed up to it, a
    ///   surface per egg, off the main actor.
    public func calibrationBefore(_ index: Int?) async -> Calibration {
        guard let index, index < kept.folded else { return kept.calibration }
        if let done = folded, done.index == index { return done.before }
        var c = Calibrations.start(kept.base)
        for egg in kept.log[..<index] where recordTeaches(egg) {
            let request = gridRequestFor(c, egg)
            let grid = await Task.detached(priority: .userInitiated) { buildRequestedGrid(request) }.value
            foldRecord(&c, egg, grid: grid)
        }
        return c
    }

    /// The egg at `index` replaced by `record`, the same egg as last said
    /// and corrected, and the posterior folded again from before it: from
    /// the calibration held before its fold when this process folded it,
    /// else from where the log's replay starts.
    public func replaceLogged(_ index: Int, _ record: EggRecord) {
        guard kept.log.indices.contains(index), kept.log[index] != record else { return }
        kept.log[index] = record
        if index < kept.folded {
            // Whatever is mid-fold lands on nothing.
            generation &+= 1
            if let done = folded, done.index == index {
                kept.calibration = done.before
                kept.folded = index
            } else {
                kept.calibration = Calibrations.start(kept.base)
                kept.folded = 0
            }
            folded = nil
            liveIndex = index
        }
        Calibrations.save(kept)
        Task { await drain() }
    }

    /// Fold every egg not yet folded, one surface at a time.
    ///
    /// The grid build is a second or two of arithmetic, so it goes to a
    /// detached task, as it always has; a catch-up after a relaunch is several
    /// of them, and takes the same path. The fold itself is milliseconds, and
    /// happens back here, reading the record AFTER the surface lands: an answer
    /// that arrived while it was being built is folded with the first, as a
    /// replay folds them.
    ///
    /// One drain at a time: a call made while one runs returns at once, and the
    /// running one picks up whatever was appended, because it reads the log
    /// again after every egg.
    public func drain() async {
        guard !draining else { return }
        draining = true
        learning = true
        while kept.folded < kept.log.count {
            let gen = generation
            let index = kept.folded
            let egg = kept.log[index]
            guard recordTeaches(egg) else {
                kept.folded += 1
                Calibrations.save(kept)
                continue
            }
            // Centred where the posterior stood BEFORE this egg, exactly as
            // `replay` does it; nothing else folds while this runs.
            let request = gridRequestFor(kept.calibration, egg)
            let grid = await Task.detached(priority: .userInitiated) {
                buildRequestedGrid(request)
            }.value
            // Forgotten while the surface was being built.
            guard gen == generation else { continue }
            let before = kept.calibration
            var next = before
            foldRecord(&next, kept.log[index], grid: grid)
            kept.calibration = next
            kept.folded += 1
            if index == liveIndex {
                liveIndex = nil
                folded = Folded(index: index, grid: grid, before: before)
            }
            Calibrations.save(kept)
        }
        draining = false
        learning = false
        // The egg just eaten keeps the numbers it was cooked with; the new
        // ones show up on the next cook.
        recompute()
    }

    /// Take it all back: the posterior, the log of eggs it was folded from, the
    /// base under it, AND the measured pan. The web app clears them all from one
    /// button, and a kitchen that has forgotten your taste but still insists it
    /// knows your hob is not a state anyone asked for.
    public func resetCalibration() {
        generation &+= 1
        liveIndex = nil
        folded = nil
        Calibrations.reset()
        kept = Calibrations.freshKept()
        BoilMemories.reset()
        boilMemory = [:]
        // The next egg is a new cook's, under a new id (Sharing.swift).
        Services.sharing.forget()
        recompute()
    }

    #if DEBUG
    /// Debug builds only (Screenshots.swift, `-seedEggs`): write eggs into
    /// the log through the app's own store, as if each had been cooked at the
    /// level and setup on screen, at its mean time, and answered as given
    /// about the yolk, in the five words, and, where given, the white; then fold
    /// them, as a relaunch folds eggs it finds unfolded. Only into an empty
    /// log, so a relaunch does not seed twice.
    public func seed(_ answers: [SeedAnswer]) {
        guard kept.log.isEmpty, !answers.isEmpty, !isSousVide else { return }
        let solved = solveCookTime(
            egg: egg, setup: setup, params: calibrationParams(calibration),
            doneness: calibrationDoneness(calibration, level: doneness)
        )
        let seconds = solved.result.cookTimeS
        for answer in answers {
            kept.log.append(EggRecord(
                day: "2026-09-28", app: .ios, appVersion: Calibrations.appVersion,
                egg: RecordEgg(massG: recordMassG(massKg: egg.massKg), massFrom: massFrom, sizeTable: sizeTable),
                setup: RecordSetup(
                    setup: setup, eggFrom: startTemp,
                    timeToBoilFrom: coldStart ? .measured : .default
                ),
                level: doneness, recommendedS: seconds, pulledS: seconds, pulledBy: .cook,
                cooledS: cooling == .counter ? 0 : coolingSecondsFor(solved.result),
                yolkWord: answer.yolkWord, white: answer.white, lang: "en", units: .metric
            ))
        }
        Calibrations.save(kept)
        Task { await drain() }
    }
    #endif
}
