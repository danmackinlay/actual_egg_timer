import Testing
@testable import EggTimerApp

/// Which build may write (Newer.swift): the order of versions and of build
/// numbers, and the verdict on the mark and build a launch finds. What the
/// app does with the verdict, writing nothing under a newer mark, is
/// AppTests' (`aNewerMarkWritesNothing`).
@Suite("Which build may write")
struct NewerTests {
    @Test func versionsOrderAsSemanticVersioningOrdersThem() {
        let ascending = [
            "0.3.0", "0.4.0-1", "0.4.0-alpha", "0.4.0-alpha.1", "0.4.0-alpha.2", "0.4.0-alpha.10",
            "0.4.0-alpha.beta", "0.4.0-beta", "0.4.0", "0.4.1", "0.5.0-alpha.1", "0.5.0", "0.10.0", "1.0.0", "10.0.0",
        ]
        for (i, a) in ascending.enumerated() {
            for (j, b) in ascending.enumerated() {
                #expect(compareVersions(a, b) == (i < j ? -1 : i > j ? 1 : 0), "\(a) against \(b)")
            }
        }
        #expect(parseVersion("0.4.0-alpha.1") == Version(major: 0, minor: 4, patch: 0, pre: ["alpha", "1"]))
    }

    @Test func whatIsNotAVersionIsNotCompared() {
        for text in ["", "unknown", "0.4", "0.4.0.1", "v0.4.0", "00.4.0", "0.4.0-", "0.4.0-alpha.01", "0.4.0+2", " 0.4.0"] {
            #expect(parseVersion(text) == nil, "\(text)")
            #expect(compareVersions(text, "0.4.0") == nil, "\(text)")
        }
    }

    @Test func buildNumbersOrderAsApplesDo() {
        let rows: [(String, String, Int?)] = [
            ("10", "9", 1), ("2", "10", -1), ("3", "3", 0), ("3", "3.0", 0), ("3.0.0", "3", 0), ("3.1", "3.0.9", 1),
            ("3.0.1", "3.1", -1), ("03", "3", nil), ("3.", "3", nil), ("1.2.3.4", "1", nil), ("x", "1", nil),
            ("+3", "3", nil), ("", "1", nil),
        ]
        for (a, b, want) in rows { #expect(compareBuilds(a, b) == want, "build \(a) against \(b)") }
    }

    /// The mark as a launch finds it, and the verdict: a newer version, or a
    /// later build of this version, makes the build read-only; none, an
    /// older one or its own lets it write.
    @Test func theVerdictOnTheMarkAndItsBuild() {
        let rows: [(mark: String?, build: String?, mine: String, myBuild: String, want: WriterVerdict)] = [
            (nil, nil, "0.5.0", "3", .write),
            ("0.4.0", nil, "0.5.0", "3", .write),
            ("0.5.0", nil, "0.5.0", "3", .write),
            ("0.6.0", nil, "0.5.0", "3", .readOnly),
            ("0.5.0-alpha.1", nil, "0.5.0", "3", .write),
            // A later build of this version is newer; an earlier one, or this
            // one, is not.
            ("0.5.0", "4", "0.5.0", "3", .readOnly),
            ("0.5.0", "3.1", "0.5.0", "3", .readOnly),
            ("0.5.0", "3", "0.5.0", "3", .write),
            ("0.5.0", "2", "0.5.0", "3", .write),
            // Another version decides alone, whatever its build.
            ("0.4.0", "9", "0.5.0", "3", .write),
            ("0.6.0", "1", "0.5.0", "3", .readOnly),
            // A mark or build no build writes is written over; a build that
            // cannot place itself writes over no version, nor over a build
            // of its own version.
            ("garbage", nil, "0.5.0", "3", .write),
            ("", "4", "0.5.0", "3", .write),
            ("0.5.0", "x", "0.5.0", "3", .write),
            ("0.3.0", nil, "unknown", "3", .readOnly),
            (nil, nil, "unknown", "3", .write),
            ("0.5.0", "2", "0.5.0", "", .readOnly),
        ]
        for r in rows {
            #expect(
                writerCheckBuilt(r.mark, r.build, r.mine, r.myBuild) == r.want,
                "\(r.mark ?? "no mark") build \(r.build ?? "none") against \(r.mine) build \(r.myBuild)"
            )
        }
    }
}
