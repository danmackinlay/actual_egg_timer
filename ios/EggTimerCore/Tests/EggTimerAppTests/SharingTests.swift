import Foundation
import CryptoKit
import Testing
@testable import EggTimerApp
import EggTimerCore

/// Sharing's runs (Sharing.swift) over a fake server and App Attest
/// (`FakeTransport`): the final eggs sent in order under an attested key,
/// every way App Attest can fail falling back to the open tier, at once or
/// after waiting, and an egg the server did not take sent again, so the
/// eggs still go. What each answer does to the queue is ShareQueueTests';
/// the web's runs are test/share.test.ts's. And what 0.5.1 kept in the
/// standard domain, sharing and the learning, carried into the suite.
extension AppTests {
    static let day = 24 * 60 * 60.0

    /// An egg recorded on this day, as a log holds it: no id.
    func egg(_ day: String) throws -> EggRecord {
        let json = """
        {"v": 1, "uid": null, "day": "\(day)", "app": "ios", "appVersion": "0.2.0", "prior": "2026-09",
         "model": "2026-10-e10", "egg": {"mass_g": 62, "massFrom": "class", "sizeTable": "eu"},
         "setup": {"startMode": "hot", "eggStart_C": 4, "eggFrom": "fridge", "ambient_C": 20, "boiling_C": 100,
          "timeToBoil_s": 0, "timeToBoilFrom": "remembered", "cooling": "ice", "afterBoil": "hold",
          "waterLitres": 2, "eggCount": 4},
         "level": 0.3, "recommended_s": 415, "nudge_s": 0, "pulled_s": 422, "pulledBy": "cook", "cooled_s": 180,
         "yolkWord": "soft", "white": "runny", "probe": null, "forecast": null, "lang": "en",
         "register": "modern", "units": "metric"}
        """
        return try JSONDecoder().decode(EggRecord.self, from: Data(json.utf8))
    }

    /// Sharing over a fake, on the test's clock, with a log of three eggs,
    /// all final unless `final` says fewer; launched, and its first run done.
    func launched(
        _ world: World, _ transport: FakeTransport, final: Int = 3
    ) async throws -> (Sharing, Box) {
        let log = try ["2026-10-01", "2026-10-02", "2026-10-03"].map(egg)
        let finals = Box(final)
        let clock = world.clock
        let sharing = Sharing(transport: transport, nowS: { clock.seconds })
        sharing.start(host: ShareHost(log: { log }, finalCount: { finals.value }))
        await ran(sharing)
        return (sharing, finals)
    }

    /// How many of the log's eggs are final, as a test moves it.
    @MainActor final class Box {
        var value: Int
        init(_ value: Int) { self.value = value }
    }

    /// Until the last resume and the run it started are done.
    func ran(_ sharing: Sharing) async {
        await sharing.resuming?.value
        await sharing.run?.value
    }

    /// Sending again, as the app does after an egg is final, and done.
    func sendAgain(_ sharing: Sharing) async {
        sharing.sendFinal()
        await ran(sharing)
    }

    /// Turned on: the key made and attested over SHA256(uid), the
    /// attestation posted once, then each final egg, in order, under the id
    /// and signed; the egg on screen waits until it is final; written
    /// through.
    @Test func sharingSendsTheFinalEggsInOrderUnderAnAttestedKey() async throws {
        let world = World()
        let transport = FakeTransport()
        let (sharing, finals) = try await launched(world, transport, final: 2)
        #expect(transport.posts.isEmpty, "off: nothing goes")
        sharing.setSharing(true)
        await ran(sharing)
        let uid = try #require(sharing.state.uid)
        #expect(transport.attestations == 1)
        #expect(transport.attested == [Data(SHA256.hash(data: Data(uid.utf8)))])
        #expect(transport.eggs.map { $0.seq } == [0, 1])
        #expect(transport.eggs.map { $0.day } == ["2026-10-01", "2026-10-02"])
        #expect(transport.eggs.allSatisfy { $0.uid == uid && $0.signed })
        #expect(readStoredShare(world.store.data(forKey: StoreRegistry.share.key)).sent == 2, "written through")
        finals.value = 3
        await sendAgain(sharing)
        #expect(transport.eggs.map { $0.seq } == [0, 1, 2])
        #expect(transport.attestations == 1 && transport.keysMade == 1, "a key is attested once")
    }

