import XCTest
import EggTimerApp
import EggTimerCore

// What the scenarios drive the app with: one run of the app a scenario
// (`Run`), its launches, its clock stepped from outside, its debug log read
// back by the app's own events, its stores' plist, and its screen, found by
// accessibility identifiers and tapped as a finger would.
//
// The clock and the log go through a directory on the Mac (`-debugDir`,
// Screenshots.swift), which a simulator's app and its tests both read and
// write: the tests cannot see the app's container. `npm run ios:e2e`
// (tools/iosE2e.ts) gives each scenario a fresh install and its own
// directory.

/// What the npm script passes the tests (`TEST_RUNNER_<name>`, which
/// xcodebuild hands the tests as `<name>`).
enum Env {
    private static let values = ProcessInfo.processInfo.environment
    /// How long a wait for the app gives up after, s: only how long a broken
    /// build takes to fail, never what a check means.
    static let waitS = Double(values["AET_E2E_WAIT"] ?? "") ?? 60
    /// The locale every launch is given (`localeArgs`).
    static let locale = values["AET_LOCALE"] ?? "en-AU"
    /// Where each scenario's directory is made.
    static let root = values["AET_E2E_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) }
        ?? FileManager.default.temporaryDirectory
    /// The repository, from this file's place in it: a simulator's tests read
    /// the Mac's files.
    static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
}

/// A failure that ends a scenario: a wait given up, or something it needs
/// missing.
struct Stop: Error, CustomStringConvertible {
    let description: String
    init(_ what: String) { description = what }
}

/// `tag`, a language and a region (`en-AU`), as launch arguments: the
/// argument domain is read before the device's own preferences, so the app's
/// `Locale.current`, its region and preferred languages are the tag's. The
/// unit and clock preferences are given too, since the device's, copied from
/// the host as well, win over the locale's: Fahrenheit, inches and the US
/// system in the US, Celsius and metric elsewhere; the clock the locale's own.
func localeArgs(_ tag: String) -> [String] {
    let parts = tag.split(separator: "-").map(String.init)
    precondition(parts.count == 2, "AET_LOCALE \(tag): a language and a region, as en-AU")
    let us = parts[1] == "US"
    return [
        "-AppleLocale", "\(parts[0])_\(parts[1])", "-AppleLanguages", "(\(tag))",
        "-AppleTemperatureUnit", us ? "Fahrenheit" : "Celsius",
        "-AppleMeasurementUnits", us ? "Inches" : "Centimeters", "-AppleMetricUnits", us ? "NO" : "YES",
        "-AppleICUForce24HourTime", "NO", "-AppleICUForce12HourTime", "NO",
    ]
}

/// The settings as stored, in the app's format, given at launch: what is not
/// given is the default. A launch argument whose value is `<hex>` is data to
/// UserDefaults, as the app stores the value.
func settingsArg(_ over: [String: Any]) -> [String] {
    var o = over
    o["v"] = StoreRegistry.settings.format
    let data = try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])
    return ["-\(StoreRegistry.settings.key)", "<\(data.map { String(format: "%02x", $0) }.joined())>"]
}

/// How a launch is made: notifications granted quietly with no prompt or
/// answered no, the clock's moment, and its speed (0 frozen).
struct LaunchOptions {
    var alarms = true
    var at: Double?
    var speed: Double = 0
}

/// One line of the debug log: its moment (cook time, epoch s), its case's
/// name, the event, and its index in the log.
struct Line {
    let t: Double
    let ev: String
    let event: Screenshots.Event
    let i: Int
}

/// One scenario's run of the app: its clock, its launches, its log.
///
/// The clock is frozen at each moment a scenario checks: launched there
/// (`-clockAt`, `-clockSpeed 0`) and stepped from one to the next while the
/// app runs (`step`, through `aet.clock`). What the app does at a moment is
/// then the same on any machine, however slow or loaded: the scenario waits
/// for the log to say it has happened, never for a span of the host's time to
/// pass, and a tap lands at the moment the clock stands at. A wait's timeout
/// only says when to give up.
@MainActor
final class Run {
    let name: String
    let app = XCUIApplication()
    /// Cook time at the first launch, a whole second: each moment checked is
    /// this, a span on, or a deadline the app planned.
    var t0: Double
    /// Where the clock stands, cook time, epoch s.
    var at: Double
    /// Steps taken, and the log's length at the last launch.
    private(set) var steps = 0
    private(set) var launched = 0
    /// The scenario's directory, which the app is given as `-debugDir`.
    let dir: URL
    private var log: [Line] = []
    private var logBytes = 0

