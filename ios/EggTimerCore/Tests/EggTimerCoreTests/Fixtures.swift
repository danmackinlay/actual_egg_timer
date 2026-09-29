import Foundation
import EggTimerCopy

/// A fixture that is not shaped as a test expects: a missing file, key or
/// case, or a value of the wrong kind. Thrown rather than trapped, so a fixture
/// the port cannot read fails the one test that read it and the rest still run.
struct FixtureError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// Loader for the golden fixtures in `fixtures/`, which are generated from the
/// TypeScript implementation by `npm run fixtures`.
///
/// The fixtures are read from the repository rather than copied into the test
/// bundle on purpose. One copy, one source of truth, and a stale fixture is
/// impossible: regenerate in the repo and the Swift tests see it immediately.
enum Fixtures {
    /// Walk up from this file until the fixtures directory appears. Works for
    /// `swift test` and for Xcode, neither of which agrees about the cwd.
    ///
    /// The one trap left: with no fixtures directory at all there is nothing
    /// for any test to fail on its own.
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

    /// Parsed fresh on each call rather than cached in a static. Even the
    /// largest fixture, a few hundred kB, parses for less than the concurrency
    /// argument a shared `[String: Any]` would start with Swift 6.
    static func load(_ name: String) throws -> [String: Any] {
        let url = repoRoot.appendingPathComponent("fixtures/\(name)")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else {
            throw FixtureError("could not read fixtures/\(name) - run `npm run fixtures`")
        }
        guard let resolved = try resolveShared(dictionary, root: dictionary, file: name) as? [String: Any] else {
            throw FixtureError("fixtures/\(name) is not an object")
        }
        return resolved
    }

    /// The generator writes a particle set that repeats an earlier one in the
    /// same file as `{ "sameAs": "<dotted path>" }` (tools/fixtures.ts); here
    /// it becomes the set it names, so no reader sees the difference.
    private static func resolveShared(_ node: Any, root: [String: Any], file: String) throws -> Any {
        if let list = node as? [Any] {
            return try list.map { try resolveShared($0, root: root, file: file) }
        }
        guard let dictionary = node as? [String: Any] else { return node }
        if dictionary.count == 1, let path = dictionary["sameAs"] as? String {
            var target: Any = root
            for key in path.split(separator: ".") {
                if let list = target as? [Any], let i = Int(key), list.indices.contains(i) {
                    target = list[i]
                } else if let object = target as? [String: Any], let next = object[String(key)] {
                    target = next
                } else {
                    throw FixtureError("fixtures/\(file): sameAs \(path) names nothing")
                }
            }
            return target
        }
        return try dictionary.mapValues { try resolveShared($0, root: root, file: file) }
    }

    /// A shipped catalogue, read from `copy/` in the repository as the fixtures
    /// are, so the one the app bundles is the one tested.
    static func catalogue(_ locale: String, fallback: Catalogue? = nil) throws -> Catalogue {
        let url = repoRoot.appendingPathComponent("copy/\(locale).json")
        return try Catalogue(json: Data(contentsOf: url), fallback: fallback)
    }

    /// Walk a dotted path into one fixture file. The path-walking is shared
    /// rather than written once per file, because its only job is to say which
    /// key was missing.
    static func node(_ file: String, _ path: String) throws -> Any {
        var node: Any = try load(file)
        for key in path.split(separator: ".") {
            guard let dictionary = node as? [String: Any], let next = dictionary[String(key)] else {
                throw FixtureError("fixtures/\(file) has no \(path)")
            }
            node = next
        }
        return node
    }

    /// A list of cases. Never empty: a loop over an empty list passes having
    /// checked nothing.
    static func list(_ file: String, _ path: String) throws -> [[String: Any]] {
        guard let list = try node(file, path) as? [[String: Any]] else {
            throw FixtureError("fixtures/\(file) \(path) is not a list")
        }
        guard !list.isEmpty else { throw FixtureError("fixtures/\(file) \(path) is empty") }
        return list
    }

    static func object(_ file: String, _ path: String) throws -> [String: Any] {
        guard let dictionary = try node(file, path) as? [String: Any] else {
            throw FixtureError("fixtures/\(file) \(path) is not an object")
        }
        return dictionary
    }

    /// A section of `core.json`, as a list of cases.
    static func cases(_ group: String, _ key: String) throws -> [[String: Any]] {
        try list("core.json", "\(group).\(key)")
    }

    /// A section of `policy.json`, as a list of cases.
    static func policyCases(_ path: String) throws -> [[String: Any]] {
        try list("policy.json", path)
    }

