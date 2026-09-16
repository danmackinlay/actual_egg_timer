// swift-tools-version: 6.0
import PackageDescription

// The physics, and nothing else: no SwiftUI, no Foundation beyond the maths,
// no I/O. The same restriction src/core/ lives under, for the same reason -
// it can be tested headlessly and reasoned about without a simulator.
let package = Package(
    name: "EggTimerCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "EggTimerCore", targets: ["EggTimerCore"])
    ],
    targets: [
        .target(name: "EggTimerCore"),
        .testTarget(name: "EggTimerCoreTests", dependencies: ["EggTimerCore"])
    ]
)