    init(_ name: String) {
        self.name = name
        t0 = Date().timeIntervalSince1970.rounded(.down)
        at = t0
        dir = Env.root.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    var logURL: URL { dir.appendingPathComponent("aet.log") }
    private var clockURL: URL { dir.appendingPathComponent("aet.clock") }

    /// Launch with the clock at `at`, cook time, frozen there unless `speed`
    /// says otherwise; quiet notifications granted with no prompt unless asked
    /// otherwise. Silent: the ring and the notifications' sound would
    /// otherwise play on the Mac's speakers.
    func launch(_ args: [String] = [], _ opts: LaunchOptions = LaunchOptions()) throws {
        at = opts.at ?? at
        try? FileManager.default.removeItem(at: clockURL)
        launched = try lines().count
        let prompt = opts.alarms ? ["-provisionalAlarms", "YES"] : ["-noAlarmPrompt", "YES"]
        app.launchArguments = [
            "-clockAt", "\(at)", "-clockSpeed", "\(opts.speed)", "-debugDir", dir.path, "-muteAudio", "YES",
        ] + localeArgs(Env.locale) + prompt + args
        app.launch()
    }

    func terminate() {
        app.terminate()
    }

    /// Move the running app's clock to `at`, frozen there, as a phone asleep
    /// or set would be, and wait until the app has caught up with it (`idle`,
    /// Screenshots.swift): the cook ticked at the moment, nothing under way,
    /// the screen drawn; with `idle: false`, only until the clock has moved.
    /// The index of the line that says the clock moved, from which what the
    /// step set going follows.
    @discardableResult
    func step(_ at: Double, idle: Bool = true) throws -> Int {
        steps += 1
        let n = steps
        try Data("\(n) \(at) 0\n".utf8).write(to: clockURL, options: .atomic)
        let what = "the clock at +\(String(format: "%.3f", at - t0)) s"
        let ack = try until(what, from: launched) { if case .clock(n, _, _) = $0 { true } else { false } }
        if idle {
            try until("the app idle after \(what)", from: ack.i) { if case .idle(n) = $0 { true } else { false } }
        }
        self.at = at
        return ack.i
    }

    /// A step to where the frozen clock stands: once the app has ticked there
    /// again and has nothing under way, and the screen is drawn. What a check
    /// that something did not happen waits for.
    @discardableResult
    func tick() throws -> Int { try step(at) }

    /// The debug log so far, read on from where the last read stopped, a
    /// whole line at a time: the bytes after the last newline are a line
    /// still being written, read once it ends.
    func lines() throws -> [Line] {
        guard let handle = try? FileHandle(forReadingFrom: logURL) else { return log }
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(logBytes))
        let data = handle.readDataToEndOfFile()
        guard let end = data.lastIndex(of: 0x0a) else { return log }
        for text in data[data.startIndex...end].split(separator: 0x0a) {
            log.append(try Line(String(decoding: text, as: UTF8.self), i: log.count))
        }
        logBytes += end - data.startIndex + 1
        return log
    }

    /// The lines since the last launch.
    func sinceLaunch() throws -> [Line] { Array(try lines()[launched...]) }

    /// Wait for an event that `test` holds of from line `from` on: its line;
    /// or stop after `timeoutS` of the host's seconds.
    @discardableResult
    func until(
        _ what: String, from: Int = 0, timeoutS: Double = Env.waitS, _ test: (Screenshots.Event) -> Bool
    ) throws -> Line {
        let end = Date().addingTimeInterval(timeoutS)
        repeat {
            let all = try lines()
            if from < all.count, let hit = all[from...].first(where: { test($0.event) }) { return hit }
            pause(0.1)
        } while Date() < end
        throw Stop("timed out waiting for \(what)")
    }

