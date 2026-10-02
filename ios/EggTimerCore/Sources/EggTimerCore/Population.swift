import Foundation

/// The population a cook's prior is drawn from (E7; INFERENCE.md section 9).
/// Transliterated from `src/core/population.ts`, and held to it by
/// `fixtures/prior.json`.
///
/// `fixtures/population.json` is what both apps draw a new cook's prior from;
/// the iOS app bundles it. Every field read here is checked, and anything else
/// in the file is the fit's own record and ignored. Before any egg the app
/// solves at the population's centre (`PriorStart`), which for the literature
/// is exactly the literature's values.

/// Where a calibration that has learned nothing solves: the population's
/// centre.
public struct PriorStart: Sendable, Equatable {
    public var alphaM2s: Double
    public var tauAirScale: Double
    /// The white's runny | tender cutpoint, decades of white dose above
    /// `whiteDoseTarget`.
    public var whiteOffset: Double

    public init(alphaM2s: Double, tauAirScale: Double, whiteOffset: Double) {
        self.alphaM2s = alphaM2s
        self.tauAirScale = tauAirScale
        self.whiteOffset = whiteOffset
    }
}

public func priorStart(_ p: Population) -> PriorStart {
    PriorStart(alphaM2s: p.alphaM2s.median, tauAirScale: p.tauAirScale.median, whiteOffset: p.whiteOffset.mean)
}

/// The literature's start: the literature's values exactly.
public let literatureStart = priorStart(literaturePopulation)

/// The file's shape: an id, and the six spreads under `prior`.
private struct PopulationFile: Decodable {
    struct Prior: Decodable {
        var alphaM2s: LogNormal
        var logDoseOffset: Normal
        var tauAirScale: LogNormal
        var noise: LogNormal
        var whiteOffset: Normal
        var whiteFirmGap: LogNormal

        enum CodingKeys: String, CodingKey {
            case alphaM2s = "alpha_m2s"
            case logDoseOffset, tauAirScale, noise, whiteOffset, whiteFirmGap
        }
    }
    var id: String
    var prior: Prior
}

private func valid(_ l: LogNormal) -> Bool {
    l.median.isFinite && l.median > 0 && l.logSd.isFinite && l.logSd > 0
}

private func valid(_ n: Normal) -> Bool {
    n.mean.isFinite && n.sd.isFinite && n.sd > 0
}

/// A population read from its file, or nil if any part of it cannot be
/// trusted: `parsePopulation`'s rules. A spread of zero is refused - every
/// particle would be the same, and nothing could move it.
public func parsePopulation(_ data: Data) -> Population? {
    guard let f = try? JSONDecoder().decode(PopulationFile.self, from: data), !f.id.isEmpty else { return nil }
    let p = f.prior
    guard valid(p.alphaM2s), valid(p.logDoseOffset), valid(p.tauAirScale), valid(p.noise),
          valid(p.whiteOffset), valid(p.whiteFirmGap) else { return nil }
    return Population(
        id: f.id, alphaM2s: p.alphaM2s, logDoseOffset: p.logDoseOffset, tauAirScale: p.tauAirScale,
        noise: p.noise, whiteOffset: p.whiteOffset, whiteFirmGap: p.whiteFirmGap
    )
}
