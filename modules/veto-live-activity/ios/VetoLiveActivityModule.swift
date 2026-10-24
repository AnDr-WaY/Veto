//
//  VetoLiveActivityModule.swift
//  Veto — local Expo module (main app target)
//
//  Starts/stops the lock-screen Live Activity (ActivityKit) from JS. The
//  activity's UI lives in the DayLeftWidget extension
//  (targets/DayLeftWidget/BlockingActivity.swift); a widget extension
//  cannot begin an activity — only the app process can, which is this
//  module's whole job.
//
//  Expo Go never sees this module — the JS seam
//  (src/features/liveActivity/api.ts) no-ops there.
//

import ActivityKit
import ExpoModulesCore

/// ActivityKit payload of the lock-screen activity. Must stay in sync with
/// BlockingActivityAttributes in targets/DayLeftWidget/BlockingActivity.swift —
/// the app and the extension cannot share a Swift module, so each compiles
/// its own identical copy.
struct BlockingActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// The countdown target shown on the lock screen.
    var endsAt: Date
  }

  let title: String
}

public class VetoLiveActivityModule: Module {
  /// In-memory handle to the activity this process started; rebuilt from
  /// the system's running list in case the app was relaunched meanwhile.
  private var current: Activity<BlockingActivityAttributes>?

  public func definition() -> ModuleDefinition {
    Name("VetoLiveActivity")

    OnCreate {
      self.current = Activity<BlockingActivityAttributes>.activities.first
    }

    /// Live Activities can be disabled system-wide (or per app in Settings).
    Function("isAvailable") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    Function("isActive") { () -> Bool in
      self.resolveCurrent() != nil
    }

    /// `endsAt` is epoch milliseconds (JS Date.now() convention); the card
    /// ticks down to it on the lock screen and in the Dynamic Island.
    /// Starting a new activity ends the previous one — there is only ever
    /// one Veto card.
    AsyncFunction("start") { (title: String, endsAt: Double) -> Bool in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        return false
      }
      self.endCurrent()
      let state = BlockingActivityAttributes.ContentState(
        endsAt: Date(timeIntervalSince1970: endsAt / 1000)
      )
      do {
        self.current = try Activity.request(
          attributes: BlockingActivityAttributes(title: title),
          content: ActivityContent(state: state, staleDate: state.endsAt)
        )
        return true
      } catch {
        throw NSError(
          domain: "VetoLiveActivity",
          code: 1,
          userInfo: [
            NSLocalizedDescriptionKey: "ActivityKit start failed: \(error.localizedDescription)"
          ]
        )
      }
    }
    .runOnQueue(.main)

    AsyncFunction("stop") { () -> Bool in
      guard self.resolveCurrent() != nil else {
        return false
      }
      self.endCurrent()
      return true
    }
    .runOnQueue(.main)
  }

  /// The remembered handle if still active, else any running instance the
  /// system knows about (covers relaunches that lost the reference).
  private func resolveCurrent() -> Activity<BlockingActivityAttributes>? {
    if let current, current.activityState == .active {
      return current
    }
    let running = Activity<BlockingActivityAttributes>.activities.first { $0.activityState == .active }
    current = running
    return running
  }

  private func endCurrent() {
    guard let activity = resolveCurrent() else {
      return
    }
    // ActivityKit: end(_:dismissalPolicy:) is async throws; fire-and-forget
    // is enough here — the JS-visible result only reports success.
    let content = ActivityContent(
      state: BlockingActivityAttributes.ContentState(endsAt: Date()),
      staleDate: nil
    )
    Task {
      try? await activity.end(content, dismissalPolicy: .immediate)
    }
    current = nil
  }
}