    /// A phone that cannot attest, a key the server refuses, and a key the
    /// phone no longer holds: open, at once, and the eggs still go.
    @Test func aPhoneThatCannotAttestOrWhoseKeyIsRefusedOrLostSendsOpen() async throws {
        let world = World()
        let cannot = FakeTransport()
        cannot.canAttest = false
        let (a, _) = try await launched(world, cannot)
        a.setSharing(true)
        await ran(a)
        #expect(cannot.attestations == 0 && cannot.keysMade == 0)
        #expect(cannot.eggs.map { $0.seq } == [0, 1, 2] && cannot.eggs.allSatisfy { !$0.signed })

        let refused = FakeTransport()
        refused.attestAnswers = [409]
        let (b, _) = try await launched(World(), refused)
        b.setSharing(true)
        await ran(b)
        #expect(refused.attestations == 1)
        #expect(refused.eggs.count == 3 && refused.eggs.allSatisfy { !$0.signed })
        #expect(b.attest?.status == .failed, "given up on for this id")

        let lost = FakeTransport()
        lost.assertionFailures = [AttestFailure.invalidKey]
        let (c, _) = try await launched(World(), lost)
        c.setSharing(true)
        await ran(c)
        #expect(lost.eggs.map { $0.signed } == [false, false, false], "the key lost: open from the first egg")
        #expect(c.attest?.status == .failed)
    }

    /// A busy server, or Apple's service busy, is waited on - no egg goes
    /// open for a passing failure - for five tries and three days; then the
    /// key is given up on and the eggs go open. Offline is not counted.
    @Test func aBusyAttestationIsWaitedOnThenGivenUpAndTheEggsGoOpen() async throws {
        let world = World()
        let transport = FakeTransport()
        transport.attestFailures = [AttestFailure.busy]
        transport.attestAnswers = [nil, 503, 429, 503, 503]
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        #expect(transport.posts.isEmpty && sharing.attest?.busy == 1, "Apple busy: counted, nothing posted")
        world.clock.advance(Self.day)
        await sendAgain(sharing)
        #expect(sharing.attest?.busy == 1, "offline: not counted")
        for _ in 0..<3 {
            world.clock.advance(Self.day)
            await sendAgain(sharing)
        }
        #expect(transport.eggs.isEmpty && sharing.attest?.busy == 4)
        world.clock.advance(Self.day)
        await sendAgain(sharing)
        #expect(transport.attestations == 5 && transport.attested.count == 1, "attested once, posted again")
        #expect(transport.eggs.map { $0.seq } == [0, 1, 2] && transport.eggs.allSatisfy { !$0.signed })
        #expect(sharing.attest?.status == .failed)
    }

    /// An attestation posted days after Apple made it, and refused, is made
    /// again with a new key.
    @Test func anAttestationRefusedDaysLateIsMadeAgainWithANewKey() async throws {
        let world = World()
        let transport = FakeTransport()
        transport.attestAnswers = [nil, 400]
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        world.clock.advance(2 * Self.day)
        await sendAgain(sharing)
        #expect(transport.eggs.isEmpty && sharing.attest?.keyId == nil, "the old key dropped")
        await sendAgain(sharing)
        #expect(transport.keysMade == 2 && transport.attested.count == 2)
        #expect(transport.eggs.count == 3 && transport.eggs.allSatisfy { $0.signed })
    }

    /// Refused the day Apple made it, the attestation is not made again: the
    /// key is given up on for this id, and every egg goes open.
    @Test func anAttestationRefusedTheDayItWasMadeIsGivenUpAndTheEggsGoOpen() async throws {
        let world = World()
        let transport = FakeTransport()
        transport.attestAnswers = [400]
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        #expect(transport.attestations == 1 && transport.keysMade == 1, "not made again")
        #expect(sharing.attest?.status == .failed)
        #expect(transport.eggs.map { $0.seq } == [0, 1, 2] && transport.eggs.allSatisfy { !$0.signed })
        #expect(sharing.state.sent == 3)
    }

