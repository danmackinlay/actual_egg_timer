import Foundation

/// What the pan makes of the white and the yolk, as bands read from their
/// peak temperatures, and the catalogue keys the texture note is said in.
/// Transliterated from `src/core/texture.ts`, and held to it by
/// `fixtures/texture.json`.

/// What the pan makes of the white: `runny` when it never gets the white the
/// dose that sets it, and otherwise what its peak temperature makes of it.
public enum WhiteBand: String, Sendable {
    case runny
    case justSet
    case set
    case firm
}

/// What the yolk's peak temperature makes of it.
public enum YolkBand: String, Sendable {
    case liquid
    case soft
    case jammy
    case fudgy
    case set
}

public struct Texture: Sendable, Equatable {
    public let white: WhiteBand
    public let yolk: YolkBand
}

/// The texture note's thresholds, which are a reading of the model rather than
/// a turn of phrase - so they are decided here and worded in the app.
///
/// The bands read PEAK TEMPERATURES, while the white's own criterion is a dose
/// (`Solution.whiteSets`). The two disagree only when the pan never gets the
/// white there at all, and then the dose is the one telling the truth: the
/// white is runny, whatever its peak. See src/core/texture.ts.
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

/// The peak white temperature, C, below which the white is in each band; at or
/// above the last it is firm.
public enum WhiteBandBelowC {
    public static let justSet = 71.0
    public static let set = 82.0
}

/// The peak yolk temperature, C, below which the yolk is in each band; at or
/// above the last it is set.
public enum YolkBandBelowC {
    public static let liquid = 58.0
    public static let soft = 63.0
    public static let jammy = 68.0
    public static let fudgy = 73.0
}

/// The texture note as the catalogue's keys: the line's own key, and the key
/// of the fragment that fills each of its placeholders. The app renders the
/// fragments and hands them in; it chooses nothing.
public struct TextureNote: Sendable, Equatable {
    public let key: String
    public let parts: [String: String]
}

/// Which words a texture is said in. A white that never sets is the whole
/// note, "white stays runny" with no yolk after it, as the web has always said
/// it; every other white is named with its yolk. The keys are written out
/// whole so that the copy tests can find each one.
public func textureNoteKeys(_ t: Texture) -> TextureNote {
    let white: String
    switch t.white {
    case .runny: return TextureNote(key: "texture.white.runny", parts: [:])
    case .justSet: white = "texture.white.justSet"
    case .set: white = "texture.white.set"
    case .firm: white = "texture.white.firm"
    }
    let yolk: String
    switch t.yolk {
    case .liquid: yolk = "texture.yolk.liquid"
    case .soft: yolk = "texture.yolk.soft"
    case .jammy: yolk = "texture.yolk.jammy"
    case .fudgy: yolk = "texture.yolk.fudgy"
    case .set: yolk = "texture.yolk.set"
    }
    return TextureNote(key: "texture.note", parts: ["white": white, "yolk": yolk])
}
