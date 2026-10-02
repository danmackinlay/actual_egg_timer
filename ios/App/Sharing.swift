import Foundation
import CryptoKit
import DeviceCheck
import EggTimerCore

/// Sharing (E6; INFERENCE.md section 7, COLLECTIVE.md section 1): a cook who
/// turns it on sends every egg in the log to the collection endpoint, the
/// ones from before it was on included (DECISIONS.md 53), and can delete
/// everything this phone has sent. The web app's `src/ui/share.ts`, rule for
/// rule; what it keeps and why is said there.
///
/// What iOS adds is App Attest (DECISIONS.md 54). When an id first sends, the
/// phone makes a key in its Secure Enclave and has Apple attest it, bound to
/// the id (`clientDataHash = SHA256(uid)`), and posts the attestation; every
/// egg then carries an assertion - the key's signature over the body sent -
/// and the server files it in the attested tier. A phone that cannot attest
/// (a simulator, an old phone, Apple's service down, a refusal) sends anyway,
/// to the open tier. Nothing here ever stops an egg.
@MainActor
@Observable
final class Sharing {
    static let shared = Sharing()

    /// What is kept, as the web keeps it (`ShareState` in share.ts).
    struct State: Codable, Equatable {
        var on = false
        var uid: String?
        var sent = 0
        var seq = 0
        var uids: [String] = []
        var deleting: [String] = []
    }

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
    }

    private(set) var state = State()
    @ObservationIgnored private var attest: Attest?

    /// What sharing needs of the planner, read when it needs it.
    struct Host {
        var log: @MainActor () -> [EggRecord]
        /// How many of the log's eggs are final: all, unless the last is the
        /// egg on screen, whose answers may still come.
        var finalCount: @MainActor () -> Int
    }

    @ObservationIgnored private var host: Host?
    /// Bumped by every change of id, so a send in flight for an old one lands
    /// on nothing.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var run: Task<Void, Never>?
    @ObservationIgnored private var again = false

    private static let stateKey = "share.v1"
    private static let attestKey = "share.attest.v1"

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

    // MARK: - States: share.ts's, rule for rule

    nonisolated static func newUid() -> String { UUID().uuidString.lowercased() }

    static func turnedOn(_ s: State, mint: () -> String = newUid) -> State {
        var next = s
        next.on = true
        if next.uid == nil {
            let uid = mint()
            next.uid = uid
            next.sent = 0
            next.seq = 0
            next.uids.append(uid)
        }
        return next
    }

    static func forgotten(_ s: State, mint: () -> String = newUid) -> State {
        var next = s
        next.sent = 0
        next.seq = 0
        if s.on {
            let uid = mint()
            next.uid = uid
            next.uids.append(uid)
        } else {
            next.uid = nil
        }
        return next
    }

    static func deletionAsked(_ s: State) -> State {
        var deleting = s.deleting
        for uid in s.uids where !deleting.contains(uid) { deleting.append(uid) }
        return State(on: false, uid: nil, sent: 0, seq: 0, uids: [], deleting: deleting)
    }

    static func reconciled(_ s: State, logCount: Int) -> State {
        var next = s
        if next.sent > logCount { next.sent = 0 }
        return next
    }

    /// Kept (201), already kept (200), or refused for good (400, 413).
    static func advances(_ status: Int) -> Bool {
        status == 200 || status == 201 || status == 400 || status == 413
    }

    // MARK: - Kept

    private func save(_ next: State) {
        state = next
        if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.stateKey)
        }
    }

    private func saveAttest(_ next: Attest?) {
        attest = next
        if let next, let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.attestKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.attestKey)
        }
    }

    /// Read what is kept, against the log as it now is, and send whatever is
    /// owed: a deletion not yet confirmed first, then any final egg. Once, at
    /// launch, after the planner has loaded.
    func start(host: Host) {
        self.host = host
        let defaults = UserDefaults.standard
        let read = defaults.data(forKey: Self.stateKey).flatMap { try? JSONDecoder().decode(State.self, from: $0) }
        var s = read ?? State()
        if s.uid == nil { s.on = false }
        state = Self.reconciled(s, logCount: host.log().count)
        attest = defaults.data(forKey: Self.attestKey).flatMap { try? JSONDecoder().decode(Attest.self, from: $0) }
        resume()
    }

    /// Whatever is owed, again: at launch, back in the foreground, after an
    /// egg is final.
    func resume() {
        Task {
            await retryDeletes()
            sendFinal()
        }
    }

    func setSharing(_ on: Bool) {
        guard on != state.on else { return }
        generation &+= 1
        var next = state
        if on {
            next = Self.turnedOn(state)
        } else {
            next.on = false
        }
        save(next)
        if on { sendFinal() }
    }

    /// Forget everything: paired with the calibration's reset. The next egg
    /// is a new cook's, under a new id and, when it sends, a new key.
    func forget() {
        generation &+= 1
        save(Self.forgotten(state))
    }

    // MARK: - Sending

    /// Send every final egg not yet sent, one at a time. A call while a run
    /// is going asks it to go round again.
    func sendFinal() {
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
        guard let host else { return }
        var attestedFor: String?
        var keyId: String?
        while true {
            let s = state
            let log = host.log()
            let final = min(host.finalCount(), log.count)
            guard s.on, let uid = s.uid, s.sent < final else { return }
            let gen = generation
            if attestedFor != uid {
                keyId = await attestedKey(for: uid)
                attestedFor = uid
                guard gen == generation else { return }
            }
            var copy = log[s.sent]
            copy.uid = uid
            guard let body = try? Self.body(seq: s.seq, record: copy) else { return }
            let assertion = await assertion(keyId: keyId, body: body)
            guard gen == generation else { return }
            guard let status = await Self.send("POST", "api/eggs", body: body, assertion: assertion) else { return }
            guard gen == generation, Self.advances(status) else { return }
            var next = state
            next.sent += 1
            next.seq += 1
            save(next)
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

    /// This id's attested key, attesting it if it has not been; nil when the
    /// phone cannot, or the server would not take it - the open tier.
    private func attestedKey(for uid: String) async -> String? {
        let service = DCAppAttestService.shared
        guard service.isSupported else { return nil }
        var a = attest?.uid == uid ? attest! : Attest(uid: uid, keyId: nil, attestation: nil, status: .pending)
        switch a.status {
        case .attested: return a.keyId
        case .failed: return nil
        case .pending: break
        }
        do {
            if a.keyId == nil {
                a.keyId = try await service.generateKey()
                saveAttest(a)
            }
            guard let keyId = a.keyId else { return nil }
            if a.attestation == nil {
                let hash = Data(SHA256.hash(data: Data(uid.utf8)))
                a.attestation = try await service.attestKey(keyId, clientDataHash: hash).base64EncodedString()
                saveAttest(a)
            }
            let body = try JSONEncoder().encode(["uid": uid, "keyId": keyId, "attestation": a.attestation ?? ""])
            guard let status = await Self.send("POST", "api/attest", body: body) else { return nil }
            if status == 200 || status == 201 {
                a.status = .attested
            } else if status == 400 || status == 409 {
                a.status = .failed
            } else {
                return nil
            }
        } catch let error as DCError where error.code == .serverUnavailable {
            // Apple's service is busy: try again on the next run.
            return nil
        } catch {
            a.status = .failed
        }
        saveAttest(a)
        return a.status == .attested ? a.keyId : nil
    }

    /// The key's signature over this body, base64, or nil: no key, or the
    /// phone would not sign. Either way the egg still goes.
    private func assertion(keyId: String?, body: Data) async -> String? {
        guard let keyId else { return nil }
        let hash = Data(SHA256.hash(data: body))
        return try? await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: hash).base64EncodedString()
    }

    // MARK: - Deleting

    /// "Delete what I've sent", confirmed: off, and every id asked for, after
    /// any egg already on its way has landed.
    func deleteSent() async {
        generation &+= 1
        save(Self.deletionAsked(state))
        saveAttest(nil)
        await run?.value
        await retryDeletes()
    }

    /// Ask the server to delete every id it has not yet confirmed.
    func retryDeletes() async {
        for uid in state.deleting {
            guard let status = await Self.send("DELETE", "api/eggs/\(uid)") else { return }
            // 400 is an id the server will never hold: as done as a 200.
            if status == 200 || status == 400 {
                var next = state
                next.deleting.removeAll { $0 == uid }
                save(next)
            }
        }
    }
}
