import Testing
import Foundation
import EggTimerCopy

/// Which line the pull alarm and the Lock Screen card give each cooling
/// (`pullLineKey`), and that every such line is in both Englishes' own
/// catalogues - not left to fall back from 1750 to modern English.
@Suite("The pull line names the cooling the cook chose")
struct PullLineTests {
    @Test("ice, tap, counter, and none")
    func keys() {
        #expect(pullLineKey(cooling: "ice") == "alarm.pull.bodyIce")
        #expect(pullLineKey(cooling: "tap") == "alarm.pull.bodyTap")
        #expect(pullLineKey(cooling: "counter") == "alarm.pull.bodyCounter")
        // An activity begun before the cooling was carried was an ice bath's.
        #expect(pullLineKey(cooling: nil) == "alarm.pull.bodyIce")
    }

    @Test("each line is in both catalogues")
    func inBothCatalogues() throws {
        let keys = Set([nil, "ice", "tap", "counter"].map { pullLineKey(cooling: $0) })
        for locale in ["en", "en-x-1750"] {
            // No fallback: each line must be in the catalogue's own messages.
            let own = try Fixtures.catalogue(locale).messages
            for key in keys {
                #expect(own[key] != nil, "copy/\(locale).json has no \(key)")
            }
        }
    }
}
