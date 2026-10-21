import XCTest
import EggTimerApp
import EggTimerCore

/// `npm run ios:e2e`'s scenarios, what only a device shows: the app on a
/// simulator, its buttons tapped as a finger would, its clock frozen at each
/// moment a scenario checks and stepped from one to the next (`Run`). Each
/// test is a scenario, `test_<name>` for `<name>` with its hyphens as
/// underscores, which tools/iosE2e.ts lists. The npm script runs them all in
/// one `xcodebuild`, each from what a fresh install has (`-resetState`, at
/// its first launch), the device warmed up before the first (`warmUp`). What
/// the app's logic decides is `swift test`'s
/// (ios/EggTimerCore/Tests/EggTimerAppTests).
@MainActor
final class Scenarios: XCTestCase {
    /// One scenario's run: its body once the device is warm, a stop recorded
    /// as a failure, and the app terminated after.
    func scenario(_ body: (Run) throws -> Void, file: StaticString = #filePath, line: UInt = #line) {
        let run = Run(scenarioName)
        do {
            try warmUp()
            try body(run)
        } catch {
            XCTFail("threw: \(error)", file: file, line: line)
        }
        run.terminate()
    }

    /// The scenario's name, from its test's: `test_relaunch_pull` is
    /// `relaunch-pull`.
    private var scenarioName: String {
        let method = name.split(separator: " ").last.map { String($0.dropLast()) } ?? name
        return method.replacingOccurrences(of: "test_", with: "").replacingOccurrences(of: "_", with: "-")
    }
}

// MARK: - A cook, step by step

/// A hot start's settings.
var hotSettings: [String: Any] { ["doneness": 0.41, "altitudeM": 0, "waterLitres": 2, "eggCount": 2, "startMode": "hot"] }

extension Run {
    /// Launch idle and wait for the time decided on its pot's surface and its
    /// odds.
    func idle(_ args: [String] = []) throws {
        try launch(args)
        try until("the idle time decided", from: launched) {
            if case let .answer(_, decided, odds) = $0 { decided && odds } else { false }
        }
    }

    /// Start a cook at the run's first moment, frozen, by Start tapped once
    /// the time is decided, and wait until it has its first phase, its plan
    /// on its surface and its alarms: the cook as stored.
    @discardableResult
    func started(_ args: [String] = []) throws -> StoredCook {
        try idle(args)
        try tap("action.eggsIn")
        let first = try until("the cook started", from: launched, phaseIs("HEATING", "COOKING"))
        try settled(first.i)
        return try storedIn(try sinceLaunch())
    }

    /// Step to 5:00 from the start and tap Rolling boil there: the plan once
    /// cooking.
    @discardableResult
    func boiled() throws -> Plan {
        let i = try step(t0 + 300)
        try tap("action.boil")
        let cooking = try until("phase COOKING", from: i, phaseIs("COOKING"))
        try settled(cooking.i)
        return try planIn(try lines())
    }

    /// Launch again with the clock at `at`: the restore line, the restored
    /// plan, and the lines once the alarms and the card are set again and the
    /// cook has settled.
    func relaunched(
        at: Double, _ args: [String] = [], speed: Double = 0
    ) throws -> (restore: Line, plan: Plan, lines: [Line]) {
        try launch(args, LaunchOptions(at: at, speed: speed))
        let restore = try until("the restore", from: launched) { $0.isRestore }
        let restored = try until("the alarms and the card set again", from: restore.i) { $0 == .restored }
        let phase = try until("the first tick", from: restore.i) { $0.phase != nil }
        try settled(max(restored.i, phase.i))
        let lines = try sinceLaunch()
        return (restore, try planIn(before(lines) { if case .pending = $0 { true } else { false } }), lines)
    }
}
