// swift-tools-version: 6.0
import PackageDescription

// The logic both apps must agree on - the physics, the inference, the policy
// above them - and the one decision only this app makes, when to ring for a
// deadline no notification holds (`deadlineToRing`, beside `phaseAt`). No
// SwiftUI, no Foundation beyond the maths, no I/O. The same restriction
// src/core/ lives under, for the same reason - it can be tested headlessly and
// reasoned about without a simulator.
//
// The words are a second, smaller library in the same package. EggTimerCopy is
// the catalogue renderer (src/core/copy.ts on the web), and it is separate only
// so that the widget extension can link it without linking the physics.
let package = Package(
    name: "EggTimerCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "EggTimerCore", targets: ["EggTimerCore"]),
        .library(name: "EggTimerCopy", targets: ["EggTimerCopy"])
    ],
    targets: [
        // Optimised in every configuration. The physics is a hot numeric loop,
        // and at -Onone an odds profile takes 20 s instead of 0.4 s, so a Debug
        // build run from Xcode on a phone leaves the slider's shading and reach
        // unset for most of a minute after every change.
        //
        // An unsafe flag, and acceptable only because this package is a local
        // path dependency of the app: SwiftPM refuses unsafe flags in a
        // dependency resolved by version. It has costs. A Debug build cannot step
        // through the core or read its locals, and `swift test` never runs the
        // core unoptimised, so a bug that only -Onone would show goes unseen.
        .target(
            name: "EggTimerCore", dependencies: ["EggTimerCopy"],
            swiftSettings: [.unsafeFlags(["-O"], .when(configuration: .debug))]
        ),
        .target(name: "EggTimerCopy"),
        .testTarget(name: "EggTimerCoreTests", dependencies: ["EggTimerCore", "EggTimerCopy"])
    ]
)
