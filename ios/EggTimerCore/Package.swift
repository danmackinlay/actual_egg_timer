// swift-tools-version: 6.0
import PackageDescription

// The physics, and nothing else: no SwiftUI, no Foundation beyond the maths,
// no I/O. The same restriction src/core/ lives under, for the same reason -
// it can be tested headlessly and reasoned about without a simulator.
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
        .target(name: "EggTimerCore", dependencies: ["EggTimerCopy"]),
        .target(name: "EggTimerCopy"),
        .testTarget(name: "EggTimerCoreTests", dependencies: ["EggTimerCore", "EggTimerCopy"])
    ]
)
