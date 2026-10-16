import Foundation
import EggTimerCopy

/// The twin of `src/core/texture.ts`, held to it by `fixtures/texture.json`;
/// the TypeScript's comments say what each part is for. Its string unions are
/// enums here, their raw values the TypeScript's spellings.

public enum WhiteBand: String, Sendable, Codable {
    case runny
    case justSet
    case set
    case firm
}

public enum YolkBand: String, Sendable, Codable {
    case liquid
    case soft
    case jammy
    case fudgy
    case set
}

public struct Texture: Sendable, Equatable, Codable {
    public let white: WhiteBand
    public let yolk: YolkBand
}

public func textureFor(peakYolkC: Double, peakWhiteC: Double, whiteSets: Bool) -> Texture {
    let white: WhiteBand = !whiteSets ? .runny
        : (peakWhiteC < WhiteBandBelowC.justSet ? .justSet : (peakWhiteC < WhiteBandBelowC.set ? .set : .firm))
    let yolk: YolkBand
    switch peakYolkC {
    case ..<YolkBandBelowC.liquid: yolk = .liquid
    case ..<YolkBandBelowC.soft: yolk = .soft
    case ..<YolkBandBelowC.jammy: yolk = .jammy
    case ..<YolkBandBelowC.fudgy: yolk = .fudgy
    default: yolk = .set
    }
    return Texture(white: white, yolk: yolk)
}

/// The texture note as the catalogue's keys: the line's own, and one for each
/// placeholder.
public struct TextureNote: Sendable, Equatable, Codable {
    public let key: CopyKey
    public let parts: [String: CopyKey]
}

public func textureNoteKeys(_ t: Texture) -> TextureNote {
    let white: CopyKey
    switch t.white {
    case .runny: return TextureNote(key: .`texture.white.runny`, parts: [:])
    case .justSet: white = .`texture.white.justSet`
    case .set: white = .`texture.white.set`
    case .firm: white = .`texture.white.firm`
    }
    let yolk: CopyKey
    switch t.yolk {
    case .liquid: yolk = .`texture.yolk.liquid`
    case .soft: yolk = .`texture.yolk.soft`
    case .jammy: yolk = .`texture.yolk.jammy`
    case .fudgy: yolk = .`texture.yolk.fudgy`
    case .set: yolk = .`texture.yolk.set`
    }
    return TextureNote(key: .`texture.note`, parts: ["white": white, "yolk": yolk])
}
