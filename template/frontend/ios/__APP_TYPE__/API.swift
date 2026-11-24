import Foundation

// The app's backend: the same routes the web frontend uses, at
// waynezhu.dev/api/__APP__/ (Caddy strips the prefix, so the backend sees /api/...).
//
// Signing in: the shared passkey sign-in sets a browser cookie, which an app
// can't use. So the app sends an API key instead, as the auth service's README
// describes for callers that can't sign in: make one for __APP__ on the auth
// admin page and paste it into Settings. The backend's requireUser /
// CurrentUser accepts it like a signed-in browser.
enum Server {
    static let production = URL(string: "https://waynezhu.dev/api/__APP__")!
    /// `npm run dev` on this Mac, for the simulator. The backend's routes are
    /// under /api there, and AUTH_DEV_USER signs every request in.
    static let local = URL(string: "http://localhost:3001/api")!
}

struct User: Decodable {
    /// Stable for the account's lifetime. The backend keys data on it.
    let id: String
    let name: String
    /// The API key's name, when the request used one.
    let key: String?
}

enum APIError: LocalizedError {
    case signedOut
    case status(Int)

    var errorDescription: String? {
        switch self {
        case .signedOut: "Not signed in. Add an API key in Settings."
        case .status(let code): "The server answered \(code)."
        }
    }
}

@MainActor
@Observable
final class API {
    var apiKey: String? {
        didSet { Keychain.apiKey = apiKey }
    }
    var useLocal: Bool {
        didSet { UserDefaults.standard.set(useLocal, forKey: "useLocalBackend") }
    }

    init() {
        apiKey = Keychain.apiKey
        #if DEBUG
        useLocal = UserDefaults.standard.bool(forKey: "useLocalBackend")
        #else
        useLocal = false
        #endif
    }

    var base: URL { useLocal ? Server.local : Server.production }

    /// GETs a backend route, e.g. `try await api.get("me", as: User.self)`.
    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(URLRequest(url: base.appending(path: path)), as: type)
    }

    /// Sends a JSON body, e.g. `try await api.send("notes", method: "POST", body: note, as: Note.self)`.
    func send<T: Decodable, B: Encodable>(_ path: String, method: String, body: B, as type: T.Type = T.self) async throws -> T {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await send(request, as: type)
    }

    private func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        var request = request
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw APIError.signedOut }
        guard (200..<300).contains(status) else { throw APIError.status(status) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
