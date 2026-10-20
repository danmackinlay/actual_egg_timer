import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerCopy

/// The settings as this app keeps them (Settings.swift), and the language
/// and alarm's sound it keeps beside them: a stored copy read back, a number
/// clamped, and the default for a field not stored. What the store does with
/// them is AppTests' (`theSettingsAreOneValue`); the web tests its own
/// (test/settings.test.ts).
@Suite("The settings")
struct SettingsTests {
    /// `fields` stored in the settings' format, read back.
    func read(_ fields: [String: Any], _ classes: [SizeClass] = sizeClasses) throws -> AppSettings {
        var o = fields
        o["v"] = StoreRegistry.settings.format
        return readSettings(try JSONSerialization.data(withJSONObject: o), classes: classes)
    }

    @Test func nothingStoredOrNothingReadableIsTheDefaults() throws {
        #expect(readSettings(nil, classes: sizeClasses) == .defaults)
        for text in ["{damaged", "[0.5]", "3", "true", #"{"doneness":0.9}"#, #"{"v":1,"doneness":0.9}"#] {
            #expect(readSettings(Data(text.utf8), classes: sizeClasses) == .defaults, "\(text)")
        }
        #expect(try read([:]) == .defaults, "nothing in it")
        var watered = AppSettings.defaults
        watered.waterLitres = 3
        #expect(try read(["waterLitres": 3]) == watered, "a field given, and the defaults for the rest")
    }

    @Test func theEggShowsHowSetUnlessHowHotWasStored() throws {
        #expect(try read([:]).eggView == .set, "nothing stored, from before there was a choice")
        #expect(try read(["eggView": "heat"]).eggView == .heat)
        #expect(try read(["eggView": "warm"]) == .defaults, "not one of the two: the defaults, as any field not of its kind")
    }

    @Test func whatTheAppWritesReadsBackTheSame() throws {
        var s = AppSettings.defaults
        (s.sizeIndex, s.weighedMassG, s.startTempMode, s.customStartC, s.altitudeM) = (4, 71.25, .custom, 18.5, 1200)
        (s.startMode, s.afterBoil, s.cooling, s.waterLitres, s.eggCount, s.doneness) = (.hot, .off, .counter, 3.5, 6, 0.73)
        (s.unitsChosen, s.probe, s.roomC, s.tapWaterC, s.bowlLitres, s.bowlWaterC) = (.imperial, true, 23.5, 12.5, 1.5, 17)
        s.eggView = .heat
        func back(_ s: AppSettings) throws -> AppSettings {
            readSettings(try encodeStamped(StoreRegistry.settings, s), classes: usSizeClasses)
        }
        #expect(try back(s) == s)
        #expect(try back(.defaults) == .defaults)
        var blank = s
        (blank.cooling, blank.bowlWaterC) = (.bowl, nil)
        #expect(try back(blank) == blank, "a bowl's temperature left blank")
    }

    @Test func anEggCupReadsBack() throws {
        #expect(try read(["cooling": "eggCup"]).cooling == .eggCup, "stored as the web stores it")
        var s = AppSettings.defaults
        s.cooling = .eggCup
        #expect(readSettings(try encodeStamped(StoreRegistry.settings, s), classes: sizeClasses) == s)
    }

    @Test func everyNumberIsClampedAndAFieldNotOfItsKindIsTheDefaults() throws {
        let low = try read([
            "sizeIndex": -7, "weighedMassG": 3, "customStartC": -40, "altitudeM": -9000, "waterLitres": 0,
            "eggCount": 0, "doneness": -1, "roomC": -20, "tapWaterC": -5, "bowlLitres": 0.1, "bowlWaterC": 0,
        ])
        #expect(low.sizeIndex == -1 && low.weighedMassG == Limits.massG.lowerBound)
        #expect(low.customStartC == Limits.eggTempC.lowerBound && low.altitudeM == Limits.altitudeM.lowerBound)
        #expect(low.waterLitres == Limits.waterLitres.lowerBound && low.eggCount == 1 && low.doneness == 0)
        #expect(low.roomC == Limits.roomC.lowerBound && low.tapWaterC == Limits.coolingWaterC.lowerBound)
        #expect(low.bowlLitres == Limits.bowlLitres.lowerBound && low.bowlWaterC == Limits.coolingWaterC.lowerBound)
        let high = try read([
            "sizeIndex": 99, "weighedMassG": 400, "customStartC": 99, "altitudeM": 90000, "waterLitres": 80,
            "eggCount": 1000, "doneness": 7, "roomC": 300, "tapWaterC": 90, "bowlLitres": 50, "bowlWaterC": 41,
        ])
        #expect(high.sizeIndex == sizeClasses.count - 1 && high.weighedMassG == Limits.massG.upperBound)
        #expect(high.eggCount == Int(Limits.eggCount.upperBound) && high.doneness == 1)
        #expect(high.altitudeM == Limits.altitudeM.upperBound && high.bowlWaterC == Limits.coolingWaterC.upperBound)
        for (key, value): (String, Any) in [
            ("doneness", "0.9"), ("eggCount", 2.5), ("probe", 1), ("startMode", "sous"), ("cooling", "bath"),
            ("unitsChosen", "Metric"),
        ] {
            #expect(try read([key: value, "waterLitres": 3]) == .defaults, "\(key): \(value)")
        }
    }

