import Foundation
import CryptoKit
import DeviceCheck
import EggTimerCore
import EggTimerApp

/// Sharing (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): a cook who
/// turns it on sends every egg in the log to the collection endpoint, the
/// ones from before it was on included (DECISIONS.md 59), and can delete
/// everything this phone has sent. What it keeps, and how each step moves it,
/// is core's (`ShareState`, `src/core/share.ts`), which the web moves alike;
/// this holds it, writes it through and does the talking, as the web's
/// `src/ui/share.ts` does.
///
/// What iOS adds is App Attest (DECISIONS.md 60). When an id first sends, the
/// phone makes a key in its Secure Enclave and has Apple attest it, bound to
/// the id (`clientDataHash = SHA256(uid)`), and posts the attestation; every
/// egg then carries an assertion - the key's signature over the body sent -
/// and the server files it in the attested tier. A phone that cannot attest
/// (a simulator, an old phone, a refusal) sends anyway, to the open tier.
/// One that cannot attest yet (offline, Apple's service or the server busy)
/// waits and tries again on the next run, rather than send its whole log
/// open for good because of a passing failure - but not for ever: after
/// five busy answers and three days (`shareGivesUp`, core's policy) it gives
/// up on the key and sends open, as a phone that lost its key does. What an
/// answer means, for an egg as for an attestation, is core's `shareReply`.
@MainActor
@Observable
final class Sharing {
    static let shared = Sharing()

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
        /// When Apple made `attestation`, set with it. Its certificate is
        /// good for a few days, so one posted later is refused.
        var madeAt: Date?
        /// How many busy answers - the server's or Apple's - or signatures
        /// the phone could not make it has had, and when the first came:
        /// what `shareGivesUp` bounds. Absent when there are none.
        var busy: Int?
        var busySince: Date?
    }

    /// How old an attestation may be and still be refused for itself: one
    /// older is refused for its certificate's date, most likely, and the
    /// phone makes a new key and tries again.
    private static let attestationFresh: TimeInterval = 24 * 60 * 60

    private(set) var state = ShareState()
    @ObservationIgnored private var attest: Attest?

    /// What sharing needs of the planner, read when it needs it
    /// (`ShareHost`, in EggTimerApp).
    @ObservationIgnored private var host: ShareHost?
    /// Bumped by every change of id, so a send in flight for an old one lands
    /// on nothing.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var run: Task<Void, Never>?
    @ObservationIgnored private var again = false

    private static let stateKey = "sharing.v1"
    private static let attestKey = "sharing.attest.v1"

    private init() {}

    // MARK: - The server

    /// The site the web app is served from, which hosts the endpoint
    /// (DECISIONS.md 51). A debug build can point elsewhere with
    /// `-shareServer <url>`, for a local `netlify dev`.
    static var server: URL {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "shareServer"), let url = URL(string: s) { return url }
        #endif
        return URL(string: "https://actualeggtimer.netlify.app")!
    }

    private static let assertionHeader = "x-egg-assertion"

    /// A status for the request, or nil when the network did not answer.
    private static func send(
        _ method: String, _ path: String, body: Data? = nil, assertion: String? = nil
    ) async -> Int? {
        // Nothing goes out while a newer build's results are left alone
        // (`Stores`): the state that records what was sent cannot be kept.
        guard !Stores.readOnly else { return nil }
        var request = URLRequest(url: server.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 20
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        if let assertion { request.setValue(assertion, forHTTPHeaderField: assertionHeader) }
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return nil }
        return http.statusCode
    }

    // MARK: - Ids and time

    /// A random version 4 UUID, lower case, as the server takes it.
    nonisolated static func newUid() -> String { UUID().uuidString.lowercased() }

    /// Now, as core counts it: epoch ms. The system's clock, as every time
    /// here is: sharing deals with the server and Apple, and sends nothing
    /// under a debug build's altered clock (`AppClock`).
    private static func nowMs() -> Double { AppClock.system.timeIntervalSince1970 * 1000 }

    // MARK: - Kept

    /// What is kept, as `sharing.v1` has always held it: the JSON the web
    /// stores, but with `busySince` a `Date` as JSONEncoder wrote one (seconds
    /// since 2001), where core counts epoch ms, and with no key for an absent
    /// value. Read back by core's `readShareState`, which keeps every id it can
    /// from a damaged copy, so a deletion still pending is not lost with the
    /// rest.
    private static func stored(_ s: ShareState) -> Data? {
        var o = s.jsonObject.filter { !($0.value is NSNull) }
        if let ms = s.busySince { o["busySince"] = ms / 1000 - Date.timeIntervalBetween1970AndReferenceDate }
        return try? JSONSerialization.data(withJSONObject: o)
    }

    private static func read(_ data: Data?) -> ShareState {
        var s = readShareState(data.flatMap { try? JSONSerialization.jsonObject(with: $0) })
        s.busySince = s.busySince.map { ($0 + Date.timeIntervalBetween1970AndReferenceDate) * 1000 }
        return s
    }

    private func save(_ next: ShareState) {
        state = next
        if let data = Self.stored(next) {
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
    func start(host: ShareHost) {
        self.host = host
        let defaults = Stores.store
        state = reconciled(Self.read(defaults.data(forKey: Self.stateKey)), logLength: host.log().count)
        attest = defaults.data(forKey: Self.attestKey).flatMap { try? JSONDecoder().decode(Attest.self, from: $0) }
        resume()
    }

    /// Whatever is owed, again: at launch, back in the foreground, after an
    /// egg is final.
    func resume() {
        guard !Stores.readOnly else { return }
        Task {
            await retryDeletes()
            sendFinal()
        }
    }

    func setSharing(_ on: Bool) {
        guard !Stores.readOnly, on != state.on else { return }
        generation &+= 1
        save(on ? turnedOn(state, fresh: Self.newUid()) : turnedOff(state))
        if on { sendFinal() }
    }

    /// Forget everything: paired with the calibration's reset. The next egg
    /// is a new cook's, under a new id and, when it sends, a new key.
    func forget() {
        generation &+= 1
        save(forgotten(state, fresh: Self.newUid()))
    }

    // MARK: - Sending

    /// Send every final egg not yet sent, one at a time. A call while a run
    /// is going asks it to go round again.
    func sendFinal() {
        guard !Stores.readOnly else { return }
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
            let gen = generation
            if attestedFor != uid {
                let key = await attestedKey(for: uid, generation: gen)
                guard gen == generation else { return }
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
                switch await self.assertion(keyId: signing, body: body, uid: uid, generation: gen) {
                case .key(let a): assertion = a
                case .open: keyId = nil
                case .later: return
                }
            }
            guard gen == generation else { return }
            // No answer: offline, most likely, so nothing else would get
            // through either. The next run tries again, uncounted.
            guard let status = await Self.send("POST", "api/eggs", body: body, assertion: assertion) else { return }
            guard gen == generation else { return }
            let answer = answered(state, status: status, now: Self.nowMs())
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
    /// kept or sent once the generation has moved on - sharing turned off,
    /// or everything deleted, while Apple was answering - so a deletion
    /// cannot be undone by an attestation landing after it.
    private func attestedKey(for uid: String, generation gen: Int) async -> Attested {
        let service = DCAppAttestService.shared
        guard service.isSupported else { return .open }
        var a = attest?.uid == uid ? attest! : Attest(uid: uid, keyId: nil, attestation: nil, status: .pending)
        switch a.status {
        case .attested: return a.keyId.map(Attested.key) ?? .open
        case .failed: return .open
        case .pending: break
        }
        do {
            if a.keyId == nil {
                let made = try await service.generateKey()
                guard gen == generation else { return .later }
                a.keyId = made
                saveAttest(a)
            }
            guard let keyId = a.keyId else { return .open }
            if a.attestation == nil {
                let hash = Data(SHA256.hash(data: Data(uid.utf8)))
                let made = try await service.attestKey(keyId, clientDataHash: hash).base64EncodedString()
                guard gen == generation else { return .later }
                a.attestation = made
                a.madeAt = AppClock.system
                saveAttest(a)
            }
            let body = try JSONEncoder().encode(["uid": uid, "keyId": keyId, "attestation": a.attestation ?? ""])
            // No answer: offline, so no egg would get through either. The
            // next run tries again, uncounted.
            guard let status = await Self.send("POST", "api/attest", body: body) else { return .later }
            guard gen == generation else { return .later }
            switch shareReply(status) {
            case .kept:
                a.status = .attested
                a.busy = nil
                a.busySince = nil
            case .busy:
                // Busy, limited or out of reach (403, 404, 408, 429, 5xx):
                // the next run, for a while.
                return waited(a)
            case .refused:
                if status == 400, let made = a.madeAt, AppClock.system.timeIntervalSince(made) > Self.attestationFresh {
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
        } catch let error as DCError where error.code == .serverUnavailable {
            // Apple's service is busy, or out of reach: the next run, for a
            // while.
            guard gen == generation else { return .later }
            return waited(a)
        } catch {
            guard gen == generation else { return .later }
            a.status = .failed
        }
        saveAttest(a)
        return a.status == .attested ? a.keyId.map(Attested.key) ?? .open : .open
    }

    /// The key's signature over this body, base64. A key the phone no longer
    /// holds (`invalidKey`) is given up on for this id, which then sends open;
    /// anything else waits for the next run, counted, as a busy attestation
    /// does (`waited`).
    private func assertion(keyId: String, body: Data, uid: String, generation gen: Int) async -> Attested {
        let hash = Data(SHA256.hash(data: body))
        do {
            let made = try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: hash)
            if gen == generation, var a = attest, a.uid == uid, a.busy != nil {
                a.busy = nil
                a.busySince = nil
                saveAttest(a)
            }
            return .key(made.base64EncodedString())
        } catch let error as DCError where error.code == .invalidKey {
            if gen == generation, var a = attest, a.uid == uid {
                a.status = .failed
                saveAttest(a)
            }
            return .open
        } catch {
            guard gen == generation, let a = attest, a.uid == uid else { return .later }
            return waited(a)
        }
    }

    /// A passing failure of the attestation or of a signature, counted. Once
    /// it has gone on long enough (`shareGivesUp`: five tries and three
    /// days, core's policy says why), the key is given up on for this id,
    /// which then sends open, as a phone that lost its key does: an outage
    /// that does not pass, or a service out of reach from where the phone
    /// is, must not stop its sharing for good.
    private func waited(_ attest: Attest) -> Attested {
        var a = attest
        let now = AppClock.system
        let since = a.busySince ?? now
        let busy = (a.busy ?? 0) + 1
        if shareGivesUp(tries: busy, waitedS: now.timeIntervalSince(since)) {
            a.status = .failed
            a.busy = nil
            a.busySince = nil
            saveAttest(a)
            return .open
        }
        a.busy = busy
        a.busySince = since
        saveAttest(a)
        return .later
    }

    // MARK: - Deleting

    /// "Delete what I've sent", confirmed: off, and every id asked for, after
    /// any egg already on its way has landed.
    func deleteSent() async {
        guard !Stores.readOnly else { return }
        generation &+= 1
        save(deletionAsked(state))
        saveAttest(nil)
        await run?.value
        await retryDeletes()
    }

    /// Ask the server to delete every id it has not yet confirmed.
    func retryDeletes() async {
        for uid in state.deleting {
            guard let status = await Self.send("DELETE", "api/eggs/\(uid)") else { return }
            if deletionDone(status) { save(deletionConfirmed(state, uid: uid)) }
        }
    }
}

/// What the app's logic asks of sharing (`Services`, in EggTimerApp).
extension Sharing: ResultSharing {}
