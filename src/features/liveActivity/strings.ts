/** Lock-screen activity (iOS Live Activity) — screen copy (EN, i18n-ready). */
export const liveActivityStrings = {
  rowTitle: 'Lock screen activity',
  /** Day-mode title: the countdown belongs to the app, not to a block. */
  dayTitle: 'Veto',
  on: 'On',
  off: 'Off',
  /** Live Activities are switched off (iOS Settings → Veto → Live Activities). */
  disabled: 'Turn on in Settings',
  /** Caption of the mode picker shown under the row (what is counted down). */
  modeTitle: 'Countdown shows',
  modes: {
    day: 'Day',
    block: 'Current block',
    both: 'Both',
  },
} as const;
