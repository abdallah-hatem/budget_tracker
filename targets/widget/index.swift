import WidgetKit
import SwiftUI

// Must match src/features/widget/sync.ts (APP_GROUP) and snapshot.ts (WIDGET_SNAPSHOT_KEY).
private let appGroup = "group.com.abdallah.masareef"
private let snapshotKey = "snapshot"

// MARK: - Shared payload (mirrors WidgetSnapshot in snapshot.ts)

struct WCategory: Codable, Identifiable {
  let label: String
  let amount: String
  let color: String
  let fraction: Double
  var id: String { label }
}

struct WSnapshot: Codable {
  let v: Int
  let rtl: Bool
  let spentLabel: String
  let spent: String
  let todayLabel: String
  let today: String
  let emptyText: String
  let categories: [WCategory]
  let updatedAt: Double

  static let empty = WSnapshot(
    v: 1, rtl: false, spentLabel: "Spent this month", spent: "E£ 0",
    todayLabel: "Today", today: "E£ 0", emptyText: "No spending yet",
    categories: [], updatedAt: 0
  )

  static let preview = WSnapshot(
    v: 1, rtl: false, spentLabel: "Spent this month", spent: "E£ 1,250",
    todayLabel: "Today", today: "E£ 90", emptyText: "No spending yet",
    categories: [
      WCategory(label: "Food", amount: "E£ 600", color: "#FF8A5C", fraction: 1.0),
      WCategory(label: "Transport", amount: "E£ 320", color: "#5C9DFF", fraction: 0.53),
      WCategory(label: "Shopping", amount: "E£ 180", color: "#C792EA", fraction: 0.3),
    ], updatedAt: 0
  )
}

// MARK: - Timeline

struct MasareefEntry: TimelineEntry {
  let date: Date
  let snapshot: WSnapshot
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> MasareefEntry {
    MasareefEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (MasareefEntry) -> Void) {
    completion(MasareefEntry(date: Date(), snapshot: context.isPreview ? .preview : load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MasareefEntry>) -> Void) {
    let entry = MasareefEntry(date: Date(), snapshot: load())
    // The app calls reloadWidget() on every write; this is just a fallback refresh.
    let next = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date().addingTimeInterval(7200)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  private func load() -> WSnapshot {
    guard
      let defaults = UserDefaults(suiteName: appGroup),
      let raw = defaults.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(WSnapshot.self, from: data)
    else { return .empty }
    return decoded
  }
}

// MARK: - Views

private extension Color {
  init(hex: String) {
    let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    var rgb: UInt64 = 0
    Scanner(string: s).scanHexInt64(&rgb)
    self = Color(
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255
    )
  }
}

private let canvas = Color(hex: "#0B0F0E")
private let surface = Color(hex: "#14191A")
private let track = Color(hex: "#1C2322")
private let ink = Color(hex: "#F4F7F5")
private let ink2 = Color(hex: "#A8B2AF")
private let ink3 = Color(hex: "#6B7672")
private let accent = Color(hex: "#2BD98E")
private let onAccent = Color(hex: "#06251A")

struct CategoryBar: View {
  let cat: WCategory
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Text(cat.label)
          .font(.system(size: 11, weight: .medium))
          .foregroundColor(ink)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(cat.amount)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(ink2)
          .lineLimit(1)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(track)
          Capsule()
            .fill(Color(hex: cat.color))
            .frame(width: max(6, geo.size.width * cat.fraction))
        }
      }
      .frame(height: 4)
    }
  }
}

struct QuickAddButton: View {
  let systemName: String
  let url: String
  let filled: Bool
  var body: some View {
    Link(destination: URL(string: url)!) {
      Image(systemName: systemName)
        .font(.system(size: 15, weight: filled ? .bold : .semibold))
        .foregroundColor(filled ? onAccent : accent)
        .frame(width: 36, height: 36)
        .background(filled ? accent : surface)
        .clipShape(Circle())
        .overlay(
          Circle().stroke(accent.opacity(filled ? 0 : 0.4), lineWidth: 1)
        )
    }
  }
}

struct MasareefWidgetView: View {
  let entry: MasareefEntry
  private var snap: WSnapshot { entry.snapshot }

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      // Left — spend + quick add
      VStack(alignment: .leading, spacing: 0) {
        Text(snap.spentLabel)
          .font(.system(size: 11, weight: .medium))
          .foregroundColor(ink2)
          .lineLimit(1)
        Text(snap.spent)
          .font(.system(size: 25, weight: .bold, design: .rounded))
          .foregroundColor(ink)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text("\(snap.todayLabel) · \(snap.today)")
          .font(.system(size: 11))
          .foregroundColor(ink3)
          .lineLimit(1)
          .padding(.top, 2)
        Spacer(minLength: 8)
        HStack(spacing: 8) {
          QuickAddButton(systemName: "mic.fill", url: "masareef://capture?mode=voice", filled: true)
          QuickAddButton(systemName: "keyboard", url: "masareef://capture?mode=type", filled: false)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      // Right — top categories (or empty hint)
      VStack(alignment: .leading, spacing: 9) {
        if snap.categories.isEmpty {
          Text(snap.emptyText)
            .font(.system(size: 12))
            .foregroundColor(ink3)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
          ForEach(snap.categories) { CategoryBar(cat: $0) }
          Spacer(minLength: 0)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .environment(\.layoutDirection, snap.rtl ? .rightToLeft : .leftToRight)
  }
}

// MARK: - Widget

struct MasareefWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MasareefWidget", provider: Provider()) { entry in
      MasareefWidgetView(entry: entry)
        .containerBackground(canvas, for: .widget)
    }
    .configurationDisplayName("Masareef")
    .description("This month's spending, with quick add.")
    .supportedFamilies([.systemMedium])
  }
}

@main
struct MasareefWidgetBundle: WidgetBundle {
  var body: some Widget {
    MasareefWidget()
  }
}
