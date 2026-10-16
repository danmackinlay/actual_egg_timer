import Foundation
import Testing
@testable import EggTimerApp
import EggTimerCore
import EggTimerCopy

/// The settings as this app keeps them (Settings.swift), and the language
/// and alarm's sound it keeps beside them: a stored copy read back with
/// every field checked, a number clamped, and the default for anything
/// missing or malformed. What the store does with them is AppTests'
/// (`theSettingsAreOneValue`); the web tests its own (test/settings.test.ts).
@Suite("The settings")
struct SettingsTests {
    /// Through JSONSerialization, as the store reads them.
    func read(_ stored: Any, _ classes: [SizeClass] = sizeClasses) throws -> AppSettings {
        let data = try JSONSerialization.data(withJSONObject: ["v": 1, "s": stored])
        let o = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return readSettings(o["s"], classes: classes)
    }

    @Test func nothingStoredOrNotAnObjectIsTheDefaults() throws {
        for raw: Any in ["doneness", [0.5], 3, true, [String: Any]()] {
            #expect(try read(raw) == .defaults, "\(raw)")
        }
        #expect(readSettings(nil, classes: sizeClasses) == .defaults)
    }

    @Test func whatTheAppWritesReadsBackTheSame() throws {
        var s = AppSettings.defaults
        (s.sizeIndex, s.weighedMassG, s.startTempMode, s.customStartC, s.altitudeM) = (4, 71.25, .custom, 18.5, 1200)
        (s.startMode, s.afterBoil, s.cooling, s.waterLitres, s.eggCount, s.doneness) = (.hot, .off, .counter, 3.5, 6, 0.73)
        (s.unitsChosen, s.probe, s.roomC, s.tapWaterC, s.bowlLitres, s.bowlWaterC) = (.imperial, true, 23.5, 12.5, 1.5, 17)
        #expect(try read(s.jsonObject, usSizeClasses) == s)
        #expect(try read(AppSettings.defaults.jsonObject) == .defaults)
        // The web's fields are not this app's: neither read nor written.
        #expect(Set(s.jsonObject.keys).isDisjoint(with: ["customMinor_mm", "measuredBy", "muted", "alarm", "language"]))
        var blank = s
        (blank.cooling, blank.bowlWaterC) = (.bowl, nil)
        #expect(try read(blank.jsonObject, usSizeClasses) == blank, "a bowl's temperature left blank")
    }

    @Test func everyNumberIsClampedAndAnythingElseIsTheDefault() throws {
        let low = try read([
            "sizeIndex": -7, "weighedMass_g": 3, "customStart_C": -40, "altitude_m": -9000, "waterLitres": 0,
            "eggCount": 0, "doneness": -1, "room_C": -20, "tapWater_C": -5, "bowlLitres": 0.1, "bowlWater_C": 0,
        ])
        #expect(low.sizeIndex == -1 && low.weighedMassG == Limits.massG.lowerBound)
        #expect(low.customStartC == Limits.eggTempC.lowerBound && low.altitudeM == Limits.altitudeM.lowerBound)
        #expect(low.waterLitres == Limits.waterLitres.lowerBound && low.eggCount == 1 && low.doneness == 0)
        #expect(low.roomC == Limits.roomC.lowerBound && low.tapWaterC == Limits.coolingWaterC.lowerBound)
        #expect(low.bowlLitres == Limits.bowlLitres.lowerBound && low.bowlWaterC == Limits.coolingWaterC.lowerBound)
        let high = try read([
            "sizeIndex": 99, "weighedMass_g": 400, "customStart_C": 99, "altitude_m": 90000, "waterLitres": 80,
            "eggCount": 1000, "doneness": 7, "room_C": 300, "tapWater_C": 90, "bowlLitres": 50, "bowlWater_C": 41,
        ])
        #expect(high.sizeIndex == sizeClasses.count - 1 && high.weighedMassG == Limits.massG.upperBound)
        #expect(high.eggCount == Int(Limits.eggCount.upperBound) && high.doneness == 1)
        #expect(high.altitudeM == Limits.altitudeM.upperBound && high.bowlWaterC == Limits.coolingWaterC.upperBound)
        let text = try read([
            "sizeIndex": "1", "weighedMass_g": true, "customStart_C": NSNull(), "altitude_m": "100", "waterLitres": false,
            "eggCount": "4", "doneness": "0.9", "room_C": "20", "tapWater_C": "15", "bowlLitres": true,
            "bowlWater_C": "20", "probe": 1,
        ])
        var want = AppSettings.defaults
        want.sizeIndex = carrySizeIndex(Double(Defaults.sizeIndex), classes: sizeClasses)
        #expect(text == want, "numbers as text, true and false, null: not numbers")
        let halves = try read(["sizeIndex": 2.5, "eggCount": 2.5])
        #expect(halves.sizeIndex == 3 && halves.eggCount == 3)
        #expect(try read(["sizeIndex": -0.5, "eggCount": 3.4999]).sizeIndex == -1, "the -0.5 tie is a weighed egg")
    }

