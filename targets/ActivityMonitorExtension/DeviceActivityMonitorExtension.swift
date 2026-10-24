//
//  DeviceActivityMonitorExtension.swift
//  ActivityMonitorExtension
//
//  Created by Robert Herber on 2023-07-05.
//

import ActivityKit
import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings
import NotificationCenter
import os

/// Live Activity payload of a rule's block card. Must stay in sync with
/// BlockingActivityAttributes in targets/DayLeftWidget/BlockingActivity.swift
/// and modules/veto-live-activity — each target compiles its own identical
/// copy (ActivityKit matches activities across processes by type name).
struct BlockingActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// The countdown target shown on the lock screen.
    var endsAt: Date
  }

  let title: String
}

/// Mirror of the JS controller's handoff (src/features/liveActivity/
/// controller.ts): the mode and the day payload are written on every JS
/// sync, per-activity block payloads on every engine apply.
private enum VetoLiveActivityHandoff {
  static let modeKey = "veto_la_mode"
  static let dayKey = "veto_la_day"

  static func metaKey(activityName: String) -> String {
    "veto_la_\(activityName)"
  }

  static func payload(forKey key: String) -> (title: String, endsAt: Date)? {
    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
    guard let raw = userDefaults?.dictionary(forKey: key),
          let title = raw["title"] as? String,
          let endsAtMs = raw["endsAt"] as? Double
    else {
      return nil
    }
    return (title, Date(timeIntervalSince1970: endsAtMs / 1000))
  }

  static var mode: String {
    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
    return userDefaults?.string(forKey: modeKey) ?? "both"
  }
}

/// Starts / stops the lock-screen card at window boundaries while the app
/// process is dead — the JS controller can only act when the app runs.
@available(iOS 16.2, *)
private enum VetoLiveActivityControl {
  private static var current: Activity<BlockingActivityAttributes>?

