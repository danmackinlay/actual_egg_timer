import Foundation
import EggTimerCore

extension Planner {
    // MARK: - Learning from an egg

    /// Write one egg down with its first answer - the yolk or the white - then
    /// learn from it.
    ///
    /// Written down FIRST, before any arithmetic: an app killed during the fold
    /// then folds it again on the next launch, rather than losing it. The
    /// record carries the egg and pan the cook was RUN with, off the ticket.
    func record(_ egg: EggRecord) async {
        answers = Answers(yolk: egg.yolkWord, white: egg.white, probe: egg.probe)
        folded = nil
        liveIndex = kept.log.count
        kept.log.append(egg)
        Calibrations.save(kept)
        await drain()
    }

    /// The second answer about the egg on screen - the white after the yolk, or
    /// the yolk after the white.
    ///
    /// If the egg is still being folded, the answer is written into its record
    /// and the fold, which reads the record when its surface lands, takes both.
    /// If it has been folded, it is folded AGAIN from the calibration as it
    /// stood before it, against the same surface, so the posterior is what a
    /// replay of the log makes whichever order the taps came in. Refused, and
    /// nothing written, when that is no longer possible - which is what keeps
    /// the log and the posterior one thing. The web app's `recordSecondAnswer`.
    func secondAnswer(yolk: YolkWord?, white: WhiteReport?, probe: ProbeReading? = nil) async {
        guard var given = answers, let index = liveIndex ?? folded?.index ?? resumedIndex,
              index == kept.log.count - 1 else { return }
        if yolk != nil, given.yolk != nil { return }
        if white != nil, given.white != nil { return }
        if probe != nil, given.probe != nil { return }
        var egg = kept.log[index]
        // A record holds one yolk answer: never a word beside an old one.
        if yolk != nil, egg.yolk != nil { return }
        if let yolk { egg.yolkWord = yolk; given.yolk = yolk }
        if let white { egg.white = white; given.white = white }
        if let probe { egg.probe = probe; given.probe = probe }
        if kept.folded <= index {
            answers = given
            kept.log[index] = egg
            Calibrations.save(kept)
            await drain()
            return
        }
        guard let done = folded, done.index == index, kept.folded == index + 1 else {
            // Answered before a relaunch, and folded then: the surface and the
            // posterior before this egg went with that process. The answer is
            // written into the record and the whole log replayed from where it
            // starts, which is what the posterior is by definition - seconds
            // per egg, off the main actor, while the app runs on what it had.
            guard resumedIndex == index, kept.folded == index + 1 else { return }
            // Nothing is mid-fold (the log is all folded), but whatever was
            // lands on nothing.
            generation &+= 1
            answers = given
            kept.log[index] = egg
            kept.calibration = Calibrations.start(kept.base)
            kept.folded = 0
            // Folded again as the live egg, so a third answer needs no replay.
            liveIndex = index
            resumedIndex = nil
            Calibrations.save(kept)
            await drain()
            return
        }
        answers = given
        learning = true
        let gen = generation
        let again = await Task.detached(priority: .userInitiated) {
            var c = done.before
            foldRecord(&c, egg, grid: done.grid)
            return c
        }.value
        if gen == generation {
            kept.log[index] = egg
            kept.calibration = again
            Calibrations.save(kept)
        }
        learning = false
        recompute()
    }

    /// The cook has moved on: the next answers are about the next egg.
    func endEgg() {
        answers = nil
        folded = nil
        liveIndex = nil
        resumedIndex = nil
    }

    /// A finished cook picked back up after a relaunch, answered before it:
    /// if its egg is the last in the log - the same record but for the
    /// answers - what it was told is on screen again, and the questions it
    /// was not are still open. Anything else, and the cook stays as answered.
    func resumeAnswers(_ cooked: EggRecord) {
        guard answers == nil, let index = kept.log.indices.last else { return }
        let last = kept.log[index]
        // Answered the old way, on a build before the five yolk words: its
        // yolk question is not the one on screen, so it stays as answered.
        guard last.yolk == nil else { return }
        var bare = last
        bare.yolkWord = nil
        bare.white = nil
        bare.probe = nil
        guard bare == cooked else { return }
        answers = Answers(yolk: last.yolkWord, white: last.white, probe: last.probe)
        folded = nil
        // Not folded yet (the fold is caught up on launch): a later answer is
        // written in and folded with it. Folded already: replayed.
        if index >= kept.folded {
            liveIndex = index
        } else {
            resumedIndex = index
        }
    }

    /// An egg finished and never answered about. Still a record - the cook, the
    /// recommendation and the pull are data for the fit - and it folds nothing.
    func logUnanswered(_ egg: EggRecord) {
        kept.log.append(egg)
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
    func drain() async {
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
    func resetCalibration() {
        generation &+= 1
        liveIndex = nil
        resumedIndex = nil
        folded = nil
        answers = nil
        Calibrations.reset()
        kept = Calibrations.freshKept()
        BoilMemories.reset()
        boilMemory = [:]
        // The next egg is a new cook's, under a new id (Sharing.swift).
        Sharing.shared.forget()
        recompute()
    }

    #if DEBUG
    /// Debug builds only (Screenshots.swift, `-seedEggs`): write eggs into
    /// the log through the app's own store, as if each had been cooked at the
    /// level and setup on screen, at its mean time, and answered as given
    /// about the yolk and, where given, the white; then fold them, as a
    /// relaunch folds eggs it finds unfolded. Only into an empty log, so a
    /// relaunch does not seed twice.
    func seed(_ answers: [(yolk: Feedback, white: WhiteReport?)]) {
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
                yolk: answer.yolk, white: answer.white, lang: "en", units: .metric
            ))
        }
        Calibrations.save(kept)
        Task { await drain() }
    }
    #endif
}
