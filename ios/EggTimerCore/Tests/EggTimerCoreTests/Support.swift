import Testing
import Foundation
@testable import EggTimerCore

/// How close two numbers must be for the two implementations to agree.
///
/// Relative and tight: 1e-12 is a few ulps of a double, which is all that
/// differing libm implementations of exp/sin/log10 can cost. An algebraic
/// mistake is never that small. Every suite holds to it, whole cooks included
/// (see ScenarioTests.swift for the headroom there).
let conformanceTolerance = 1e-12

/// The one comparison every conformance suite makes: relative to the expected
/// value, or absolute below 1.
func expectClose(
    _ actual: Double, _ expected: Double, _ what: String,
    tolerance: Double = conformanceTolerance, sourceLocation: SourceLocation = #_sourceLocation
) {
    let scale = max(abs(expected), 1.0)
    let error = abs(actual - expected) / scale
    #expect(
        error <= tolerance,
        "\(what): expected \(expected), got \(actual) (relative error \(error))",
        sourceLocation: sourceLocation
    )
}
