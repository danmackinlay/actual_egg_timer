import Foundation
import CryptoKit
import EggTimerCore

/// Sharing (INFERENCE.md section 7): a cook who
/// turns it on sends every egg in the log to the collection endpoint, the
/// ones from before it was on included, and can delete
/// everything this phone has sent. What it keeps, and how each step moves it,
/// is `ShareQueue.swift`'s, which the web moves alike; what
/// the server takes and what its answers mean is core's (`Share.swift`).
/// This holds the state, writes it through and runs the sends, as the
/// web's `src/ui/share.ts` does; the requests themselves, and App Attest,
/// go through a `ShareTransport` (the app's `ShareNetwork`; the tests' fake).
///
/// What iOS adds is App Attest. When an id first sends, the
/// phone makes a key in its Secure Enclave and has Apple attest it, bound to
/// the id (`clientDataHash = SHA256(uid)`), and posts the attestation; every
/// egg then carries an assertion - the key's signature over the body sent -
/// and the server files it in the attested tier. A phone that cannot attest
/// (a simulator, an old phone, a refusal) sends anyway, to the open tier.
/// One that cannot attest yet (offline, Apple's service or the server busy)
/// waits and tries again on the next run, rather than send its whole log
/// open for good because of a passing failure - but not for ever: after
/// five busy answers and three days (`shareGivesUp`) it gives
/// up on the key and sends open, as a phone that lost its key does. What an
/// answer means, for an egg as for an attestation, is core's `shareReply`.
@MainActor
@Observable
public final class Sharing {
    /// An id's attested key: made, attested by Apple, and taken by the server
    /// - or given up on, for this id.
    struct Attest: Codable, Equatable {
        enum Status: String, Codable { case pending, attested, failed }
        var uid: String
        var keyId: String?
        /// Apple's attestation, base64, kept until the server has it: a key
        /// is attested once, and a post that did not get through is posted
        /// again rather than attested again.
        var attestation: String?
        var status: Status
        /// When Apple made `attestation`, epoch s, set with it. Its
        /// certificate is good for a few days, so one posted later is
        /// refused.
        var madeAtS: Double?
        /// How many busy answers - the server's or Apple's - or signatures
        /// the phone could not make it has had, and when the first came:
        /// what `shareGivesUp` bounds. Absent when there are none.
        var busy: Int?
        var busySinceS: Double?
    }

    /// How old an attestation may be and still be refused for itself: one
    /// older is refused for its certificate's date, most likely, and the
    /// phone makes a new key and tries again.
    private static let attestationFresh: TimeInterval = 24 * 60 * 60

    public private(set) var state = ShareState()
    @ObservationIgnored private(set) var attest: Attest?

    @ObservationIgnored private let transport: any ShareTransport
    /// Now, epoch s, by the system's clock (`AppClock.system`), as every time
    /// here is: sharing deals with the server and Apple, and sends nothing
    /// under a debug build's altered clock (`AppClock`).
    @ObservationIgnored private let nowS: @MainActor () -> Double
    /// What sharing needs of the planner, read when it needs it
    /// (`ShareHost`).
    @ObservationIgnored private var host: ShareHost?
    /// The run under way, if one is, and the last `resume`.
    @ObservationIgnored private(set) var run: Task<Void, Never>?
    @ObservationIgnored private(set) var resuming: Task<Void, Never>?
    @ObservationIgnored private var again = false

    private static let stateKey = StoreRegistry.share.key
    private static let attestKey = StoreRegistry.shareAttest.key

    public init(
        transport: any ShareTransport,
        nowS: @escaping @MainActor () -> Double = { AppClock.system.timeIntervalSince1970 }
    ) {
        self.transport = transport
        self.nowS = nowS
    }

    /// A random version 4 UUID, lower case, as the server takes it.
    nonisolated static func newUid() -> String { UUID().uuidString.lowercased() }

    // MARK: - Kept

    private func save(_ next: ShareState) {
        state = next
        if let data = storedShare(next) {
            Stores.set(data, forKey: Self.stateKey)
        }
    }

    private func saveAttest(_ next: Attest?) {
        attest = next
        if let next, let data = try? JSONEncoder().encode(next) {
            Stores.set(data, forKey: Self.attestKey)
        } else {
            Stores.remove(Self.attestKey)
        }
    }

    /// Read what is kept, against the log as it now is, and send whatever is
    /// owed: a deletion not yet confirmed first, then any final egg. Once, at
    /// launch, after the planner has loaded.
    public func start(host: ShareHost) {
        self.host = host
        let defaults = Stores.store
        state = reconciled(readStoredShare(defaults.data(forKey: Self.stateKey)), logLength: host.log().count)
        attest = defaults.data(forKey: Self.attestKey).flatMap { try? JSONDecoder().decode(Attest.self, from: $0) }
        resume()
    }