  static func start(title: String, endsAt: Date) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      return
    }
    end()
    do {
      current = try Activity.request(
        attributes: BlockingActivityAttributes(title: title),
        content: ActivityContent(
          state: BlockingActivityAttributes.ContentState(endsAt: endsAt),
          staleDate: endsAt))
    } catch {
      current = nil
    }
  }

  static func end() {
    guard let activity = current ?? Activity<BlockingActivityAttributes>.activities.first else {
      return
    }
    Task {
      try? await activity.end(
        ActivityContent(
          state: BlockingActivityAttributes.ContentState(endsAt: Date()),
          staleDate: nil),
        dismissalPolicy: .immediate)
    }
    current = nil
  }

  /// A rule window just closed: hand the card to the day countdown when the
  /// user's mode includes it, otherwise tear it down. Activities without a
  /// payload (global pause, grace one-shots) leave the card untouched.
  static func windowEnded() {
    let mode = VetoLiveActivityHandoff.mode
    guard mode != "block" else {
      end()
      return
    }
    if let day = VetoLiveActivityHandoff.payload(forKey: VetoLiveActivityHandoff.dayKey) {
      start(title: day.title, endsAt: day.endsAt)
    } else {
      end()
    }
  }
}

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    logger.log("intervalDidStart")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalDidStart",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidStart"
    )

    notifyAppWithName(name: "intervalDidStart")

    // Window opened — show this rule's block card. No payload = not a rule
    // window (global pause, grace one-shot): leave the card as is.
    if #available(iOS 16.2, *),
       let meta = VetoLiveActivityHandoff.payload(forKey: VetoLiveActivityHandoff.metaKey(activityName: activity.rawValue)) {
      VetoLiveActivityControl.start(title: meta.title, endsAt: meta.endsAt)
    }
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    logger.log("intervalDidEnd")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd"
    )

    notifyAppWithName(name: "intervalDidEnd")

    // Window closed — hand the card over (day countdown) or tear it down.
    if #available(iOS 16.2, *),
       VetoLiveActivityHandoff.payload(forKey: VetoLiveActivityHandoff.metaKey(activityName: activity.rawValue)) != nil {
      VetoLiveActivityControl.windowEnded()
    }
  }

  func executeActionsForEvent(
    activityName: String,
    callbackName: String,
    eventName: String?
  ) {
    let triggeredBy =
      eventName != nil
      ? "actions_for_\(activityName)_\(callbackName)_\(eventName!)"
      : "actions_for_\(activityName)_\(callbackName)"

    let placeholders = [
      "activityName": activityName,
      "callbackName": callbackName,
      "eventName": eventName
    ]

    let originalWhitelist = getCurrentWhitelist()
    let originalBlocklist = getCurrentBlocklist()

    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)

    if let actions = userDefaults?.array(forKey: triggeredBy) {
      actions.forEach { actionRaw in
        if let action = actionRaw as? [String: Any] {
          let skipIfAlreadyTriggeredAfter = action["skipIfAlreadyTriggeredAfter"] as? Double
          let skipIfLargerEventRecordedAfter = action["skipIfLargerEventRecordedAfter"] as? Double
          let skipIfAlreadyTriggeredWithinMS = action["skipIfAlreadyTriggeredWithinMS"] as? Double
          let skipIfLargerEventRecordedWithinMS =
            action["skipIfLargerEventRecordedWithinMS"] as? Double
          let skipIfLargerEventRecordedSinceIntervalStarted =
            action["skipIfLargerEventRecordedSinceIntervalStarted"] as? Bool
          let neverTriggerBefore = action["neverTriggerBefore"] as? Double
          let skipIfAlreadyTriggeredBefore = action["skipIfAlreadyTriggeredBefore"] as? Double

          let skipIfAlreadyTriggeredBetweenFromDate =
            action["skipIfAlreadyTriggeredBetweenFromDate"] as? Double
          let skipIfAlreadyTriggeredBetweenToDate =
            action["skipIfAlreadyTriggeredBetweenToDate"] as? Double

          let skipIfWhitelistOrBlacklistIsUnchanged =
            action["skipIfWhitelistOrBlacklistIsUnchanged"] as? Bool

          if shouldExecuteAction(
            skipIfAlreadyTriggeredAfter: skipIfAlreadyTriggeredAfter,
            skipIfLargerEventRecordedAfter: skipIfLargerEventRecordedAfter,
            skipIfAlreadyTriggeredWithinMS: skipIfAlreadyTriggeredWithinMS,
            skipIfLargerEventRecordedWithinMS: skipIfLargerEventRecordedWithinMS,
            neverTriggerBefore: neverTriggerBefore,
            skipIfLargerEventRecordedSinceIntervalStarted:
              skipIfLargerEventRecordedSinceIntervalStarted,
            skipIfAlreadyTriggeredBefore: skipIfAlreadyTriggeredBefore,
            skipIfAlreadyTriggeredBetweenFromDate: skipIfAlreadyTriggeredBetweenFromDate,
            skipIfAlreadyTriggeredBetweenToDate: skipIfAlreadyTriggeredBetweenToDate,
            skipIfWhitelistOrBlacklistIsUnchanged: skipIfWhitelistOrBlacklistIsUnchanged,
            originalWhitelist: originalWhitelist,
            originalBlocklist: originalBlocklist,
            activityName: activityName,
            callbackName: callbackName,
            eventName: eventName
          ) {
            executeGenericAction(
              action: action,
              placeholders: placeholders,
              triggeredBy: triggeredBy
            )
          }
        }
      }
    }
  }

  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)
    logger.log("eventDidReachThreshold: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    notifyAppWithName(name: "eventDidReachThreshold")
  }

  override func intervalWillStartWarning(for activity: DeviceActivityName) {
    super.intervalWillStartWarning(for: activity)
    logger.log("intervalWillStartWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning"
    )

    notifyAppWithName(name: "intervalWillStartWarning")
  }

  override func intervalWillEndWarning(for activity: DeviceActivityName) {
    super.intervalWillEndWarning(for: activity)
    logger.log("intervalWillEndWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning"
    )

    notifyAppWithName(name: "intervalWillEndWarning")
  }

  override func eventWillReachThresholdWarning(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventWillReachThresholdWarning(event, activity: activity)
    logger.log("eventWillReachThresholdWarning: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    notifyAppWithName(name: "eventWillReachThresholdWarning")
  }

}
