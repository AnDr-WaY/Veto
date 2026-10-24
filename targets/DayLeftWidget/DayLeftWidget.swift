//
//  DayLeftWidget.swift
//  Veto — DayLeftWidget target (iOS home-screen widget)
//
//  "How much of today is left": the widget fills ink over paper by the
//  fraction of the day that is still ahead, with the remaining time as
//  numbers. Two gallery entries share this file — "Time left today" and
//  "Time left · live seconds" (a self-ticking h:mm:ss timer); seconds are
//  a property of the widget, not an in-app setting. Appearance (fill
//  pattern, percent, number font) is written by the app into the shared
//  App Group (src/features/widget/preferences.ts) and re-read on every
//  timeline build. Time math is pure clock work —
//  no rule data needed. No third-party code: WidgetKit + SwiftUI only.
//
//  Design tokens mirror src/ui/tokens.ts (#0A0A0A ink / #FFFFFF paper);
//  dark mode inverts the pair so the fill stays "the darker, the stricter".
//

import SwiftUI
import WidgetKit

// MARK: - Appearance (mirrors src/features/widget/preferences.ts)

enum FillPattern: String {
  case solid
  case stripes
  case dots
}

enum NumberFont: String {
  case system
  case rounded
  case mono
}

struct Appearance {
  let pattern: FillPattern
  let showsPercent: Bool
  let font: NumberFont

  static let fallback = Appearance(pattern: .solid, showsPercent: true, font: .rounded)

  static func load(from defaults: UserDefaults?) -> Appearance {
    guard let defaults else { return .fallback }
    return Appearance(
      pattern: defaults.string(forKey: "veto_widget_pattern").flatMap(FillPattern.init(rawValue:))
        ?? .solid,
      showsPercent: defaults.object(forKey: "veto_widget_show_percent") as? Bool ?? true,
      font: defaults.string(forKey: "veto_widget_font").flatMap(NumberFont.init(rawValue:))
        ?? .rounded)
  }

  var design: Font.Design {
    switch font {
    case .system: return .default
    case .rounded: return .rounded
    case .mono: return .monospaced
    }
  }
}

// MARK: - Time math

private func endOfDay(for date: Date, calendar: Calendar = .current) -> Date {
  calendar.startOfDay(for: date).addingTimeInterval(24 * 60 * 60)
}

private func fractionLeft(at date: Date, calendar: Calendar = .current) -> Double {
  let remaining = endOfDay(for: date, calendar: calendar).timeIntervalSince(date)
  return min(1, max(0, remaining / (24 * 60 * 60)))
}

/// "5h 23m" / "5h" / "45m" — compact version of the app's formatDuration.
private func countdownText(seconds: TimeInterval) -> String {
  let minutes = Int(seconds / 60)
  let h = minutes / 60
  let m = minutes % 60
  if h > 0 && m > 0 { return "\(h)h \(m)m" }
  if h > 0 { return "\(h)h" }
  return "\(m)m"
}

// MARK: - Timeline

struct DayLeftEntry: TimelineEntry {
  let date: Date
  let appearance: Appearance
  /// Fixed per widget: `true` renders a live h:mm:ss timer, `false` a
  /// "4h 12m" label refreshed by per-minute timeline entries.
  let showsSeconds: Bool
}

private struct DayLeftProvider: TimelineProvider {
  /// Seconds are a property of the widget, not a setting: the gallery ships
  /// "Time left today" (per-minute label) and "Time left · live seconds"
  /// (self-ticking timer) as two separate, independently placeable widgets.
  let showsSeconds: Bool

  /// Same Info.plist key the other Veto extensions use (injected by the
  /// react-native-device-activity config plugin).
  private var defaults: UserDefaults? {
    guard
      let appGroup = Bundle.main.object(
        forInfoDictionaryKey: "REACT_NATIVE_DEVICE_ACTIVITY_APP_GROUP") as? String,
      let suite = UserDefaults(suiteName: appGroup)
    else { return nil }
    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
    return suite
  }

  func placeholder(in context: Context) -> DayLeftEntry {
    DayLeftEntry(date: Date(), appearance: .fallback, showsSeconds: showsSeconds)
  }

