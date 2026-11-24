import SwiftUI

@main
struct __APP_TYPE__App: App {
    @State private var api = API()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(api)
        }
    }
}