    /// Whatever is owed, again: at launch, back in the foreground, after an
    /// egg is final.
    public func resume() {
        resuming = Task {
            await retryDeletes()
            sendFinal()
        }
    }

    public func setSharing(_ on: Bool) {
        guard on != state.on else { return }
        save(on ? turnedOn(state, fresh: Self.newUid()) : turnedOff(state))
        if on { sendFinal() }
    }

    /// Forget everything: paired with the calibration's reset. The next egg
    /// is a new cook's, under a new id and, when it sends, a new key.
    public func forget() {
        save(forgotten(state, fresh: Self.newUid()))
    }

    // MARK: - Sending

    /// Whether `uid` is still the id this phone sends under: sharing not
    /// turned off, nor everything forgotten or deleted, since a run began
    /// sending for it. What lands for an id no longer sent under - an
    /// answer, a key, an attestation - lands on nothing, so a deletion
    /// cannot be undone by a send or an attestation landing after it.
    private func sending(_ uid: String) -> Bool { state.on && state.uid == uid }

    /// Send every final egg not yet sent, one at a time. A call while a run
    /// is going asks it to go round again.
    public func sendFinal() {
        if run != nil {
            again = true
            return
        }
        run = Task {
            repeat {
                again = false
                await sendRun()
            } while again
            run = nil
        }
    }

    private func sendRun() async {
        // Nothing goes under a debug build's altered clock (`AppClock`).
        guard let host, !AppClock.altered else { return }
        var attestedFor: String?
        var keyId: String?
        while true {
            let s = state
            let log = host.log()
            guard let at = nextToSend(s, finalCount: host.finalCount(), logLength: log.count),
                  let uid = s.uid else { return }
            // An egg recorded under a debug build's altered clock is never
            // sent, nor anything after it: none is ever made by a Release
            // build, and a debug install shares again after Forget
            // everything.
            guard !AppClock.marked(log[at].appVersion) else { return }
            if attestedFor != uid {
                let key = await attestedKey(for: uid)
                guard sending(uid) else { return }
                switch key {
                case .key(let id): keyId = id
                case .open: keyId = nil
                // Not yet: the run stops, and the next one tries again.
                case .later: return
                }
                attestedFor = uid
            }
            var copy = log[at]
            copy.uid = uid
            guard let body = try? Self.body(seq: s.seq, record: copy) else { return }
            var assertion: String?
            if let signing = keyId {
                switch await self.assertion(keyId: signing, body: body, uid: uid) {
                case .key(let a): assertion = a
                case .open: keyId = nil
                case .later: return
                }
            }
            guard sending(uid) else { return }
            // No answer: offline, most likely, so nothing else would get
            // through either. The next run tries again, uncounted.
            guard let status = await transport.post("api/eggs", body: body, assertion: assertion) else { return }
            guard sending(uid) else { return }
            let answer = answered(state, status: status, nowS: nowS())
            save(answer.next)
            guard answer.moved else { return }
        }
    }

    private struct Upload: Encodable {
        var seq: Int
        var record: EggRecord
    }

    static func body(seq: Int, record: EggRecord) throws -> Data {
        try JSONEncoder().encode(Upload(seq: seq, record: record))
    }

    // MARK: - App Attest

    /// What App Attest gave: a key (or an assertion), the open tier for good
    /// - the phone cannot attest, the server will not take its key, or it
    /// has waited long enough - or not yet, a passing failure, so the run
    /// stops and the next one tries again.
    enum Attested {
        case key(String)
        case open
        case later
    }

    /// This id's attested key, attesting it if it has not been. Nothing is
    /// kept or sent once the id is no longer sent under (`sending`) -
    /// sharing turned off, or everything deleted, while Apple was answering.
    private func attestedKey(for uid: String) async -> Attested {
        guard transport.canAttest else { return .open }
        var a = attest?.uid == uid ? attest! : Attest(uid: uid, keyId: nil, attestation: nil, status: .pending)
        switch a.status {
        case .attested: return a.keyId.map(Attested.key) ?? .open
        case .failed: return .open
        case .pending: break
        }
        do {
            if a.keyId == nil {
                let made = try await transport.generateKey()
                guard sending(uid) else { return .later }
                a.keyId = made
                saveAttest(a)
            }
            guard let keyId = a.keyId else { return .open }
            if a.attestation == nil {
                let hash = Data(SHA256.hash(data: Data(uid.utf8)))
                let made = try await transport.attestKey(keyId, clientDataHash: hash).base64EncodedString()
                guard sending(uid) else { return .later }
                a.attestation = made
                a.madeAtS = nowS()
                saveAttest(a)
            }
            let body = try JSONEncoder().encode(["uid": uid, "keyId": keyId, "attestation": a.attestation ?? ""])
            // No answer: offline, so no egg would get through either. The
            // next run tries again, uncounted.
            guard let status = await transport.post("api/attest", body: body, assertion: nil) else { return .later }
            guard sending(uid) else { return .later }
            switch shareReply(status) {
            case .kept:
                a.status = .attested
                a.busy = nil
                a.busySinceS = nil
            case .busy:
                // Busy, limited or out of reach (403, 404, 408, 429, 5xx):
                // the next run, for a while.
                return waited(a)
            case .refused:
                if status == 400, let made = a.madeAtS, nowS() - made > Self.attestationFresh {
                    // Posted days after Apple made it - the phone was offline -
                    // and refused, most likely for its certificate's date: a
                    // new key, attested now, on the next run.
                    saveAttest(Attest(uid: uid, keyId: nil, attestation: nil, status: .pending))
                    return .later
                }
                // Refused (400), another key for this id (409), or another
                // refusal of the request itself (413, 415, 422, ...), which
                // no retry changes: open, so the eggs still go.
                a.status = .failed
            }
        } catch AttestFailure.busy {
            // Apple's service is busy, or out of reach: the next run, for a
            // while.
            guard sending(uid) else { return .later }
            return waited(a)
        } catch {
            guard sending(uid) else { return .later }
            a.status = .failed
        }
        saveAttest(a)
        return a.status == .attested ? a.keyId.map(Attested.key) ?? .open : .open
    }