  func getSnapshot(in context: Context, completion: @escaping (DayLeftEntry) -> Void) {
    completion(
      DayLeftEntry(date: Date(), appearance: Appearance.load(from: defaults), showsSeconds: showsSeconds)
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DayLeftEntry>) -> Void) {
    let appearance = Appearance.load(from: defaults)
    let now = Date()
    let dayEnd = endOfDay(for: now)
    let total = dayEnd.timeIntervalSince(now)

    // With seconds the timer Text ticks on its own, so coarse quarter-hour
    // entries only step the fill. Without seconds the label is recomputed
    // per entry — one-minute steps keep it honest until the entry budget
    // runs out, then the reload request brings fresh ones (the system
    // throttles reloads, so the label may lag a few minutes late at worst).
    let step = showsSeconds ? max(15 * 60, total / 38) : 60
    var entries = [
      DayLeftEntry(date: now, appearance: appearance, showsSeconds: showsSeconds)
    ]
    var next = now.addingTimeInterval(step)
    while next < dayEnd && entries.count < 40 {
      entries.append(
        DayLeftEntry(date: next, appearance: appearance, showsSeconds: showsSeconds))
      next = next.addingTimeInterval(step)
    }
    // Just past midnight, so the widget rolls into the new day.
    entries.append(
      DayLeftEntry(date: dayEnd, appearance: appearance, showsSeconds: showsSeconds))

    if showsSeconds {
      completion(Timeline(entries: entries, policy: .atEnd))
    } else {
      completion(Timeline(entries: entries, policy: .after(entries[entries.count - 1].date)))
    }
  }
}

// MARK: - Pattern fill (ink over paper, Canvas-drawn hatch/dots)

private struct PatternFill: View {
  let fraction: Double
  let pattern: FillPattern
  let ink: Color
  let paper: Color

  var body: some View {
    Canvas { context, size in
      let clamped = CGFloat(min(1, max(0, fraction)))
      let rect = CGRect(
        x: 0, y: size.height * (1 - clamped), width: size.width, height: size.height * clamped)
      context.fill(Path(rect), with: .color(ink))

      switch pattern {
      case .solid:
        return
      case .stripes:
        context.clip(to: Path(rect))
        let step: CGFloat = 7
        var x: CGFloat = -size.height
        while x < size.width + size.height {
          var line = Path()
          line.move(to: CGPoint(x: x, y: size.height))
          line.addLine(to: CGPoint(x: x + size.height, y: 0))
          context.stroke(line, with: .color(paper.opacity(0.25)), lineWidth: 1.5)
          x += step
        }
      case .dots:
        context.clip(to: Path(rect))
        let step: CGFloat = 8
        let radius: CGFloat = 1.2
        var y = rect.minY + step / 2
        var row = 0
        while y < rect.maxY {
          var x = row % 2 == 0 ? step / 2 : step
          while x < size.width {
            let dot = Path(
              ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
            context.fill(dot, with: .color(paper.opacity(0.25)))
            x += step
          }
          y += step
          row += 1
        }
      }
    }
  }
}

/// Horizontal counterpart of PatternFill for the day bars: ink covers the
/// leading `fraction` of the canvas, with the pattern texture clipped to
/// the inked region only (stripes/dots drawn in translucent paper, exactly
/// like the full-bleed fill).
private struct BarFill: View {
  let fraction: Double
  let pattern: FillPattern
  let ink: Color
  let paper: Color

  var body: some View {
    Canvas { context, size in
      let clamped = CGFloat(min(1, max(0, fraction)))
      let rect = CGRect(x: 0, y: 0, width: size.width * clamped, height: size.height)
      context.fill(Path(rect), with: .color(ink))

      switch pattern {
      case .solid:
        return
      case .stripes:
        guard rect.width > 0 else { return }
        context.clip(to: Path(rect))
        let step: CGFloat = 7
        var x: CGFloat = -size.height
        while x < rect.maxX {
          var line = Path()
          line.move(to: CGPoint(x: x, y: size.height))
          line.addLine(to: CGPoint(x: x + size.height, y: 0))
          context.stroke(line, with: .color(paper.opacity(0.25)), lineWidth: 1.5)
          x += step
        }
      case .dots:
        guard rect.width > 0 else { return }
        context.clip(to: Path(rect))
        let step: CGFloat = 8
        let radius: CGFloat = 1.2
        var x = step / 2
        while x < rect.maxX {
          var y = rect.minY + step / 2
          while y < rect.maxY {
            let dot = Path(
              ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
            context.fill(dot, with: .color(paper.opacity(0.25)))
            y += step
          }
          x += step
        }
      }
    }
  }
}

// MARK: - Views

private struct DayLeftWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  let entry: DayLeftEntry

