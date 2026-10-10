import Testing
import Foundation
import EggTimerCopy

/// Which line the pull alarm and the Lock Screen card give each cooling
/// (`pullLineKey`), and that every such line is in both Englishes' own
/// catalogues - not left to fall back from 1750 to modern English.
@Suite("The pull line names the cooling the cook chose")
struct PullLineTests {
    @Test("each cooling's own line, named for it, is in both catalogues")
    func inBothCatalogues() throws {
        let coolings = ["ice", "tap", "counter"]
        for cooling in coolings {
            let key = pullLineKey(cooling: cooling)
            #expect(key.lowercased().hasSuffix(cooling), "\(cooling) gets \(key)")
        }
        let keys = Set(coolings.map { pullLineKey(cooling: $0) })
        for locale in ["en", "en-x-1750"] {
            // No fallback: each line must be in the catalogue's own messages.
            let own = try Fixtures.catalogue(locale).messages
            for key in keys {
                #expect(own[key] != nil, "copy/\(locale).json has no \(key)")
            }
        }
    }
}
