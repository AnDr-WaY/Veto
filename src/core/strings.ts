/**
 * Shared EN strings (i18n-ready). Feature-specific copy lives in a strings.ts
 * next to the feature's screens; only cross-feature strings belong here.
 */
export const strings = {
  appName: 'Veto',

  tabs: {
    home: 'Home',
    stats: 'Stats',
    settings: 'Settings',
  },

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    close: 'Close',
    back: 'Back',
    done: 'Done',
    edit: 'Edit',
    retry: 'Try again',
    loading: 'Loading…',
    errorTitle: 'Something went wrong',
  },

  pause: {
    action: 'Pause blocking',
    resume: 'Resume',
    pausedUntil: (time: string) => `Paused until ${time}`,
  },

  auth: {
    notDetermined: 'Screen Time access is not set up yet.',
    approved: 'Screen Time access granted.',
    denied: 'Screen Time access was denied. Enable it in iOS Settings.',
  },
} as const;