  private var ink: Color {
    colorScheme == .dark ? .white : Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
  }

  private var paper: Color {
    colorScheme == .dark ? Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255) : .white
  }

  private var fraction: Double { fractionLeft(at: entry.date) }
  private var percent: Int { Int(round(fraction * 100)) }
  private var countdown: String {
    countdownText(seconds: endOfDay(for: entry.date).timeIntervalSince(entry.date))
  }

  var body: some View {
    content
      .widgetBackground(family.accessoryFamily ? nil : paper)
      .widgetURL(URL(string: "veto://"))
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryCircular: circular
    case .accessoryRectangular: rectangular
    case .accessoryInline: inline
    case .systemSmall: small
    case .systemMedium: medium
    case .systemLarge: large
    default: medium
    }
  }

  /// Small 2×2: the countdown is the single hero, centered; one quiet
  /// secondary line under it (the percent when enabled, otherwise the
  /// label) and a slim day bar pinned to the bottom. Nothing else.
  private var small: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      Text(countdown)
        .font(.system(size: 30, weight: .bold, design: entry.appearance.design))
        .monospacedDigit()
        .minimumScaleFactor(0.5)
        .lineLimit(1)
      Text(entry.appearance.showsPercent ? "\(percent)%" : "left today")
        .font(.system(.footnote, design: entry.appearance.design))
        .opacity(0.55)
        .lineLimit(1)
        .padding(.top, 2)
      Spacer(minLength: 0)
      dayBar
        .frame(height: 6)
        .padding(.top, 12)
    }
    .padding(12)
  }

  /// Large: the hero countdown floats above a single full-width day bar
  /// with 00:00 → 24:00 markers. One reading, one bar — no stacked
  /// percentages, no fill tank competing with the numbers.
  private var large: some View {
    VStack(alignment: .leading, spacing: 0) {
      Spacer(minLength: 0)
      Text(countdown)
        .font(.system(size: 60, weight: .bold, design: entry.appearance.design))
        .monospacedDigit()
        .minimumScaleFactor(0.5)
        .lineLimit(1)
      Text(entry.appearance.showsPercent ? "\(percent)% of the day left" : "left today")
        .font(.system(.title3, design: entry.appearance.design))
        .opacity(0.55)
        .lineLimit(1)
        .padding(.top, 4)
      Spacer(minLength: 0)
      dayBar
        .frame(height: 10)
      HStack {
        Text("00:00")
        Spacer(minLength: 0)
        Text("24:00")
      }
      .font(.system(.caption, design: entry.appearance.design).weight(.medium))
      .monospacedDigit()
      .opacity(0.4)
      .padding(.top, 6)
    }
    .padding(16)
  }

  /// The whole day as one slim track; the inked leading part is the time
  /// still ahead — full at midnight, draining toward 24:00. The fill
  /// carries the chosen pattern (solid / stripes / dots) at texture level,
  /// so the appearance setting still reads without any extra UI.
  private var dayBar: some View {
    ZStack(alignment: .leading) {
      Capsule().fill(ink.opacity(0.12))
      BarFill(fraction: fraction, pattern: entry.appearance.pattern, ink: ink, paper: paper)
    }
    .clipShape(Capsule())
  }

  private var medium: some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text(countdown)
          .font(.system(size: 30, weight: .bold, design: entry.appearance.design))
          .minimumScaleFactor(0.5)
          .lineLimit(1)
        Text("left today")
          .font(.system(size: 13, weight: .medium, design: entry.appearance.design))
          .opacity(0.6)
        if entry.appearance.showsPercent {
          Text("\(percent)% of the day")
            .font(.system(size: 12, design: entry.appearance.design))
            .opacity(0.4)
        }
      }
      .foregroundStyle(ink)
      Spacer(minLength: 0)
      // The "day tank": same bottom-up fill, framed like a Card.
      PatternFill(fraction: fraction, pattern: entry.appearance.pattern, ink: ink, paper: paper)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
          RoundedRectangle(cornerRadius: 12).strokeBorder(ink.opacity(0.2), lineWidth: 0.5)
        )
        .frame(width: 72)
    }
    .padding(16)
  }

  /// Lock-screen circular: the ring is the fill.
  private var circular: some View {
    Gauge(value: fraction, in: 0...1) {
      Image(systemName: "hourglass")
    } currentValueLabel: {
      Text("\(percent)%")
        .font(.system(.body, design: entry.appearance.design).weight(.semibold))
        .minimumScaleFactor(0.5)
    }
    .gaugeStyle(.accessoryCircular)
  }

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      // With seconds: live-ticking timer text (WidgetKit re-renders it
      // outside the reload budget). Without: the per-minute entry label.
      if entry.showsSeconds {
        Text(timerInterval: entry.date...endOfDay(for: entry.date), countsDown: true)
          .font(.system(.body, design: entry.appearance.design).weight(.bold))
          .monospacedDigit()
      } else {
        Text(countdown)
          .font(.system(.body, design: entry.appearance.design).weight(.bold))
          .monospacedDigit()
      }
      Text(entry.appearance.showsPercent ? "\(percent)% left today" : "left today")
        .font(.system(.body, design: entry.appearance.design))
        .opacity(0.6)
      Gauge(value: fraction, in: 0...1) { }
        .gaugeStyle(.accessoryLinearCapacity)
    }
  }

  private var inline: some View {
    Text(entry.appearance.showsPercent ? "\(countdown) · \(percent)% left today" : "\(countdown) left today")
      .font(.system(.body, design: entry.appearance.design))
  }
}

