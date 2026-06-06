import AppIntents
import Foundation

// App Intent that POSTs a bank SMS to Masareef's ingest endpoint, creating a
// pending transaction. Declared via AppShortcutsProvider so the action appears
// in the Shortcuts app AUTOMATICALLY after the app is installed — no file import.
//
// The user wires it into a "Message Contains …" automation and sets:
//   • Message  → the Shortcut Input (the received SMS)
//   • Token    → their Masareef token (Settings → SMS Auto-Capture)
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

  @Parameter(title: "Masareef Token")
  var token: String

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$text) to Masareef")
  }

  func perform() async throws -> some IntentResult {
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