    /// Wait until the cook has nothing under way after line `from` (`settled`,
    /// Cook.swift). Only after a line that set some of that going.
    @discardableResult
    func settled(_ from: Int) throws -> Line {
        try until("the cook settled", from: from) { $0 == .settled }
    }

    /// The app's data container, as its last launch said (`launched`).
    func home() throws -> String {
        guard let home = try lines().last(where: { $0.ev == "launched" }).flatMap({ l -> String? in
            if case .launched(let h) = l.event { h } else { nil }
        }) else { throw Stop("no launch logged its home") }
        return home
    }

    /// The plist of the app's stores, its suite of UserDefaults (`Stores.suite`).
    private func plistURL() throws -> URL {
        URL(fileURLWithPath: try home()).appendingPathComponent("Library/Preferences/\(bundleID).stores.plist")
    }

    /// The stores' plist, each data value that is JSON parsed; waits until
    /// `ready(prefs)` holds, since the file lags the app by seconds.
    func prefs(timeoutS: Double = Env.waitS, _ ready: ([String: Any]) -> Bool = { _ in true }) throws -> [String: Any] {
        let url = try plistURL()
        let end = Date().addingTimeInterval(timeoutS)
        var last: [String: Any] = [:]
        repeat {
            last = [:]
            if let data = try? Data(contentsOf: url),
               let p = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] {
                for (k, v) in p {
                    last[k] = (v as? Data).flatMap { try? JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed]) } ?? v
                }
            }
            if ready(last) { return last }
            pause(0.25)
        } while Date() < end
        return last
    }

    /// Edit the stores' plist, with the app terminated: a key renamed, then
    /// keys set, each value a text stored as data, as the app stores its stores.
    func editPlist(rename: (String, String)?, _ values: [String: String] = [:]) throws {
        let url = try plistURL()
        let data = try Data(contentsOf: url)
        var format = PropertyListSerialization.PropertyListFormat.binary
        guard var p = try PropertyListSerialization.propertyList(from: data, format: &format) as? [String: Any] else {
            throw Stop("the stores' plist is not a dictionary")
        }
        if let (from, to) = rename { p[to] = p.removeValue(forKey: from) }
        for (k, v) in values { p[k] = Data(v.utf8) }
        try PropertyListSerialization.data(fromPropertyList: p, format: .binary, options: 0).write(to: url)
    }

    // MARK: - The screen

    /// The element with this identifier, whatever its kind.
    func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    /// The element with this identifier, once it is on the screen.
    func find(_ id: String) throws -> XCUIElement {
        let e = element(id)
        // A wait for what is there already costs a second.
        guard e.exists || e.waitForExistence(timeout: Env.waitS) else { throw Stop("no \(id) on the screen") }
        return e
    }

    /// Tap the element with this identifier, as a finger would, once it is on
    /// the screen and enabled.
    func tap(_ id: String) throws {
        let e = try find(id)
        let end = Date().addingTimeInterval(Env.waitS)
        while !e.isEnabled, Date() < end { pause(0.1) }
        guard e.isEnabled else { throw Stop("\(id) never enabled") }
        if !e.isHittable { try reveal(e) }
        e.tap()
    }

    /// Where the screen shows the page, top and foot, in the window: under
    /// the bar and over the home indicator's 34 pt.
    func screen() -> (top: Double, foot: Double) {
        (app.navigationBars.firstMatch.frame.maxY, app.windows.firstMatch.frame.maxY - 34)
    }

    /// A clause of the sentence pressed, as a finger would: its link, where
    /// it is drawn (SetupSentence's accessibility), brought on screen and
    /// pressed near the start of its last line, which a clause that wraps
    /// begins at the line's start, so the press is on its words.
    func tapClause(_ clause: String) throws {
        let link = app.links.matching(identifier: "eggtimer-clause://\(clause)").firstMatch
        guard link.exists || link.waitForExistence(timeout: Env.waitS) else { throw Stop("no clause \(clause)") }
        try reveal(link)
        link.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 1)).withOffset(CGVector(dx: 8, dy: -8)).tap()
    }

    /// The page scrolled, a swipe at a time, until the element is on the
    /// screen whole, where a finger can reach it: under the bar, and over
    /// the home indicator's 34 pt.
    func reveal(_ e: XCUIElement) throws {
        let (top, screenFoot) = screen()
        // Over the keyboard, when one is up.
        let keyboard = app.keyboards.firstMatch
        let foot = keyboard.exists ? min(screenFoot, keyboard.frame.minY) : screenFoot
        let whole = { () -> Bool in
            guard e.isHittable else { return false }
            let f = e.frame
            return f.minY >= top && f.maxY <= foot
        }
        // A finger drags the page by what is left to show, at most two
        // thirds of the screen at a time, and holds at the end so the page
        // does not run on.
        let window = app.windows.firstMatch
        // On the right, in the page's margin: no control there, and no edge
        // gesture of the system's.
        let x = window.frame.width - 12
        for _ in 0..<12 {
            if whole() { return }
            let f = e.frame
            let room = (foot - top) * 2 / 3
            let by = f.maxY > foot ? -min(f.maxY - foot + 20, room) : min(top - f.minY + 20, room)
            let y = by < 0 ? foot - 20 : top + 20
            let from = window.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y))
            let to = window.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y + by))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        guard whole() else { throw Stop("\(e.identifier) never on the screen whole: \(e.frame)") }
    }

    /// Press the + of a stepper (`<group>.stepper`, `testID`), or its −, as a
    /// finger would: the stepper ends its element, its + the last 47 pt and
    /// its − the 47 before them.
    func press(_ id: String, up: Bool = true) throws {
        let e = try find(id)
        try reveal(e)
        e.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(CGVector(dx: up ? -20 : -70, dy: 0))
            .tap()
    }

    /// Where the element with this identifier is, in the window; nil if it
    /// is not there.
    func frame(_ id: String) -> CGRect? {
        let e = element(id)
        return e.exists ? e.frame : nil
    }

    /// Where the element is once it has stopped moving: read until two reads
    /// a tenth of a second apart agree. A scroll the app animates is not
    /// waited for by a step's `idle`, nor by XCUITest before it reads a frame.
    func stillFrame(_ id: String) -> CGRect? {
        var last = frame(id)
        for _ in 0..<50 {
            pause(0.1)
            let now = frame(id)
            if now == last { return now }
            last = now
        }
        return last
    }

    // MARK: - Checks

    func check(
        _ ok: Bool, _ what: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line
    ) {
        if !ok { XCTFail(what(), file: file, line: line) }
    }

    /// A line the npm script prints beside the scenario's result.
    func note(_ what: String) {
        print("NOTE: \(what)")
    }
}

