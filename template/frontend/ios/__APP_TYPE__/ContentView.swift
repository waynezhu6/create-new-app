import SwiftUI

struct ContentView: View {
    @Environment(API.self) private var api
    @State private var health = "checking…"
    @State private var user: User?
    @State private var problem: String?
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            List {
                LabeledContent("Backend", value: health)
                if let user {
                    LabeledContent("Signed in as", value: user.name)
                }
                if let problem {
                    Text(problem).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("__APP__")
            .toolbar {
                Button("Settings", systemImage: "gear") { showingSettings = true }
            }
            .sheet(isPresented: $showingSettings, onDismiss: { Task { await load() } }) {
                SettingsView()
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            health = try await api.get("health", as: Health.self).status
        } catch {
            health = "unreachable"
        }
        do {
            user = try await api.get("me", as: User.self)
            problem = nil
        } catch {
            user = nil
            problem = error.localizedDescription
        }
    }
}

private struct Health: Decodable {
    let status: String
}

struct SettingsView: View {
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""

    var body: some View {
        @Bindable var api = api
        NavigationStack {
            Form {
                Section {
                    SecureField("wz_…", text: $key)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("API key")
                } footer: {
                    Text("Make one for __APP__ on the auth admin page (waynezhu.dev/apps/auth/) and paste it here. It's kept in the Keychain.")
                }
                #if DEBUG
                Section {
                    Toggle("Use the backend on this Mac", isOn: $api.useLocal)
                } footer: {
                    Text("For the simulator: npm run dev serves it on localhost:3001, signed in as AUTH_DEV_USER.")
                }
                #endif
            }
            .navigationTitle("Settings")
            .toolbar {
                Button("Done") {
                    api.apiKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
                    dismiss()
                }
            }
            .onAppear { key = api.apiKey ?? "" }
        }
    }
}