    /// A key the phone could not make, for any reason App Attest does not
    /// name as passing, is given up on at once: every egg goes open.
    @Test func aKeyThatCannotBeMadeIsGivenUpAndTheEggsGoOpen() async throws {
        struct SomeError: Error {}
        let world = World()
        let transport = FakeTransport()
        transport.keyFailures = [SomeError()]
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        #expect(transport.keysMade == 0 && transport.attestations == 0)
        #expect(sharing.attest?.status == .failed, "given up on for this id")
        #expect(transport.eggs.map { $0.seq } == [0, 1, 2] && transport.eggs.allSatisfy { !$0.signed })
        #expect(sharing.state.sent == 3)
    }

    /// An egg the server did not answer, or answered busy, stops the run
    /// where it is, and goes again, under the same number, with the rest on
    /// the next run: none is passed over. Only the busy answer is counted.
    @Test func anEggNotAnsweredOrAnsweredBusyStopsTheRunAndGoesAgainOnTheNext() async throws {
        for (answer, counted) in [(nil, 0), (503, 1)] as [(Int?, Int)] {
            let world = World()
            let transport = FakeTransport()
            transport.eggAnswers = [answer]
            let (sharing, _) = try await launched(world, transport)
            sharing.setSharing(true)
            await ran(sharing)
            let what = answer.map { "answered \($0)" } ?? "no answer"
            #expect(transport.eggs.map { $0.seq } == [0], "\(what): the run stops")
            #expect(sharing.state.sent == 0 && sharing.state.busy == counted, "\(what): counted \(counted)")
            await sendAgain(sharing)
            #expect(transport.eggs.map { $0.seq } == [0, 0, 1, 2], "\(what): the same egg again, then the rest")
            #expect(transport.eggs.map { $0.day } == ["2026-10-01", "2026-10-01", "2026-10-02", "2026-10-03"])
            #expect(transport.eggs.allSatisfy { $0.signed }, "\(what): still under the key")
            #expect(sharing.state.sent == 3 && sharing.state.busy == 0 && sharing.state.busySinceS == nil)
        }
    }

    /// A signature the phone could not make waits, counted, and the egg is
    /// sent signed once it can.
    @Test func aSignatureNotMadeWaitsForTheNextRun() async throws {
        let world = World()
        let transport = FakeTransport()
        transport.assertionFailures = [AttestFailure.busy]
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        #expect(transport.eggs.isEmpty && sharing.attest?.busy == 1)
        await sendAgain(sharing)
        #expect(transport.eggs.count == 3 && transport.eggs.allSatisfy { $0.signed })
        #expect(sharing.attest?.busy == nil, "the count cleared")
    }

    /// Nothing goes under a debug build's altered clock.
    @Test func nothingIsSentUnderAnAlteredClock() async throws {
        let world = World()
        world.clock.alter()
        let transport = FakeTransport()
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        #expect(transport.posts.isEmpty)
    }

    /// Delete what I've sent: the key forgotten, every id asked for, and one
    /// not confirmed asked again at the next launch.
    @Test func aDeletionReachesEveryIdAndIsAskedAgainUntilConfirmed() async throws {
        let world = World()
        let transport = FakeTransport()
        let (sharing, _) = try await launched(world, transport)
        sharing.setSharing(true)
        await ran(sharing)
        let first = try #require(sharing.state.uid)
        sharing.forget()
        let second = try #require(sharing.state.uid)
        transport.deleteAnswers = [200, nil]
        await sharing.deleteSent()
        #expect(transport.deletes == ["api/eggs/\(first)", "api/eggs/\(second)"])
        #expect(sharing.state.deleting == [second] && !sharing.state.on)
        #expect(world.store.data(forKey: StoreRegistry.shareAttest.key) == nil, "the key forgotten")
        let (again, _) = try await launched(world, transport)
        #expect(transport.deletes.last == "api/eggs/\(second)")
        #expect(again.state.deleting.isEmpty)
    }