    /// A dictionary node of `policy.json`.
    static func policyObject(_ path: String) throws -> [String: Any] {
        try object("policy.json", path)
    }

    /// A section of `sousvide.json`, as a list of cases.
    static func sousVideCases(_ path: String) throws -> [[String: Any]] {
        try list("sousvide.json", path)
    }

    /// A scalar at the top level of `sousvide.json`.
    static func sousVideNumber(_ path: String) throws -> Double {
        guard let value = try node("sousvide.json", path) as? NSNumber else {
            throw FixtureError("fixtures/sousvide.json \(path) is not a number")
        }
        return value.doubleValue
    }

    /// A list from `sousvideCopy.json`.
    static func sousVideCopyCases(_ key: String) throws -> [[String: Any]] {
        try list("sousvideCopy.json", key)
    }

    static func constant(_ name: String) throws -> Double {
        try object("core.json", "constants").num(name)
    }
}

/// Reading one fixture case. Fixtures are machine-written, so a missing key is
/// a bug in the generator rather than a condition to handle - but it fails the
/// test that met it, not the run.
extension Dictionary where Key == String, Value == Any {
    /// A number from a fixture case.
    func num(_ key: String) throws -> Double {
        guard let value = self[key] as? NSNumber else {
            throw FixtureError("fixture case has no numeric \(key): \(self)")
        }
        return value.doubleValue
    }

    /// A string from a fixture case.
    func str(_ key: String) throws -> String {
        guard let value = self[key] as? String else {
            throw FixtureError("fixture case has no string \(key): \(self)")
        }
        return value
    }

    /// A bool from a fixture case.
    func flag(_ key: String) throws -> Bool {
        guard let value = self[key] as? Bool else {
            throw FixtureError("fixture case has no bool \(key): \(self)")
        }
        return value
    }

    /// A number that the generator may have written as null.
    func optionalNum(_ key: String) throws -> Double? {
        guard let value = self[key], !(value is NSNull) else { return nil }
        guard let number = value as? NSNumber else {
            throw FixtureError("fixture case has a non-numeric \(key): \(self)")
        }
        return number.doubleValue
    }

    /// A string that the generator may have written as null.
    func optionalStr(_ key: String) throws -> String? {
        guard let value = self[key], !(value is NSNull) else { return nil }
        guard let string = value as? String else {
            throw FixtureError("fixture case has a non-string \(key): \(self)")
        }
        return string
    }

    /// One of an enum's cases, by its raw string. An unknown string fails
    /// rather than quietly reading as some default.
    func value<T: RawRepresentable>(_ type: T.Type, _ key: String) throws -> T where T.RawValue == String {
        let raw = try str(key)
        guard let value = T(rawValue: raw) else {
            throw FixtureError("fixture case has an unknown \(T.self) \(raw) at \(key)")
        }
        return value
    }

    /// One of an enum's cases, or nil where the generator wrote null or left
    /// the key out. An unknown string still fails.
    func optionalValue<T: RawRepresentable>(_ type: T.Type, _ key: String) throws -> T? where T.RawValue == String {
        guard let raw = try optionalStr(key) else { return nil }
        guard let value = T(rawValue: raw) else {
            throw FixtureError("fixture case has an unknown \(T.self) \(raw) at \(key)")
        }
        return value
    }

    /// A nested object.
    func object(_ key: String) throws -> [String: Any] {
        guard let value = self[key] as? [String: Any] else {
            throw FixtureError("fixture case has no object \(key)")
        }
        return value
    }

    /// A nested list of rows. Empty fails, as `Fixtures.list` does, unless the
    /// caller says the fixture may carry none - and says, where it does, what
    /// stops its loop passing vacuously.
    func rows(_ key: String, mayBeEmpty: Bool = false) throws -> [[String: Any]] {
        guard let value = self[key] as? [[String: Any]] else {
            throw FixtureError("fixture case has no rows \(key)")
        }
        guard mayBeEmpty || !value.isEmpty else { throw FixtureError("fixture case has no \(key): an empty list") }
        return value
    }

    /// A nested list of numbers. Never empty, for the same reason.
    func numbers(_ key: String) throws -> [Double] {
        guard let value = self[key] as? [NSNumber] else {
            throw FixtureError("fixture case has no numeric array \(key)")
        }
        guard !value.isEmpty else { throw FixtureError("fixture case has no \(key): an empty list") }
        return value.map(\.doubleValue)
    }
}
