import Foundation
import CryptoKit
import Testing
@testable import EggTimerApp
import EggTimerCore

/// Sharing's runs (Sharing.swift) over a fake server and App Attest
/// (`FakeTransport`): the final eggs sent in order under an attested key,
/// and every way App Attest can fail falling back to the open tier, at
/// once or after waiting, so the eggs still go. What each answer does to
/// the queue is ShareQueueTests'; the web's runs are test/share.test.ts's.
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
    /// again with a new key; one refused the day it was made is given up on.
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
}
