import Foundation

/// The twin of `src/core/population.ts`, held to it by `fixtures/prior.json`;
/// the TypeScript's comments say what each part is for. The iOS app bundles
/// `fixtures/population.json`.

/// Where a calibration that has learned nothing solves: the population's
/// centre.
public struct PriorStart: Sendable, Equatable, Codable {
    public var alphaM2s: Double
    public var whiteOffset: Double

    public init(alphaM2s: Double, whiteOffset: Double) {
        self.alphaM2s = alphaM2s
        self.whiteOffset = whiteOffset
    }

    enum CodingKeys: String, CodingKey {
        case alphaM2s = "alpha_m2s", whiteOffset
    }
}

public func priorStart(_ p: Population) -> PriorStart {
    PriorStart(alphaM2s: p.alphaM2s.median, whiteOffset: p.whiteOffset.mean)
}

/// The file's shape, for `JSONDecoder`: where the TypeScript walks the parsed
/// JSON field by field, this decodes the fields it needs and ignores the rest,
/// and `valid` checks what the decoder cannot.
private struct PopulationFile: Decodable {
    struct Diagnostics: Decodable {
        var ok: Bool
        var forced: Bool
    }
    struct Prior: Decodable {
        var alphaM2s: LogNormal
        var logDoseOffset: Normal
        var noise: LogNormal
        var whiteOffset: Normal
        var whiteFirmGap: LogNormal

        enum CodingKeys: String, CodingKey {
            case alphaM2s = "alpha_m2s"
            case logDoseOffset, noise, whiteOffset, whiteFirmGap
        }
    }
    var id: String
    var prior: Prior
    var diagnostics: Diagnostics?
}

private func valid(_ l: LogNormal) -> Bool {
    l.median.isFinite && l.median > 0 && l.logSd.isFinite && l.logSd > 0
}

private func valid(_ n: Normal) -> Bool {
    n.mean.isFinite && n.sd.isFinite && n.sd > 0
}

/// The literature's population is recognised by `Population`'s `Equatable`,
/// where the TypeScript compares it field by field (`isLiterature`).
private func vouched(_ d: PopulationFile.Diagnostics?, _ p: Population) -> Bool {
    guard let d else { return p == literaturePopulation }
    if d.ok { return !d.forced }
    return d.forced && p.id.hasSuffix(forcedIdSuffix)
}

/// Takes the file's bytes, where the TypeScript takes it parsed.
public func parsePopulation(_ data: Data) -> Population? {
    guard let f = try? JSONDecoder().decode(PopulationFile.self, from: data), !f.id.isEmpty else { return nil }
    let p = f.prior
    guard valid(p.alphaM2s), valid(p.logDoseOffset), valid(p.noise),
          valid(p.whiteOffset), valid(p.whiteFirmGap) else { return nil }
    let pop = Population(
        id: f.id, alphaM2s: p.alphaM2s, logDoseOffset: p.logDoseOffset,
        noise: p.noise, whiteOffset: p.whiteOffset, whiteFirmGap: p.whiteFirmGap
    )
    return vouched(f.diagnostics, pop) ? pop : nil
}