    /// Sharing as 0.5.1 kept it in the standard domain: on, its id and an
    /// earlier one, three eggs sent, and the id's attested key; beside it,
    /// what else 0.5.1 kept there, and its learning (`log`) if any.
    static let id051 = "0f8fad5b-d9cb-469f-a165-70867728950e"
    static let earlier051 = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    func standard051(log: Data? = nil) -> MemoryStore {
        let share = """
        {"on": true, "uid": "\(Self.id051)", "sent": 3, "seq": 3, "uids": ["\(Self.earlier051)", "\(Self.id051)"],
         "deleting": [], "busy": 0}
        """
        let attest = """
        {"uid": "\(Self.id051)", "keyId": "key-0.5.1", "status": "attested"}
        """
        var kept: [String: Any] = [
            StoreRegistry.share.key: Data(share.utf8),
            StoreRegistry.shareAttest.key: Data(attest.utf8),
            "calibration.v4": Data("0.3's log".utf8),
            "newestVersion": "0.5.1",
        ]
        kept[StoreRegistry.calibration.key] = log
        return MemoryStore(kept)
    }

    /// The learning as 0.5.1 kept it, made by the writer 0.5.1 had: the
    /// first `count` iOS eggs of the replay fixture (fixtures/record.json,
    /// core's own records, of coolings 0.5.1 had), each written down and
    /// folded by the app's learner, and what it stored, in a store of its
    /// own. The format and the key are 0.5.1's.
    func learning051(_ count: Int) async throws -> (stored: Data, log: [EggRecord], calibration: Calibration) {
        let url = World.copyFolder.deletingLastPathComponent().appendingPathComponent("fixtures/record.json")
        let fixture = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let records = try #require((fixture["replay"] as? [String: Any])?["log"] as? [Any])
        let log = try records
            .map { try JSONDecoder().decode(EggRecord.self, from: JSONSerialization.data(withJSONObject: $0)) }
            .filter { $0.app == .ios && $0.setup.cooling != .eggCup && recordTeaches($0) }
            .prefix(count)
        try #require(log.count == count)
        let world = World()
        let planner = world.planner()
        planner.load()
        for egg in log { planner.learner.logRecord(egg, replaces: false) }
        await world.learned(planner)
        let stored = try #require(world.store.data(forKey: StoreRegistry.calibration.key))
        #expect(planner.kept.calibration.eggsLogged == count)
        return (stored, Array(log), planner.kept.calibration)
    }

    /// What 0.5.1 kept of sharing is carried into the suite at launch and
    /// read back: sharing on under its id and key, with nothing sent again,
    /// and "Delete shared results" reaches every id it sent under. The keys
    /// carried go from the standard domain, and nothing else there is
    /// touched.
    @Test func whatTheStandardDomainKeptOfSharingIsCarriedIntoTheSuite() async throws {
        let world = World()
        let standard = standard051()
        Stores.carryOver(from: standard)
        #expect(standard.data(forKey: StoreRegistry.share.key) == nil)
        #expect(standard.data(forKey: StoreRegistry.shareAttest.key) == nil)
        #expect(Set(standard.keys) == ["calibration.v4", "newestVersion"])
        #expect(standard.writes.map(\.key).sorted() == [StoreRegistry.share.key, StoreRegistry.shareAttest.key].sorted())

        let transport = FakeTransport()
        let (sharing, _) = try await launched(world, transport)
        #expect(sharing.state.on)
        #expect(sharing.state.uid == Self.id051)
        #expect(sharing.state.uids == [Self.earlier051, Self.id051])
        #expect(sharing.state.sent == 3)
        #expect(sharing.attest?.uid == Self.id051 && sharing.attest?.keyId == "key-0.5.1")
        #expect(sharing.attest?.status == .attested)
        #expect(transport.posts.isEmpty, "nothing sent again")
        await sharing.deleteSent()
        #expect(transport.deletes == ["api/eggs/\(Self.earlier051)", "api/eggs/\(Self.id051)"])
    }

