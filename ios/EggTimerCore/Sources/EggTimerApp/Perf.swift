import Foundation
import QuartzCore

/// How long what an input change sets running takes to reach the screen
/// (`-perfProbe all`, Screenshots.swift): on only under that launch
/// argument, so never in a release build, which reads none. Prints lines that
/// start "PERF", read with `xcrun simctl launch --console-pty`. LOGBOOK.md,
/// 4 October 2026, has what it measured.
///
/// Every landing is timed from the last INPUT change, not from the solve that
/// produced it, because that is what the cook waits for. Its lines are not
/// words on a screen, and are built from as few literals as will do, each on
/// copyLiterals' NOT_COPY list.
public enum Perf {
    public static let on = Screenshots.arguments?.string(forKey: "perfProbe") != nil
    @MainActor private static var inputAt = CACurrentMediaTime()

    /// What is timed on its own.
    public enum Stage { case answerAt, grid, profile }

    /// What lands: an answer, and whether it is a step behind, its time
    /// chosen, with its odds, or a moment the main actor was late.
    public enum Event { case landed, interim, chosen, odds, late }

    /// The scripted inputs.
    public enum Script { case tapAltitude, holdAltitude, tapWater, dragDoneness, inputsDone, worstLateness, done }

    @MainActor public static func input() { inputAt = CACurrentMediaTime() }

    private static func line(_ parts: [String]) {
        print(parts.joined(separator: " "))
    }

    private static func ms(_ seconds: Double) -> String {
        String(format: "%.1f", seconds * 1000)
    }

    /// An answer on screen: when, and what it was.
    @MainActor public static func landed(question: Int, interim: Bool, chosen: Bool, odds: Bool, cookS: Double) {
        guard on else { return }
        var events: [Event] = [.landed]
        if interim { events.append(.interim) }
        if chosen { events.append(.chosen) }
        if odds { events.append(.odds) }
        line(["PERF", ms(CACurrentMediaTime() - inputAt)] + events.map { "\($0)" } + ["q\(question)", "\(Int(cookS))"])
    }

    /// How long one stage took, wherever it runs.
    public static func time<T>(_ stage: Stage, _ body: () -> T) -> T {
        guard on else { return body() }
        let t0 = CACurrentMediaTime()
        let out = body()
        line(["PERF", "\(stage)", ms(CACurrentMediaTime() - t0)])
        return out
    }

    /// The scripted inputs: a stepper tapped, a stepper held, the slider
    /// dragged. Each waits for the screen to settle first. The main actor's
    /// worst lateness over each is printed with it: how long a tap could have
    /// waited to be seen at all.
    @MainActor
    public static func drive(_ planner: Planner) {
        guard on else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(6))
            await run(.tapAltitude) {
                for _ in 0..<5 {
                    planner.settings.altitudeM += 50
                    try? await Task.sleep(for: .milliseconds(700))
                }
            }
            await run(.holdAltitude) {
                for _ in 0..<20 {
                    planner.settings.altitudeM += 50
                    try? await Task.sleep(for: .milliseconds(100))
                }
            }
            await run(.tapWater) {
                for _ in 0..<4 {
                    planner.settings.waterLitres += 0.25
                    try? await Task.sleep(for: .milliseconds(700))
                }
            }
            await run(.dragDoneness) {
                for i in 0..<94 {
                    planner.settings.doneness = 0.3 + 0.4 * Double(i) / 93
                    try? await Task.sleep(for: .milliseconds(16))
                }
            }
            line(["PERF", "\(Script.done)"])
        }
    }

    @MainActor
    private static func run(_ script: Script, _ body: () async -> Void) async {
        try? await Task.sleep(for: .seconds(5))
        line(["PERF", "\(script)"])
        let watcher = Task { @MainActor in
            var worst = 0.0
            while !Task.isCancelled {
                let t0 = CACurrentMediaTime()
                try? await Task.sleep(for: .milliseconds(5))
                let late = CACurrentMediaTime() - t0 - 0.005
                if late > 0.03 { line(["PERF", ms(CACurrentMediaTime() - inputAt), "\(Event.late)", ms(late)]) }
                worst = max(worst, late)
            }
            return worst
        }
        let t0 = CACurrentMediaTime()
        await body()
        line(["PERF", "\(Script.inputsDone)", ms(CACurrentMediaTime() - t0)])
        try? await Task.sleep(for: .seconds(4))
        watcher.cancel()
        line(["PERF", "\(Script.worstLateness)", ms(await watcher.value)])
    }
}
