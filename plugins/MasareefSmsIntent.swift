import AppIntents
import Foundation
import Security

// App Intent that POSTs a bank SMS to Masareef's ingest endpoint, creating a
// pending transaction. Declared via AppShortcutsProvider so the action appears
// in the Shortcuts app AUTOMATICALLY after install — no file import.
//
// The token is provisioned + stored by the app (expo-secure-store, Keychain),
// so the action needs NO token field — the user only maps the Message:
//   Automation → "Message Contains …" → Run "Log SMS to Masareef"
//                with Message = Shortcut Input.
//
// Guarded @available(iOS 16) so the app's deployment target can stay lower.

@available(iOS 16.0, *)
struct LogSmsToMasareef: AppIntent {
  static var title: LocalizedStringResource = "Log SMS to Masareef"
  static var description = IntentDescription(
    "Send a bank SMS to Masareef to create a pending transaction to review."
  )
  // Run silently in the background — never bring the app to the foreground.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Message")
  var text: String

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$text) to Masareef")
  }

  func perform() async throws -> some IntentResult {
    // The app stores the ingest token in the Keychain (no manual paste).
    guard let token = Self.readIngestToken(), !token.isEmpty else {
      return .result()
    }

    let endpoint = "https://pzyadiwfjmjsafssxshc.supabase.co/functions/v1/ingest-sms"
    // Public anon key (RLS-safe) — required by the Supabase gateway.
    let anonKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6eWFkaXdmam1qc2Fmc3N4c2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTgxODksImV4cCI6MjA5NjIzNDE4OX0.x8c2nINYkWT_PJeOwx3qYxJvD1-1TTWrO-GfpXcpBUM"

    guard let url = URL(string: endpoint) else { return .result() }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue(anonKey, forHTTPHeaderField: "apikey")
    let payload: [String: Any] = ["text": text, "token": token]
    req.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])

    // Best-effort POST; the server replies {ok:true} or {ok:true,skipped:true}.
    _ = try? await URLSession.shared.data(for: req)
    return .result()
  }

  // Reads the token expo-secure-store wrote with keychainService "masareef".
  // expo-secure-store stores GenericPassword items under service
  // "<keychainService>:no-auth" with account/generic = Data(key.utf8).
  static func readIngestToken() -> String? {
    let account = Data("ingestToken".utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "masareef:no-auth",
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}

@available(iOS 16.0, *)
struct MasareefAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogSmsToMasareef(),
      phrases: ["Log SMS to \(.applicationName)"],
      shortTitle: "Log SMS",
      systemImageName: "creditcard"
    )
  }
}