private extension WidgetFamily {
  /// Accessory families render with system colors — no custom background.
  var accessoryFamily: Bool {
    self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline
  }
}

private extension View {
  /// iOS 17 requires containerBackground for widgets; iOS 16 uses padding
  /// + background (Apple's own migration pattern).
  @ViewBuilder
  func widgetBackground(_ color: Color?) -> some View {
    if #available(iOSApplicationExtension 17.0, *), let color {
      containerBackground(for: .widget) { color }
    } else if let color {
      background(color)
    } else {
      self
    }
  }
}

// MARK: - Widgets

struct DayLeftWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DayLeftWidget", provider: DayLeftProvider(showsSeconds: false)) {
      entry in
      DayLeftWidgetView(entry: entry)
    }
    .configurationDisplayName("Time left today")
    .description("Fills ink over paper by the fraction of the day that is still ahead.")
    .supportedFamilies([
      .systemSmall, .systemMedium, .systemLarge,
      .accessoryCircular, .accessoryRectangular, .accessoryInline,
    ])
  }
}

/// Second gallery entry: identical meter, but the clock ticks h:mm:ss in
/// place — placed independently of the plain one.
struct DayLeftLiveWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DayLeftLiveWidget", provider: DayLeftProvider(showsSeconds: true)) {
      entry in
      DayLeftWidgetView(entry: entry)
    }
    .configurationDisplayName("Time left · live seconds")
    .description("Same day meter with a live h:mm:ss countdown ticking in place.")
    .supportedFamilies([
      .systemSmall, .systemMedium, .systemLarge,
      .accessoryCircular, .accessoryRectangular, .accessoryInline,
    ])
  }
}

@main
struct DayLeftWidgetBundle: WidgetBundle {
  var body: some Widget {
    DayLeftWidget()
    DayLeftLiveWidget()
    // buildLimitedAvailability: the Live Activity card needs ActivityKit
    // (iOS 16.1+) while this extension deploys at 16.0 — the `if` must be
    // the last item in the bundle body.
    if #available(iOSApplicationExtension 16.1, *) {
      BlockingActivityWidget()
    }
  }
}
