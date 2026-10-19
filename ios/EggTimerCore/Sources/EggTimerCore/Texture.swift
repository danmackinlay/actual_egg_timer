import Foundation
import EggTimerCopy

/// The twin of `src/core/texture.ts`, held to it by `fixtures/texture.json`;
/// the TypeScript's comments say what each part is for. Its string unions are
/// enums here, their raw values the TypeScript's spellings.

public enum WhiteBand: String, Sendable, Codable {
    case runny
    case set
    case firm
}

public struct Texture: Sendable, Equatable, Codable {
    public let white: WhiteBand
    public let yolk: YolkWord
}

public func textureFor(yolkDoseMin: Double, whiteDoseMin: Double, whiteSets: Bool) -> Texture {
    let white: WhiteBand = !whiteSets ? .runny
        : (log10(whiteDoseMin / whiteDoseTarget) > whiteFirmGapMedian ? .firm : .set)
    let level = (sliderFromYolkDose(yolkDoseMin) * sliderSteps).rounded() / sliderSteps
    return Texture(white: white, yolk: YolkWord.allCases[askedWord(level)])
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
    case .set: white = .`texture.white.set`
    case .firm: white = .`texture.white.firm`
    }
    let yolk: CopyKey
    switch t.yolk {
    case .runny: yolk = .`texture.yolk.liquid`
    case .soft: yolk = .`texture.yolk.soft`
    case .jammy: yolk = .`texture.yolk.jammy`
    case .fudgy: yolk = .`texture.yolk.fudgy`
    case .hard: yolk = .`texture.yolk.set`
    }
    return TextureNote(key: .`texture.note`, parts: ["white": white, "yolk": yolk])
}