    @Test func choicesThatAreNotTheirsAreTheDefault() throws {
        let s = try read([
            "startTempMode": "Fridge", "startMode": "sous", "afterBoil": true, "cooling": "bath", "unitsChosen": "Metric",
        ])
        #expect(s == .defaults)
        #expect(try read(["startMode": "sous"]).startMode == .cold, "a stored sous-vide is the default pan")
        #expect(readChosenUnits("imperial") == .imperial)
        for raw: Any? in ["Imperial", "kelvin", "", 0, true, nil] { #expect(readChosenUnits(raw) == nil, "\(raw ?? "nil")") }
    }

    @Test func aStoredSizeKeepsItsNameWhenTheTableChanges() {
        for table in [sizeClasses, usSizeClasses] {
            for i in table.indices { #expect(carrySizeIndex(Double(i), classes: table) == i) }
            #expect(carrySizeIndex(-1, classes: table) == -1, "a weighed egg stays weighed")
            #expect(carrySizeIndex(-3, classes: table) == -1)
            #expect(carrySizeIndex(-0.4, classes: table) == -1)
            #expect(carrySizeIndex(.nan, classes: table) == Defaults.sizeIndex)
            #expect(carrySizeIndex(1.5, classes: table) == 2)
        }
        #expect(carrySizeIndex(4, classes: sizeClasses) == 3, "a Jumbo outside the US is Extra large")
        #expect(carrySizeIndex(7, classes: usSizeClasses) == 4)
        // The case the second table exists for: the default egg, saved
        // before it, read in the US, cooks the American Large.
        #expect(usSizeClasses[carrySizeIndex(Double(Defaults.sizeIndex), classes: usSizeClasses)].massKg == 0.0602)
    }

    @Test func theAlarmSoundAndTheLanguageAreReadDefensively() throws {
        for (raw, want): (Any?, AlarmSound) in [
            ("timer", .timer), ("cuckoo", .cuckoo), ("hen", .hen), ("Hen", .timer), ("beeps", .timer), ("", .timer),
            (3, .timer), (true, .timer), (nil, .timer),
        ] {
            #expect(readAlarmSound(raw) == want, "\(raw ?? "nil")")
        }
        #expect(defaultAlarmSound == .timer && AlarmSound.allCases == [.timer, .cuckoo, .hen])
        #expect(languages == [defaultLanguage, periodLanguage])
        for (raw, want): (Any?, String?) in [
            (nil, nil), ("en", nil), (42, nil), ([Any](), nil), ([String: Any](), nil), (["chosen": "xx"], nil),
            (["chosen": 5], nil), (["chosen": "en"], "en"), (["chosen": "cs"], nil), (["chosen": periodLanguage], periodLanguage),
            (["chosen": periodLanguage, "flippedFrom": ["chosen": "en"]], periodLanguage),
            (["chosen": NSNull(), "flippedFrom": ["chosen": "en"]], nil),
        ] {
            #expect(readLanguageState(raw, known: languages) == LanguageState(chosen: want), "\(raw ?? "nil")")
        }
        let stored = try JSONSerialization.data(withJSONObject: LanguageState(chosen: periodLanguage).jsonObject)
        #expect(readLanguageState(try JSONSerialization.jsonObject(with: stored), known: languages).chosen == periodLanguage)
        #expect(LanguageState.fresh.jsonObject["chosen"] is NSNull)
    }

    @Test func theUnitsSwitchToImperialMovesOnlyModernEnglishInto1750() {
        let english = LanguageState(chosen: "en"), period = LanguageState(chosen: periodLanguage)
        let czech = LanguageState(chosen: "cs")
        #expect(effectiveLanguage(.fresh) == defaultLanguage)
        for state in [LanguageState.fresh, english] {
            #expect(languageAfterFlip(state, .metricToImperial) == period)
        }
        for state in [period, czech] { #expect(languageAfterFlip(state, .metricToImperial) == state) }
        for state in [LanguageState.fresh, english, period, czech] {
            #expect(languageAfterFlip(state, .imperialToMetric) == state, "back to metric leaves it")
        }
    }
}
