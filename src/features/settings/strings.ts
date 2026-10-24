/** Settings screen copy (EN, i18n-ready) — lives with its feature. */
export const settingsStrings = {
  title: 'Settings',

  sections: {
    blocking: 'Blocking',
    notifications: 'Notifications',
    appearance: 'Appearance',
    support: 'Support',
    about: 'About',
    dev: 'Developer',
  },

  notifications: {
    blockStart: 'Block starts',
    blockEnd: 'Block ends',
  },

  theme: {
    title: 'Theme',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },

  haptics: {
    title: 'Haptics',
    caption: 'Vibration feedback on actions.',
  },

  support: {
    row: 'Support the developer',
    sheetTitle: 'Support the developer',
    body1: 'Veto is completely free — no ads, no subscriptions, no tracking.',
    body2: 'If it helps you focus, the best support is a kind review or sharing it with a friend.',
    thanks: 'Thank you.',
  },

  about: {
    row: 'About Veto',
    sheetTitle: 'About Veto',
    tagline: 'Hard blocks for the apps that steal your time.',
    privacy: 'All data stays on your device. No account, no analytics.',
    version: (v: string) => `Version ${v}`,
    leaveReview: 'Leave a review',
    github: 'GitHub',
    githubUrl: 'https://github.com/AnDr-WaY/Veto',
  },

  privacy: {
    row: 'Privacy Policy',
    sheetTitle: 'Privacy Policy',
    paragraphs: [
      'Veto is built to work entirely on your device. We collect nothing.',
      'There are no accounts, no sign-in, no analytics, no advertising SDKs and no tracking of any kind.',
      'All your data — blocks, schedules, settings and statistics — is stored locally in the app’s own storage on your device.',
      'Veto uses Apple’s Family Controls (Screen Time) framework to apply the blocks you create. The app selection you pick is stored only on your device, in the shared app-group storage iOS provides for this purpose. It never leaves your device.',
      'We do not access, read or transmit your browsing history, app usage history or any other personal data beyond what iOS itself requires to enforce the blocks you configure.',
      'Veto makes no network requests of its own. The only network activity is downloading app updates delivered through Apple’s App Store and TestFlight infrastructure.',
      'If you delete Veto, all data stored by the app is removed with it.',
      'Contact: andrway@andrway.dev',
    ],
  },

  terms: {
    row: 'Terms of Use',
    sheetTitle: 'Terms of Use',
    paragraphs: [
      'Veto is provided “as is”, free of charge, for personal, non-commercial use.',
      'The app blocks apps according to schedules you configure on your device. Veto is a self-control tool; it is not a parental-monitoring or security product, and you are responsible for how you use it.',
      'We do not guarantee uninterrupted blocking. iOS may delay or skip scheduled blocks after a device restart, low battery or other system events. Do not rely on Veto as the only control for critical needs.',
      'To the maximum extent permitted by applicable law, the developer is not liable for any damages or losses arising from use of the app, including lost data, missed notifications, or apps failing to be blocked.',
      'Apple and Apple’s App Store are not involved in, and are not responsible for, the app or these terms.',
      'These terms may change with app updates. Continued use of the app means acceptance of the current version.',
      'Contact: andrway@andrway.dev',
    ],
  },

  dev: {
    reset: 'Reset all data',
    resetTitle: 'Reset all data?',
    resetMessage: 'Blocks, history and settings are erased on this device. This cannot be undone.',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
  },
} as const;