/// The app's bundle identifier.
let bundleID = "name.danmackinlay.actualeggtimer"

/// Wait `s` of the host's seconds, the run loop turning.
func pause(_ s: Double) {
    RunLoop.current.run(until: Date().addingTimeInterval(s))
}

extension Line {
    /// A line as the app writes it (`Screenshots.log`): `{"t":…,"ev":"<case>"`
    /// and the case's fields, made the `{"<case>":{<fields>}}` that `Codable`
    /// reads.
    init(_ text: String, i: Int) throws {
        let head = "{\"t\":", evKey = ",\"ev\":\""
        guard text.hasPrefix(head), let ev = text.range(of: evKey),
              let t = Double(text[text.index(text.startIndex, offsetBy: head.count)..<ev.lowerBound]),
              let nameEnd = text[ev.upperBound...].firstIndex(of: "\"") else {
            throw Stop("the debug log's line \(i + 1) is not an event: \(text.prefix(200))")
        }
        let name = String(text[ev.upperBound..<nameEnd])
        var fields = text[text.index(after: nameEnd)...].dropLast()
        if fields.hasPrefix(",") { fields = fields.dropFirst() }
        let json = "{\"\(name)\":{\(fields)}}"
        let decoder = JSONDecoder()
        decoder.nonConformingFloatDecodingStrategy = .convertFromString(
            positiveInfinity: "inf", negativeInfinity: "-inf", nan: "nan"
        )
        do {
            event = try decoder.decode(Screenshots.Event.self, from: Data(json.utf8))
        } catch {
            throw Stop("the debug log's line \(i + 1) does not read as an event (\(error)): \(text.prefix(200))")
        }
        self.t = t
        self.ev = name
        self.i = i
    }
}
