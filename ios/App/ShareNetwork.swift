import Foundation
import DeviceCheck
import EggTimerApp

/// Sharing's requests and App Attest, for EggTimerApp's `Sharing`, which runs
/// the sends and decides what each answer means: this only talks, to the
/// server over URLSession and to Apple through `DCAppAttestService`.
@MainActor
final class ShareNetwork: ShareTransport {
    /// The site the web app is served from, which hosts the endpoint. A
    /// debug build can point elsewhere with
    /// `-shareServer <url>`, for a local `netlify dev`.
    static var server: URL { Screenshots.shareServer ?? URL(string: "https://actualeggtimer.netlify.app")! }

    private static let assertionHeader = "x-egg-assertion"

    func post(_ path: String, body: Data, assertion: String?) async -> Int? {
        await Self.send("POST", path, body: body, assertion: assertion)
    }

    func delete(_ path: String) async -> Int? {
        await Self.send("DELETE", path)
    }

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

    var canAttest: Bool { DCAppAttestService.shared.isSupported }

    func generateKey() async throws -> String {
        try await Self.attesting { try await DCAppAttestService.shared.generateKey() }
    }

    func attestKey(_ keyId: String, clientDataHash: Data) async throws -> Data {
        try await Self.attesting { try await DCAppAttestService.shared.attestKey(keyId, clientDataHash: clientDataHash) }
    }

    func assertion(_ keyId: String, clientDataHash: Data) async throws -> Data {
        try await Self.attesting {
            try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: clientDataHash)
        }
    }

    /// Apple's two failures that sharing tells apart, as `AttestFailure`.
    private static func attesting<T>(_ call: () async throws -> T) async throws -> T {
        do {
            return try await call()
        } catch let error as DCError where error.code == .serverUnavailable {
            throw AttestFailure.busy
        } catch let error as DCError where error.code == .invalidKey {
            throw AttestFailure.invalidKey
        }
    }
}

extension Sharing {
    static let shared = Sharing(transport: ShareNetwork())
}
