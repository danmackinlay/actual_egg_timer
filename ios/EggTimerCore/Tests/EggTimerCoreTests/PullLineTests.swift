import Testing
import Foundation
import EggTimerCopy

/// Which line the pull alarm and the Lock Screen card give each cooling
/// (`pullLineKey`), and that every such line is in both Englishes' own
/// catalogues - not left to fall back from 1750 to modern English.
@Suite("The pull line names the cooling the cook chose")
struct PullLineTests {
    private static func messages(_ locale: String) -> [String: Message] {
        let url = Fixtures.repoRoot.appendingPathComponent("copy/\(locale).json")
        guard let data = try? Data(contentsOf: url), let catalogue = try? Catalogue(json: data) else {
            fatalError("could not read copy/\(locale).json")
        }
        return catalogue.messages
    }

    @Test("ice, tap, counter, and none")
    func keys() {
        #expect(pullLineKey(cooling: "ice") == "alarm.pull.bodyIce")
        #expect(pullLineKey(cooling: "tap") == "alarm.pull.bodyTap")
        #expect(pullLineKey(cooling: "counter") == "alarm.pull.bodyCounter")
        // An activity begun before the cooling was carried was an ice bath's.
        #expect(pullLineKey(cooling: nil) == "alarm.pull.bodyIce")
    }

    @Test("each line is in both catalogues")
    func inBothCatalogues() {
        let keys = Set([nil, "ice", "tap", "counter"].map { pullLineKey(cooling: $0) })
        for locale in ["en", "en-x-1750"] {
            let own = Self.messages(locale)
            for key in keys {
                #expect(own[key] != nil, "copy/\(locale).json has no \(key)")
            }
        }
    }
}
