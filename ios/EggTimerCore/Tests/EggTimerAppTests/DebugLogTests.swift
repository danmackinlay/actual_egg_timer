import Foundation
import Testing
@testable import EggTimerApp

/// The debug log the scripted checks read (`tools/iosE2e.ts`): lines written
/// from many threads at once each land whole, none lost and none cut into.
struct DebugLogTests {
    @Test func linesFromManyThreadsLandWhole() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("aet-log-\(UUID().uuidString).log")
        defer { try? FileManager.default.removeItem(at: url) }
        // Lines of different lengths, so one written over another's start
        // would leave a piece of the longer.
        let lines = (0..<2000).map { i in
            "{\"i\":\(i),\"pad\":\"\(String(repeating: "x", count: (i * 37) % 300))\"}\n"
        }
        DispatchQueue.concurrentPerform(iterations: lines.count) { i in
            DebugLog.append(Data(lines[i].utf8), to: url)
        }
        let read = try String(contentsOf: url, encoding: .utf8).split(separator: "\n").map { "\($0)\n" }
        #expect(read.count == lines.count)
        #expect(Set(read) == Set(lines))
    }
}
