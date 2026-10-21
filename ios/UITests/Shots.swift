import XCTest
import EggTimerApp
import EggTimerCore

/// `npm run ios:shots`'s captures (tools/iosShots.ts): each test brings the
/// app to one App Store screenshot, by the taps a cook would make, the clock
/// frozen and stepped to the moment shown, and writes the device's screen to
/// `AET_SHOTS_DIR` as `<shot>.png` (`test_shot_01_time` is `01-time.png`).
/// The npm script sets the device's status bar and appearance, and sets the
/// captures under their captions. Not among `npm run ios:e2e`'s scenarios.
@MainActor
final class Shots: XCTestCase {
    func test_shot_01_time() throws {
        try shot { run in try run.launched() }
    }

    func test_shot_02_setting() throws {
        try shot { run in try run.cook { $0.start + 200 } }
    }

    func test_shot_03_heat() throws {
        try shot { run in try run.cook(over: ["eggView": "heat"]) { $0.start + 200 } }
    }

    func test_shot_04_done() throws {
        try shot { run in try run.cook(args: ["-uiScreen", "end"], out: true) { $0.cooled + 1 } }
    }

    func test_shot_05_eggcup() throws {
        try shot { run in try run.cook(over: ["cooling": "eggCup"], out: true) { $0.cooled - 75 } }
    }

    /// One shot: the app brought to it from today at 9:38, local, so a time
    /// on screen agrees with the status bar's 9:41; then the screen, taken
    /// again until two in a row are the same, so no animation is caught
    /// midway.
    private func shot(_ go: (Run) throws -> Void) throws {
        let file = name.split(separator: " ").last.map { String($0.dropLast()) }?
            .replacingOccurrences(of: "test_shot_", with: "").replacingOccurrences(of: "_", with: "-") ?? name
        try warmUp()
        let run = Run("shot-\(file)")
        defer { run.terminate() }
        let start = Calendar.current.date(bySettingHour: 9, minute: 38, second: 0, of: Date())!.timeIntervalSince1970
        run.t0 = start
        run.at = start
        try go(run)
        guard let dir = ProcessInfo.processInfo.environment["AET_SHOTS_DIR"] else { throw Stop("no AET_SHOTS_DIR") }
        var last = Data()
        for _ in 0..<20 {
            pause(0.5)
            let png = XCUIScreen.main.screenshot().pngRepresentation
            if png == last {
                try png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(file).png"))
                return
            }
            last = png
        }
        throw Stop("\(file): the screen never still")
    }
}

/// The egg every shot cooks unless it says otherwise: a 60 g egg weighed,
/// from the fridge, into boiling water, cooled in ice, asked soft.
private var egg: [String: Any] {
    ["sizeIndex": -1, "weighedMassG": 60, "startTempMode": "fridge", "startMode": "hot", "cooling": "ice", "doneness": 0.22]
}

/// A cook's deadlines, epoch s, cook time.
private struct Deadlines {
    let start: Double
    let pull: Double
    let cooled: Double
}

extension Run {
    /// Launch with the egg, and wait until the time is worked out and drawn.
    fileprivate func launched(over: [String: Any] = [:], args: [String] = []) throws {
        try idle(settingsArg(egg.merging(over) { $1 }) + args)
        try tick()
    }

    /// A cook: Start tapped a second after the launch; with `out`, the eggs
    /// out two seconds into the pull; then the clock stepped to `at(plan)`.
    fileprivate func cook(
        over: [String: Any] = [:], args: [String] = [], out: Bool = false, _ at: (Deadlines) -> Double
    ) throws {
        try launched(over: over, args: args)
        let start = t0 + 1
        var i = try step(start)
        try tap("action.eggsIn")
        try settled(try until("phase COOKING", from: i, phaseIs("COOKING")).i)
        let last = { () throws -> Deadlines in
            let p = try planIn(try self.lines())
            return Deadlines(start: start, pull: p.pull, cooled: try p.cooledAt())
        }
        if out {
            i = try step(try last().pull + 2)
            try tap("action.out")
            try settled(try until("phase COOLING", from: i, phaseIs("COOLING")).i)
        }
        try step(at(try last()))
    }
}
