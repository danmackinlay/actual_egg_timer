/// Which build may write: the newest that has run (DECISIONS.md 100).
///
/// Transliterated from `src/core/newer.ts`, and held to it by
/// `fixtures/newer.json`. An older build can damage what a newer one stored,
/// because it writes the settings, the pans, the sharing state, the cook in
/// progress and the store around the log whole, from the fields it knows. So
/// the app keeps one mark, the newest version that has run on the phone, and
/// a build that finds a newer version there writes nothing for the rest of
/// the session: it times the egg and leaves the stores alone.
///
/// The ordering is semantic versioning's: major.minor.patch as integers,
/// then a version with a pre-release below the same version without one, and
/// two pre-releases identifier by identifier (numbers as numbers, below any
/// word; a shorter list below a longer one it begins). The app marks with
/// its `MARKETING_VERSION`, which is package.json's version without the
/// pre-release (`0.4.0` for `0.4.0-alpha.1`), so on iOS every alpha of one
/// version is one version to the guard. The web keeps its own mark, with its
/// own form of the number; the two never meet.
///
/// The mark's format is fixed for good: a version string or nothing. No I/O.

public struct Version: Sendable, Equatable {
    public let major: Int
    public let minor: Int
    public let patch: Int
    /// The pre-release's identifiers, in order; empty for a release.
    public let pre: [String]

    public init(major: Int, minor: Int, patch: Int, pre: [String]) {
        self.major = major
        self.minor = minor
        self.patch = patch
        self.pre = pre
    }
}

/// What a build does with the stores for the session.
public enum WriterVerdict: String, Sendable {
    case write
    case readOnly
}

private func isDigits<S: StringProtocol>(_ s: S) -> Bool {
    !s.isEmpty && s.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 }
}

/// Digits with no leading zero: a number as semantic versioning writes one.
private func isNumeric<S: StringProtocol>(_ s: S) -> Bool {
    isDigits(s) && (s.count == 1 || !s.hasPrefix("0"))
}

private func isIdentifier<S: StringProtocol>(_ s: S) -> Bool {
    !s.isEmpty && s.unicodeScalars.allSatisfy {
        ($0.value >= 48 && $0.value <= 57) || ($0.value >= 65 && $0.value <= 90)
            || ($0.value >= 97 && $0.value <= 122) || $0.value == 45
    }
}

/// A version as semantic versioning writes one, without build metadata, or
/// nil for anything else.
public func parseVersion(_ text: String) -> Version? {
    let main: Substring
    var pre: [String] = []
    if let dash = text.firstIndex(of: "-") {
        main = text[..<dash]
        let rest = text[text.index(after: dash)...]
        let parts = rest.split(separator: ".", omittingEmptySubsequences: false)
        for part in parts {
            guard isIdentifier(part) else { return nil }
            if isDigits(part) && !isNumeric(part) { return nil }
            pre.append(String(part))
        }
    } else {
        main = text[...]
    }
    let triple = main.split(separator: ".", omittingEmptySubsequences: false)
    guard triple.count == 3, triple.allSatisfy({ isNumeric($0) }),
          let major = Int(triple[0]), let minor = Int(triple[1]), let patch = Int(triple[2]),
          major <= 9_007_199_254_740_991, minor <= 9_007_199_254_740_991, patch <= 9_007_199_254_740_991
    else { return nil }
    return Version(major: major, minor: minor, patch: patch, pre: pre)
}

private func sign(_ a: Int, _ b: Int) -> Int {
    a < b ? -1 : a > b ? 1 : 0
}

/// Code-unit order, as JavaScript compares two strings; every identifier is
/// ASCII, so code units and scalars agree.
private func lexical(_ a: String, _ b: String) -> Int {
    let x = Array(a.utf8)
    let y = Array(b.utf8)
    for i in 0..<min(x.count, y.count) where x[i] != y[i] {
        return x[i] < y[i] ? -1 : 1
    }
    return sign(x.count, y.count)
}

/// One pre-release identifier against another: numbers as numbers, and
/// below any word; words by their characters' codes.
private func compareIdentifier(_ a: String, _ b: String) -> Int {
    let an = isNumeric(a)
    let bn = isNumeric(b)
    if an && bn {
        if a.count != b.count { return sign(a.count, b.count) }
        return lexical(a, b)
    }
    if an { return -1 }
    if bn { return 1 }
    return lexical(a, b)
}

/// -1, 0 or 1 as `a` is older than, the same as or newer than `b`; nil when
/// either is not a version.
public func compareVersions(_ a: String, _ b: String) -> Int? {
    guard let va = parseVersion(a), let vb = parseVersion(b) else { return nil }
    let core = sign(va.major, vb.major) != 0 ? sign(va.major, vb.major)
        : sign(va.minor, vb.minor) != 0 ? sign(va.minor, vb.minor)
        : sign(va.patch, vb.patch)
    if core != 0 { return core }
    if va.pre.isEmpty || vb.pre.isEmpty { return sign(vb.pre.count, va.pre.count) }
    for i in 0..<min(va.pre.count, vb.pre.count) {
        let c = compareIdentifier(va.pre[i], vb.pre[i])
        if c != 0 { return c }
    }
    return sign(va.pre.count, vb.pre.count)
}

/// What this build, `mine`, does with the stores, given the mark it found:
/// `.write` when there is no mark, or the mark is not newer than this build
/// (the app then writes `mine` as the mark before anything else); `.readOnly`
/// when a newer build has run here, or this build cannot place itself.
public func writerCheck(_ storedMark: String?, _ mine: String) -> WriterVerdict {
    guard let storedMark, parseVersion(storedMark) != nil else { return .write }
    guard let c = compareVersions(storedMark, mine) else { return .readOnly }
    return c > 0 ? .readOnly : .write
}