    @Test func aStoredSizeKeepsItsNameWhenTheTableChanges() {
        for table in [sizeClasses, usSizeClasses] {
            for i in table.indices { #expect(carrySizeIndex(i, classes: table) == i) }
            #expect(carrySizeIndex(-1, classes: table) == -1, "a weighed egg stays weighed")
            #expect(carrySizeIndex(-3, classes: table) == -1)
        }
        #expect(carrySizeIndex(4, classes: sizeClasses) == 3, "a Jumbo outside the US is Extra large")
        #expect(carrySizeIndex(7, classes: usSizeClasses) == 4)
        // The case the second table exists for: the default egg, saved
        // before it, read in the US, cooks the American Large.
        #expect(usSizeClasses[carrySizeIndex(Defaults.sizeIndex, classes: usSizeClasses)].massKg == 0.0602)
    }

    @Test func theAlarmSoundAndTheLanguageAreReadDefensively() throws {
        for (raw, want): (Any?, AlarmSound) in [
            ("timer", .timer), ("cuckoo", .cuckoo), ("hen", .hen), ("Hen", .timer), ("beeps", .timer), ("", .timer),
            (3, .timer), (true, .timer), (nil, .timer),
        ] {
            #expect(readAlarmSound(raw) == want, "\(raw ?? "nil")")
        }
        #expect(defaultAlarmSound == .timer && AlarmSound.allCases == [.timer, .cuckoo, .hen])
        #expect(languageTags == languages.map(\.tag) && languageTags.contains(defaultLanguage))
        for (raw, want): (Any?, String?) in [
            (nil, nil), ("en", nil), (42, nil), ([Any](), nil), ([String: Any](), nil), (["chosen": "xx"], nil),
            (["chosen": 5], nil), (["chosen": "en"], "en"), (["chosen": periodLanguage], periodLanguage),
            (["chosen": periodLanguage, "flippedFrom": ["chosen": "en"]], periodLanguage),
            (["chosen": NSNull(), "flippedFrom": ["chosen": "en"]], nil),
        ] {
            #expect(readLanguageState(raw, known: languageTags) == LanguageState(chosen: want), "\(raw ?? "nil")")
        }
        // Every language the picker offers is kept; a tag it does not is not.
        for tag in languageTags {
            #expect(readLanguageState(["chosen": tag], known: languageTags) == LanguageState(chosen: tag), "\(tag)")
        }
        let stored = try JSONSerialization.data(withJSONObject: LanguageState(chosen: periodLanguage).jsonObject)
        #expect(readLanguageState(try JSONSerialization.jsonObject(with: stored), known: languageTags).chosen == periodLanguage)
        #expect(LanguageState.fresh.jsonObject["chosen"] is NSNull)
    }

    @Test func theUnitsSwitchToImperialMovesOnlyModernEnglishInto1750() {
        let english = LanguageState(chosen: "en"), period = LanguageState(chosen: periodLanguage)
        let other = LanguageState(chosen: "xx")
        #expect(effectiveLanguage(.fresh) == defaultLanguage)
        for state in [LanguageState.fresh, english] {
            #expect(languageAfterFlip(state, .metricToImperial) == period)
        }
        for state in [period, other] { #expect(languageAfterFlip(state, .metricToImperial) == state) }
        for state in [LanguageState.fresh, english, period, other] {
            #expect(languageAfterFlip(state, .imperialToMetric) == state, "back to metric leaves it")
        }
    }
}