    /// The key's signature over this body, base64. A key the phone no longer
    /// holds (`invalidKey`) is given up on for this id, which then sends open;
    /// anything else waits for the next run, counted, as a busy attestation
    /// does (`waited`).
    private func assertion(keyId: String, body: Data, uid: String) async -> Attested {
        let hash = Data(SHA256.hash(data: body))
        do {
            let made = try await transport.assertion(keyId, clientDataHash: hash)
            if sending(uid), var a = attest, a.uid == uid, a.busy != nil {
                a.busy = nil
                a.busySinceS = nil
                saveAttest(a)
            }
            return .key(made.base64EncodedString())
        } catch AttestFailure.invalidKey {
            if sending(uid), var a = attest, a.uid == uid {
                a.status = .failed
                saveAttest(a)
            }
            return .open
        } catch {
            guard sending(uid), let a = attest, a.uid == uid else { return .later }
            return waited(a)
        }
    }

    /// A passing failure of the attestation or of a signature, counted. Once
    /// it has gone on long enough (`shareGivesUp`: five tries and three
    /// days, `ShareQueue.swift` says why), the key is given up on for this
    /// id, which then sends open, as a phone that lost its key does: an outage
    /// that does not pass, or a service out of reach from where the phone
    /// is, must not stop its sharing for good.
    private func waited(_ attest: Attest) -> Attested {
        var a = attest
        let now = nowS()
        let since = a.busySinceS ?? now
        let busy = (a.busy ?? 0) + 1
        if shareGivesUp(tries: busy, waitedS: now - since) {
            a.status = .failed
            a.busy = nil
            a.busySinceS = nil
            saveAttest(a)
            return .open
        }
        a.busy = busy
        a.busySinceS = since
        saveAttest(a)
        return .later
    }

    // MARK: - Deleting

    /// "Delete what I've sent", confirmed: off, and every id asked for, after
    /// any egg already on its way has landed.
    public func deleteSent() async {
        save(deletionAsked(state))
        saveAttest(nil)
        await run?.value
        await retryDeletes()
    }

    /// Ask the server to delete every id it has not yet confirmed.
    public func retryDeletes() async {
        for uid in state.deleting {
            guard let status = await transport.delete("api/eggs/\(uid)") else { return }
            if deletionDone(status) { save(deletionConfirmed(state, uid: uid)) }
        }
    }
}

extension Sharing: ResultSharing {}

/// What sharing reaches outside the app: the server, and Apple's App Attest
/// (`DCAppAttestService`). The app's is `ShareNetwork`; the tests fill it with a
/// fake.
@MainActor
public protocol ShareTransport: AnyObject {
    /// The server's status for a request to this path, or nil when the
    /// network did not answer.
    func post(_ path: String, body: Data, assertion: String?) async -> Int?
    func delete(_ path: String) async -> Int?
    /// Whether this phone can attest at all: not a simulator, nor an old
    /// phone.
    var canAttest: Bool { get }
    /// A new key in the Secure Enclave: its id.
    func generateKey() async throws -> String
    /// Apple's attestation of the key, over this hash.
    func attestKey(_ keyId: String, clientDataHash: Data) async throws -> Data
    /// The key's signature over this hash.
    func assertion(_ keyId: String, clientDataHash: Data) async throws -> Data
}

/// What a `ShareTransport` throws for the two App Attest failures sharing
/// tells apart; anything else it throws gives up on the key.
public enum AttestFailure: Error {
    /// Apple's service is busy, or out of reach: try again later.
    case busy
    /// The phone no longer holds the key.
    case invalidKey
}
