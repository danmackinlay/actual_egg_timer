import Foundation

/// Loader for the golden fixtures in `fixtures/`, which are generated from the
/// TypeScript implementation by `npm run fixtures`.
///
/// The fixtures are read from the repository rather than copied into the test
/// bundle on purpose. One copy, one source of truth, and a stale fixture is
/// impossible: regenerate in the repo and the Swift tests see it immediately.
enum Fixtures {
    /// Walk up from this file until the fixtures directory appears. Works for
    /// `swift test` and for Xcode, neither of which agrees about the cwd.
    static let repoRoot: URL = {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            if FileManager.default.fileExists(atPath: dir.appendingPathComponent("fixtures/core.json").path) {
                return dir
            }
            dir = dir.deletingLastPathComponent()
        }
        fatalError("fixtures/core.json not found above \(#filePath) - run `npm run fixtures`")
    }()

    /// Parsed fresh on each call rather than cached in a static. A 35 kB JSON
    /// parse costs less than the concurrency argument a shared `[String: Any]`
    /// would start with Swift 6, and these run a handful of times per suite.
    static func load(_ name: String) -> [String: Any] {
        let url = repoRoot.appendingPathComponent("fixtures/\(name)")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else {
            fatalError("could not read fixtures/\(name) - run `npm run fixtures`")
        }
        return dictionary
    }

    /// A section of the file, as a list of cases.
    static func cases(_ group: String, _ key: String) -> [[String: Any]] {
        guard let section = load("core.json")[group] as? [String: Any],
              let list = section[key] as? [[String: Any]] else {
            fatalError("fixtures/core.json has no \(group).\(key)")
        }
        return list
    }

    /// A section of `policy.json`, as a list of cases.
    static func policyCases(_ path: String) -> [[String: Any]] {
        var node: Any = load("policy.json")
        for key in path.split(separator: ".") {
            guard let dictionary = node as? [String: Any], let next = dictionary[String(key)] else {
                fatalError("fixtures/policy.json has no \(path)")
            }
            node = next
        }
        guard let list = node as? [[String: Any]] else {
            fatalError("fixtures/policy.json \(path) is not a list")
        }
        return list
    }

    /// A dictionary node of `policy.json`.
    static func policyObject(_ path: String) -> [String: Any] {
        var node: Any = load("policy.json")
        for key in path.split(separator: ".") {
            guard let dictionary = node as? [String: Any], let next = dictionary[String(key)] else {
                fatalError("fixtures/policy.json has no \(path)")
            }
            node = next
        }
        guard let dictionary = node as? [String: Any] else {
            fatalError("fixtures/policy.json \(path) is not an object")
        }
        return dictionary
    }

    static func constant(_ name: String) -> Double {
        guard let constants = load("core.json")["constants"] as? [String: Any],
              let value = constants[name] as? NSNumber else {
            fatalError("fixtures/core.json has no constant \(name)")
        }
        return value.doubleValue
    }
}

extension Dictionary where Key == String, Value == Any {
    /// A number from a fixture case. Fixtures are machine-written, so a missing
    /// key is a bug in the generator rather than a condition to handle.
    func num(_ key: String) -> Double {
        guard let value = self[key] as? NSNumber else {
            fatalError("fixture case has no numeric \(key): \(self)")
        }
        return value.doubleValue
    }

    /// A string from a fixture case.
    func str(_ key: String) -> String {
        guard let value = self[key] as? String else {
            fatalError("fixture case has no string \(key): \(self)")
        }
        return value
    }

    /// A bool from a fixture case.
    func flag(_ key: String) -> Bool {
        guard let value = self[key] as? Bool else {
            fatalError("fixture case has no bool \(key): \(self)")
        }
        return value
    }

    /// A number that the generator may have written as null.
    func optionalNum(_ key: String) -> Double? {
        guard let value = self[key], !(value is NSNull) else { return nil }
        guard let number = value as? NSNumber else {
            fatalError("fixture case has a non-numeric \(key): \(self)")
        }
        return number.doubleValue
    }
}