    /// A suite that already keeps sharing is left alone, and so is what the
    /// standard domain kept of it; a key the suite lacks is carried still.
    @Test func aSuiteThatKeepsSharingIsLeftAlone() throws {
        let mine = try #require(storedShare(turnedOn(.fresh, fresh: Sharing.newUid())))
        let world = World(store: MemoryStore([StoreRegistry.share.key: mine]))
        let standard = standard051()
        let was = standard.data(forKey: StoreRegistry.share.key)
        Stores.carryOver(from: standard)
        #expect(world.store.data(forKey: StoreRegistry.share.key) == mine)
        #expect(!world.store.writes.contains { $0.key == StoreRegistry.share.key })
        #expect(standard.data(forKey: StoreRegistry.share.key) == was)
        #expect(world.store.data(forKey: StoreRegistry.shareAttest.key) != nil, "the key the suite lacked")
        #expect(standard.data(forKey: StoreRegistry.shareAttest.key) == nil)
    }

    /// A second launch carries nothing: the standard domain no longer has
    /// it, and the suite does.
    @Test func sharingIsCarriedOnce() {
        let world = World()
        let standard = standard051()
        Stores.carryOver(from: standard)
        let writes = world.store.writes.count
        Stores.carryOver(from: standard)
        #expect(world.store.writes.count == writes)
        #expect(standard.writes.count == 2)
    }

    /// The learning 0.5.1 kept is carried into the suite as it was stored,
    /// and the app's learner reads it back as it was folded: the same eggs
    /// in the log, the same posterior, nothing folded again. The key goes
    /// from the standard domain.
    @Test func theLearning051KeptIsCarriedIntoTheSuiteAndReadBack() async throws {
        let was = try await learning051(3)
        let world = World()
        let standard = standard051(log: was.stored)
        Stores.carryOver(from: standard)
        let key = StoreRegistry.calibration.key
        #expect(standard.data(forKey: key) == nil)
        #expect(Set(standard.keys) == ["calibration.v4", "newestVersion"])
        #expect(world.store.data(forKey: key) == was.stored)

        let planner = world.planner()
        planner.load()
        await world.learned(planner)
        #expect(planner.kept.log == was.log)
        #expect(planner.kept.folded == was.log.count)
        #expect(planner.kept.base == nil)
        #expect(planner.kept.calibration.eggsLogged == was.calibration.eggsLogged)
        #expect(planner.kept.calibration.posterior.weights == was.calibration.posterior.weights)
        #expect(planner.kept.calibration.posterior.particles.map(\.alphaM2s)
            == was.calibration.posterior.particles.map(\.alphaM2s))
        #expect(world.store.writes.filter { $0.key == key }.count == 1, "read as stored: not replayed or written again")
    }

    /// A suite that already keeps a log is left alone, and so is the log the
    /// standard domain kept; the app reads the suite's.
    @Test func aSuiteThatKeepsALogIsLeftAlone() async throws {
        let theirs = try await learning051(3)
        let mine = try await learning051(1)
        let key = StoreRegistry.calibration.key
        let world = World(store: MemoryStore([key: mine.stored]))
        let standard = standard051(log: theirs.stored)
        Stores.carryOver(from: standard)
        #expect(world.store.data(forKey: key) == mine.stored)
        #expect(!world.store.writes.contains { $0.key == key })
        #expect(standard.data(forKey: key) == theirs.stored)

        let planner = world.planner()
        planner.load()
        await world.learned(planner)
        #expect(planner.kept.log == mine.log)
    }

    /// A log this build cannot read is not carried, and stays in the
    /// standard domain as it was: the suite has none, and the app starts
    /// from the prior, as it would on that log. Sharing is carried still.
    @Test func aLogThisBuildCannotReadIsNotCarried() {
        let world = World()
        let key = StoreRegistry.calibration.key
        let damaged = Data("0.5.1's log, damaged".utf8)
        let standard = standard051(log: damaged)
        Stores.carryOver(from: standard)
        #expect(world.store.data(forKey: key) == nil)
        #expect(standard.data(forKey: key) == damaged)
        #expect(!world.store.writes.contains { $0.key == key })
        #expect(!standard.writes.contains { $0.key == key })
        #expect(standard.data(forKey: StoreRegistry.share.key) == nil, "sharing carried as before")
    }
}
