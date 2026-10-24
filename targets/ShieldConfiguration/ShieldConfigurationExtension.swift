//
//  ShieldConfigurationExtension.swift
//  Veto — ShieldConfiguration target
//
//  Veto shield: the small Veto V mark, "BLOCKED" and a "by Veto · until
//  HH:MM" line. There is no bypass: the shield never carries a Skip button.
//
//  The look comes from the JS engine's per-selection config
//  (shieldConfigurationForSelection_<ref>, written on every apply — see
//  src/features/blocking/deviceActivityEngine.ts). The config is matched to
//  the shielded app by FamilyActivitySelection token (not by monitored
//  activity names — Veto activity names carry the rule id, not the ref).
//  The static fallback below covers the gap before the first engine apply.
//
//  Two things the ShieldConfiguration API cannot do: remove the blocked
//  app's own icon (iOS draws it above everything) and put an image inside
//  a text line (the mark is therefore its own element above the title).
//  The system also picks the typography — hierarchy comes from which
//  field each string goes in (title renders large, subtitle underneath).
//
//  Appearance: the system composites the shield over its own material,
//  which follows the device appearance — a fixed dark color reads fine in
//  dark mode but washes out in light (white text on the light backdrop).
//  So the palette here is adaptive: ink/paper swap per appearance, and the
//  mark re-tints with them, keeping the shield readable in both themes.
//

import FamilyControls
import Foundation
import ManagedSettings
import ManagedSettingsUI
import UIKit
import os

private enum VetoShield {
  /// Design-system monochrome (src/ui/Theme.tsx): ink / paper per appearance.
  static let background = UIColor { (trait: UITraitCollection) -> UIColor in
    trait.userInterfaceStyle == .dark
      ? UIColor(red: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0A / 255.0, alpha: 1.0)
      : UIColor.white
  }
  static let foreground = UIColor { (trait: UITraitCollection) -> UIColor in
    trait.userInterfaceStyle == .dark
      ? UIColor.white
      : UIColor(red: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0A / 255.0, alpha: 1.0)
  }

  /// assets/icon.png geometry, unit square: the wide triangular V. No asset
  /// catalog in the extension bundle, so the mark is drawn from this traced
  /// path — keep in sync with the LA card (BlockingActivity.swift).
  private static let markPoints: [CGPoint] = [
    CGPoint(x: 0.195, y: 0.223),
    CGPoint(x: 0.364, y: 0.223),
    CGPoint(x: 0.500, y: 0.376),
    CGPoint(x: 0.633, y: 0.223),
    CGPoint(x: 0.804, y: 0.223),
    CGPoint(x: 0.500, y: 0.773),
  ]

  /// The app-icon look: ink rounded tile with the white V. Deliberately one
  /// FLAT image — the config crosses a process boundary, which flattens
  /// trait-aware images (a dynamic mark came out white-on-white in light
  /// mode); the ink tile reads on both backdrops: on the dark one it melts
  /// away leaving the bare V, on the light one it is the app icon.
  static func logoMark(side: CGFloat) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    return renderer.image { _ in
      let rect = CGRect(x: 0, y: 0, width: side, height: side)
      let ink = UIColor(red: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0A / 255.0, alpha: 1.0)
      let tile = UIBezierPath(roundedRect: rect, cornerRadius: side * 0.28)
      ink.setFill()
      tile.fill()

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
      UIColor.white.setFill()
      path.fill()
    }
  }
}

class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "io.veto.app", category: "veto-shield")

  override func configuration(shielding application: Application) -> ShieldConfiguration {
    vetoConfiguration(applicationToken: application.token)
  }

  override func configuration(
    shielding application: Application, in category: ActivityCategory
  ) -> ShieldConfiguration {
    vetoConfiguration(applicationToken: application.token, categoryToken: category.token)
  }

  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
    vetoConfiguration(webDomainToken: webDomain.token)
  }

  override func configuration(
    shielding webDomain: WebDomain, in category: ActivityCategory
  ) -> ShieldConfiguration {
    vetoConfiguration(webDomainToken: webDomain.token, categoryToken: category.token)
  }

  /// Finds the registry key (the JS selectionRef) whose stored selection
  /// contains what the system is shielding. All three token kinds matter:
  /// a rule can be built from app picks, web domains or whole categories —
  /// a category-only rule never matches at the application-token level.
  private func selectionRefFor(
    applicationToken: ApplicationToken?,
    webDomainToken: WebDomainToken?,
    categoryToken: ActivityCategoryToken?
  ) -> String? {
    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
    guard
      let registry = userDefaults?.dictionary(forKey: FAMILY_ACTIVITY_SELECTION_ID_KEY)
    else { return nil }
    for (ref, stored) in registry {
      guard let serialized = stored as? String else { continue }
      let selection = deserializeFamilyActivitySelection(familyActivitySelectionStr: serialized)
      // FamilyActivitySelection is asymmetric: applicationTokens holds
      // tokens, webDomains holds WebDomain values (token → value via init).
      if let applicationToken, selection.applicationTokens.contains(applicationToken) {
        return ref
      }
      if let webDomainToken,
         selection.webDomains.contains(WebDomain(token: webDomainToken)) {
        return ref
      }
      if let categoryToken, selection.categoryTokens.contains(categoryToken) {
        return ref
      }
    }
    return nil
  }

  private func vetoConfiguration(
    applicationToken: ApplicationToken? = nil,
    webDomainToken: WebDomainToken? = nil,
    categoryToken: ActivityCategoryToken? = nil
  ) -> ShieldConfiguration {
    logger.log("building shield config")

    let configKey = selectionRefFor(
      applicationToken: applicationToken,
      webDomainToken: webDomainToken,
      categoryToken: categoryToken
    )
    .map { SHIELD_CONFIGURATION_FOR_SELECTION_PREFIX + "_" + $0 }

    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
    let stored = configKey.flatMap { userDefaults?.dictionary(forKey: $0) }

    guard let stored else {
      logger.log("no per-selection config — static fallback")
      return staticShield
    }

    // Copy comes from the engine (title / subtitle); the palette stays here
    // — adaptive ink & paper. No button labels: there is no bypass.
    return ShieldConfiguration(
      backgroundColor: VetoShield.background,
      icon: VetoShield.logoMark(side: 34),
      title: label(stored["title"] as? String, fallback: "BLOCKED"),
      subtitle: label(stored["subtitle"] as? String, fallback: "by Veto"),
      primaryButtonLabel: nil,
      secondaryButtonLabel: nil
    )
  }

  /// Static wall for the window before the first apply: no buttons — the
  /// user leaves via the home gesture and the block ends on its own.
  private var staticShield: ShieldConfiguration {
    ShieldConfiguration(
      backgroundColor: VetoShield.background,
      icon: VetoShield.logoMark(side: 34),
      title: .init(text: "BLOCKED", color: VetoShield.foreground),
      subtitle: .init(text: "by Veto", color: VetoShield.foreground),
      primaryButtonLabel: nil,
      secondaryButtonLabel: nil
    )
  }

  private func label(_ text: String?, fallback: String?) -> ShieldConfiguration.Label? {
    guard let text, !text.isEmpty else {
      guard let fallback else { return nil }
      return .init(text: fallback, color: VetoShield.foreground)
    }
    return .init(text: text, color: VetoShield.foreground)
  }
}
