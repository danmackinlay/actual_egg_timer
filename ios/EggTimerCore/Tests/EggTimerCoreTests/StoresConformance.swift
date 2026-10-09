import Testing
import Foundation
@testable import EggTimerCore

/// Conformance against `fixtures/stores.json`, generated from
/// `src/core/stores.ts`: the two apps keep each store under the key and in
/// the format the one table says.

@Suite("The stores are the reference implementation's")
struct StoresConformance {
    @Test("the table: every store's name, format and keys, in order")
    func table() throws {
        let rows = try Fixtures.list("stores.json", "stores")
        #expect(rows.count == StoreRegistry.all.count)
        for (row, store) in zip(rows, StoreRegistry.all) {
            #expect(try store.name == row.str("name"))
            #expect(store.format == (row["format"] as? NSNumber).map { $0.intValue }, "\(store.name)")
            #expect(store.web == row["web"] as? String, "\(store.name)")
            #expect(store.ios == row["ios"] as? String, "\(store.name)")
        }
    }

    @Test("a stored value reads as in a store's format, or not, alike")
    func formats() throws {
        for c in try Fixtures.list("stores.json", "inFormat") {
            let name = try c.str("store")
            let store = try #require(StoreRegistry.all.first { $0.name == name })
            let read = try #require(c["read"] as? Bool)
            let about = try c.str("about")
            #expect((inFormat(store, c["raw"]) != nil) == read, "\(name): \(about)")
        }
    }

    @Test("what is stamped reads back in its format")
    func stampedReadsBack() throws {
        let data = try JSONSerialization.data(withJSONObject: stamped(StoreRegistry.cook, ["answers": "none"]))
        let raw = try JSONSerialization.jsonObject(with: data)
        #expect(inFormat(StoreRegistry.cook, raw)?["answers"] as? String == "none")
        #expect(inFormat(StoreRegistry.settings, raw) == nil)
    }
}
