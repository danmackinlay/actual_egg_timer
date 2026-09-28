// swift-tools-version: 6.0
import PackageDescription

// The physics, and nothing else: no SwiftUI, no Foundation beyond the maths,
// no I/O. The same restriction src/core/ lives under, for the same reason -
// it can be tested headlessly and reasoned about without a simulator.
//
// The words are a second, smaller library in the same package. EggTimerCopy is
// the catalogue renderer (src/core/copy.ts on the web), and it is separate only
// so that the widget extension can link it without linking the physics.
//
// EggTimerRing is the app's one decision that is not a transliteration: when it
// must sound an alarm itself because no notification will. It is here, and not
// in the app, so `swift test` covers it; it is its own target so the physics
// stays only the physics.
let package = Package(
    name: "EggTimerCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "EggTimerCore", targets: ["EggTimerCore"]),
        .library(name: "EggTimerCopy", targets: ["EggTimerCopy"]),
        .library(name: "EggTimerRing", targets: ["EggTimerRing"])
    ],
    targets: [
        // Optimised in every configuration. The physics is a hot numeric loop,
        // and at -Onone an odds profile takes 20 s instead of 0.4 s, so a Debug
        // build run from Xcode on a phone leaves the track, the bracket and the
        // play-safe line blank for most of a minute after every change.
        .target(
            name: "EggTimerCore", dependencies: ["EggTimerCopy"],
            swiftSettings: [.unsafeFlags(["-O"], .when(configuration: .debug))]
        ),
        .target(name: "EggTimerCopy"),
        .target(name: "EggTimerRing", dependencies: ["EggTimerCore"]),
        .testTarget(name: "EggTimerCoreTests", dependencies: ["EggTimerCore", "EggTimerCopy"]),
        .testTarget(name: "EggTimerRingTests", dependencies: ["EggTimerRing", "EggTimerCore"])
    ]
)
