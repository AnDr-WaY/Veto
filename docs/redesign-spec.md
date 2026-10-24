# Veto UI Redesign — Spec (2026-10)

Single source of truth for the current redesign. Every agent implements against
this document. When this spec and an old screen disagree, the spec wins.

## Product decisions (fixed)

1. **Terminology: "Rules" is gone, everything user-facing is a "Block".**
   - Routes: `/create-block` (was `/create-rule`), `/block/[id]` (was `/rule/[id]`).
     Files already renamed on disk by the lead.
   - The `/rules` tab and `app/(tabs)/rules.tsx` are **deleted**. Blocks live on Home.
   - Internal code names (`BlockRule`, `features/rules/*`, `rulesStore`) stay —
     only user-visible copy and routes change.
2. **No preset blocks ship with the app.** No seeded demo rules. The user
   always creates blocks themselves and picks their own apps. The mock app
   catalog (`DEMO_APPS`) stays — it is the Expo Go picker, not a preset.
3. **The schedule options in the wizard** ("Repeats: Every day / Weekdays /
   Weekends / Once") are block configuration, not presets — they stay.
4. **Onboarding is removed entirely (2026-10-21):** the app opens straight to
   Home on first launch. `OnboardingGate`, `OnboardingFlow`, the
   `onboardingState` store, its strings and the `/onboarding` route are
   deleted. Only the block-notification planning keeps living in
   `src/features/onboarding/` (`blockNotifications.ts` +
   `useBlockNotificationSync`, mounted in the root layout). The Developer
   section in Settings now only has `Reset all data`.
5. **Home is a real home screen:** header with icon actions, big clock,
   timeline, and the full list of created blocks. Settings is one gear tap away.

## Theme (already implemented by the lead — do not change values)

`src/ui/Theme.tsx` now holds soft palettes. Never pure black; rounded corners
stay (radius.card 16 / radius.control 12). Light: bg `#F4F4F6`, white cards,
ink text. Dark: charcoal bg `#131316`, raised `#1D1D21`, near-white text.
All colors via `useTheme().colors` — **hardcoded hex/rgba in app code is a bug**.

## Design-system elements to reuse (the "заготовки")

New primitives (already implemented, exported from `@/ui`):

- `ScreenHeader({ title?, onBack?, backA11yLabel?, right?, large?, style? })`
  — 44pt SF Symbol back chevron (big and tappable), centered bar title,
  `right` slot for IconButtons/step dots. Used on stacked screens (wizard,
  detail). Tab-level screens (Stats, Settings) instead render a 48pt round
  `Glass` back bubble with an `IconButton` chevron — icon only, no title.
- `IconButton({ icon, label, onPress })` — 44×44 circular header action
  rendering an SF Symbol.
- `Icon({ name, size?, weight?, color? })` — SF Symbols via `expo-symbols`,
  monochrome, theme-tinted; `IconName` is a type-safe symbol union.
  Canonical icons: stats `chart.bar`, settings `gearshape`, back
  `chevron.left` (bold), row chevron `chevron.right` (14pt), FAB `plus`,
  stepper `minus`/`plus` (18pt), empty state `plus.circle`, FAB actions
  `bolt` / `calendar`.
- `Glass({ style, interactive?, tintColor? })` — Liquid Glass surface
  (`expo-glass-effect`, iOS 26+); falls back to a raised hairline card
  elsewhere. The material carries a STRONG theme-surface tint (`glassTint`,
  75% theme surface) with a hairline theme border: blobs render
  light-on-light / dark-on-dark, so theme-tinted content always contrasts
  regardless of OS glass adaptation. Used for the Home header pill, the
  Settings header pill, the Stats back bubble, and the FAB blob.
- `GlassHeaderPill({ title, onBack, backA11yLabel? })` — [‹ Title] glass
  capsule for Settings. Title text rendered explicitly — never inside a
  flex-centered slot. Stats uses an icon-only 48pt round `Glass` back
  bubble instead (no title text).
- `SwipeBack({ onSwipeBack, children })` — iOS-style interactive right-swipe
  dismissal (follows the finger at 0.7×, threshold 90pt, haptic on fire).
  Wraps Stats and Settings.
- `ExpandableFab({ label, closeLabel, actions: [a, b] })` — center FAB as
  ONE glass blob: collapsed = 56pt circle; on tap the plus rotates to × and
  the same glass stretches sideways (width spring) revealing both actions
  to choose from, left or right of the ×. Collapses before navigating.
  Home passes instant (`bolt` → `/create-block`) and scheduled
  (`calendar` → `/create-block?mode=scheduled`).
- `TimelineBar` — the elapsed portion of the day is tinted (theme text at
  7%) and hatched with 45° diagonal hairlines ("spent"), the rest stays a
  quiet track; blocked windows and the "now" marker layer on top.
- `EmptyState` — deliberately understated: 28pt faint icon, callout title in
  textMuted, caption message in textFaint. No card, no border.
- Existing: `Button` (primary/secondary/ghost), `Card`, `EmptyState` (pass a
  real `Button` as `action` — never inline CTA pills), `FAB` ('+'),
  `Row`, `BlockChip`, `TimelineBar`, `TimeStepper`, `StrictnessCard`, `Sheet`.

Haptics conventions: `haptic(kind)` from `@/lib/haptics` in screens/features
(fired in handlers only), `haptics.tick()/tap()` inside `src/ui` components.
Every press target fires feedback; destructive confirms use
`warning`/`error`, successes use `success`.

Rules for all screens:

- Back navigation is ALWAYS `ScreenHeader onBack` — no small `‹` text buttons.
- Lists/cards always use `Card` / `BlockCard` — no hand-rolled surfaces.
- Empty states always use `EmptyState` + `Button`.
- Minimal copy: a screen shows one heading, field labels only where input
  exists, and validation messages. Marketing/hint captions are cut unless the
  spec keeps them.
- Haptics: `haptic()` from `@/lib/haptics` in screens, `haptics` from `@/ui`
  inside `src/ui` components (existing convention).
- Prettier: 100 cols, single quotes; match each file's existing import style.

## Screen specs

### Home — `app/(tabs)/index.tsx` (rewrite)
```
[overline: VETO — {date}          (◔ Stats) (⚙︎ Settings)]
[big clock 64pt]
[TimelineBar]
[pausedNote if any]                 ← "Some blocks are paused."
[nothingActive line if no active/upcoming today but blocks exist]
SECTION 'BLOCKS' (micro, uppercase)
[BlockCard × all rules — full chip, tap → /block/[id]]
or [EmptyState — text only, no icon/CTA: "Tap + to pick the apps…"]
[FAB +]
```
- No text links, no "Rules" screen, no per-card countdown captions (the cards
  carry range/days/chip already).
- Header top row is a plain `View` row (not ScreenHeader — no back here);
  IconButtons push `/(tabs)/stats` and `/(tabs)/settings`.
- `useFocusEffect` refresh stays. Safe-area: `paddingTop: insets.top + spacing.xl`.

### Create wizard — `app/create-block.tsx` (3 steps stay)
- Header: `ScreenHeader` — `onBack` = goBackOrExit, bar title "New block",
  `right` = the 3 step dots.
- **Step 1 must fit on an iPhone without outer scroll** (keyboard closed):
  compact mock app picker as a 2-column wrap grid of pill chips (height ≈ 40
  per row, 8 demo apps → 4 rows). Cut the `appsHeading` title + `appsHint`
  captions; keep a micro field label + the selected-count chip.
- Copy cuts: no `quickCreateCaption`, no `onceNote`, no step-3 shield quote
  preview. Keep the validation problem line and the "Block window" preview.
- Ghost buttons: plain `Back` label (the arrow lives in ScreenHeader).
- Quick create ("Create block" from step 1) and "Customize" behavior stay.

### Block detail — `app/block/[id].tsx`
- `ScreenHeader` with `onBack` (router.back, a11y `coreStrings.common.back`)
  and bar title `rulesStrings.detail.title`. Content sections unchanged.

### Onboarding — removed
- The intro flow was cut (see Product decision 4): no first-launch gate, no
  `/onboarding` route, no replay row. Block-notification planning
  (`blockNotifications.ts` + `useBlockNotificationSync`) stays in
  `src/features/onboarding/`.

### Settings — `app/(tabs)/settings.tsx`
- `GlassHeaderPill` ([‹ Settings]) + safe-area padding; wrapped in
  `SwipeBack`. Sections stay; the Grace card is vertical (labels above the
  full-width stepper — no text wrapping).
- Last section **Developer** (for buildless testing in Expo Go): a single
  `Reset all data` row (confirm first; clears rules/events/settings plus the
  legacy onboarding KV flag, resets stores).

### Stats — `app/(tabs)/stats.tsx`
- Icon-only round `Glass` back bubble (48pt, no title) + safe-area padding;
  wrapped in `SwipeBack`.
- No subtitle — the screen opens straight into the period picker.

## Testing without a real build (Expo Go)

- `npm run start:go` → `expo start --go` (QR → Expo Go). `.expo-go` marker
  file already forces Expo Go for the `exprun` aliases.
- Engine is mock in Expo Go (`isExpoGo()`), storage falls back to memory,
  picker falls back to the demo catalog, notifications are best-effort.
- The new Developer section in Settings is the "reinstall" button.
