//
//  BlockingActivity.swift
//  Veto — DayLeftWidget target (lock-screen Live Activity)
//
//  The card the app raises on the lock screen (and Dynamic Island) must
//  answer two things at a glance: a block is ON, and until WHAT TIME it
//  runs. Design: a near-black ink card (#0A0A0A) with a micro caption
//  (hourglass + uppercased title), and the hero — a live countdown ticking
//  in place — with a dim "until HH:mm" beside it. Monochrome, like the
//  rest of Veto. Only the app process can begin an activity — it is
//  started/stopped by the modules/veto-live-activity Expo module; this
//  target only renders it.
//
//  Design tokens mirror src/ui/tokens.ts (#0A0A0A ink / #FFFFFF paper).
//  The card paints its own ink background, so text is fixed paper-white —
//  not `.primary`, which would adapt to an appearance we don't follow.
//

import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// Must stay in sync with BlockingActivityAttributes in
// modules/veto-live-activity/ios/VetoLiveActivityModule.swift — app and
// extension cannot share a Swift module, each compiles its own copy.
@available(iOS 16.1, *)
struct BlockingActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// The countdown target.
    var endsAt: Date
  }

  let title: String
}

// MARK: - Shared pieces (lock screen + Dynamic Island)

private enum VetoLogo {
  /// assets/icon.png geometry, unit square: the wide triangular V, drawn
  /// from a traced path — no asset catalog in the extension bundle and no
  /// tile behind it. Keep in sync with the shield
  /// (ShieldConfigurationExtension.swift), which renders the same polygon.
  private static let markPoints: [CGPoint] = [
    CGPoint(x: 0.195, y: 0.223),
    CGPoint(x: 0.364, y: 0.223),
    CGPoint(x: 0.500, y: 0.376),
    CGPoint(x: 0.633, y: 0.223),
    CGPoint(x: 0.804, y: 0.223),
    CGPoint(x: 0.500, y: 0.773),
  ]

  static func image(side: CGFloat, color: UIColor = .white) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    return renderer.image { _ in
      let path = UIBezierPath()
      for (index, unit) in markPoints.enumerated() {
        let point = CGPoint(x: unit.x * side, y: unit.y * side)
        if index == 0 {
          path.move(to: point)
        } else {
          path.addLine(to: point)
        }
      }
      path.close()
      color.setFill()
      path.fill()
    }
  }
}

private extension Color {
  /// Design tokens (src/ui/tokens.ts): #0A0A0A ink / #FFFFFF paper.
  static let vetoInk = Color(red: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0A / 255.0)
  static let vetoPaper = Color.white
}

/// The live countdown. `Text(timerInterval:countsDown:)` ticks in place and
/// clamps to 0:00 once the interval is over — the plain
/// `Text(date, style: .timer)` would count back up instead. The lower bound
/// is clamped to `endsAt` so a window that is already over can never
/// produce an inverted range.
private func countdown(to endsAt: Date, size: CGFloat, weight: Font.Weight) -> some View {
  Text(timerInterval: min(Date(), endsAt)...endsAt, countsDown: true)
    .font(.system(size: size, weight: weight, design: .rounded))
    .monospacedDigit()
    .minimumScaleFactor(0.5)
    .lineLimit(1)
}

/// Dim secondary line: "until HH:mm". The time is localized by the system
/// via `Date.FormatStyle` (locale's own hour cycle and separators, no
/// formatter state); Text concatenation keeps the date part format-driven.
private func untilLine(_ endsAt: Date) -> Text {
  Text("until") + Text(" ") + Text(endsAt, format: .dateTime.hour().minute())
}

/// Once the window is over the countdown sits at 0:00; say it in words
/// instead of a time until the app process ends the activity.
private func footerLine(_ endsAt: Date) -> Text {
  Date() >= endsAt ? Text("ENDED") : untilLine(endsAt)
}

// MARK: - Lock screen

@available(iOS 16.1, *)
private struct BlockingActivityLockView: View {
  let context: ActivityViewContext<BlockingActivityAttributes>

  private var endsAt: Date { context.state.endsAt }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // Caption row: logo + uppercased title.
      HStack(spacing: 6) {
        Image(uiImage: VetoLogo.image(side: 15))
          .resizable()
          .frame(width: 15, height: 15)
        Text(context.attributes.title.uppercased())
          .font(.system(size: 11, weight: .semibold))
          .kerning(1.4)
          .lineLimit(1)
      }
      .opacity(0.6)

      // Key line: the ticking countdown, "until HH:mm" trailing.
      HStack(alignment: .firstTextBaseline) {
        countdown(to: endsAt, size: 34, weight: .bold)
        Spacer(minLength: 12)
        footerLine(endsAt)
          .font(.system(size: 13, weight: .medium))
          .lineLimit(1)
          .opacity(0.6)
      }
    }
    .foregroundStyle(Color.vetoPaper)
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .background(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(Color.vetoInk)
    )
  }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct BlockingActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BlockingActivityAttributes.self) { context in
      BlockingActivityLockView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(uiImage: VetoLogo.image(side: 20))
            .resizable()
            .frame(width: 20, height: 20)
            .foregroundStyle(Color.vetoPaper)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 3) {
            Text(context.attributes.title.uppercased())
              .font(.system(size: 11, weight: .semibold))
              .kerning(1.4)
              .lineLimit(1)
              .opacity(0.6)
            footerLine(context.state.endsAt)
              .font(.system(size: 13, weight: .medium))
              .lineLimit(1)
              .opacity(0.6)
          }
          .foregroundStyle(Color.vetoPaper)
        }
        DynamicIslandExpandedRegion(.trailing) {
          countdown(to: context.state.endsAt, size: 22, weight: .bold)
            .foregroundStyle(Color.vetoPaper)
        }
      } compactLeading: {
        Image(uiImage: VetoLogo.image(side: 13))
          .resizable()
          .frame(width: 13, height: 13)
          .foregroundStyle(Color.vetoPaper)
      } compactTrailing: {
        countdown(to: context.state.endsAt, size: 14, weight: .semibold)
          .foregroundStyle(Color.vetoPaper)
          .frame(maxWidth: 44)
      } minimal: {
        Image(uiImage: VetoLogo.image(side: 13))
          .resizable()
          .frame(width: 13, height: 13)
          .foregroundStyle(Color.vetoPaper)
      }
    }
  }
}
