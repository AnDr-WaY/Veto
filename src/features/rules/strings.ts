/**
 * EN copy for the Rules feature screens (Home, create flows, detail).
 * i18n-ready: every screen string lives here, functions for parameterized copy.
 */
export const rulesStrings = {
  home: {
    brandLine: (date: string) => `Veto — ${date}`,
    blocksSection: 'Blocks',
    nothingActive: 'Nothing blocked right now.',
    pausedNote: 'Some blocks are paused.',
    leftToday: (label: string) => `${label} left today`,
  },

  rules: {
    a11yAdd: 'Create a new block',
  },

  empty: {
    title: 'No blocks yet',
    message: 'Tap + to pick the apps that distract you and block them right away or on a schedule.',
    cta: 'Create your first block',
  },

  create: {
    titleQuick: 'Quick block',
    titleSchedule: 'Schedule',
    closeA11y: 'Close without saving',

    stepApps: 'Apps',
    appsPlaceholder: 'Choose apps',
    appsSearchPlaceholder: 'Search',
    appsAllCategory: 'All',
    pickerUnavailable: 'App selection is available in the iOS build.',

    defaultQuickName: 'Quick block',
    defaultScheduleName: 'Schedule',

    create: 'Create block',
    creating: 'Creating…',
    saveFailed: 'Could not save the block — try again',
    back: 'Back',

    nextUntil: 'Next',
    nextWhen: 'Next',

    untilLabel: 'Until',
    startsNowNote: 'Starts right away — pick when it ends.',
    problemSelection: 'Choose at least one app.',
    problemUntil: 'The end must be later today, on the 15-minute grid.',

    daysLabel: 'Repeats on',
    timeLabel: 'Time',
    startLabel: 'Start',
    endLabel: 'End',
    problemDays: 'Pick at least one day.',
    problemRange: 'The end must be after the start, on the 15-minute grid.',

    // Edit mode reuses the wizards: the rule is prefilled and saved over.
    editTitle: 'Edit block',
    save: 'Save',
    saving: 'Saving…',
    nameLabel: 'Name',
    namePlaceholder: 'Block name',

    shieldMessageDefault: 'This app is blocked right now.',
  },

  apps: {
    categories: {
      social: 'Social',
      messaging: 'Messaging',
      video: 'Video',
      games: 'Games',
      browsers: 'Browsers',
    } as Record<string, string>,
    /** Overline above the native picker — the device-wide app list. */
    pickerTitle: 'All apps',
    nativeSelected: (count: number) =>
      `${count} ${count === 1 ? 'app' : 'apps'} selected`,
    noResults: 'No apps match.',

    // Screen Time gate shown before Apple's picker until Family Controls
    // is authorized (the picker renders an empty list without it).
    auth: {
      title: 'Screen Time access',
      message:
        'Veto needs Screen Time access to pick and block apps. Nothing leaves your device.',
      allow: 'Allow',
      allowing: 'Allowing…',
      retry: 'Retry',
      denied: 'Screen Time access was declined. Enable it in Settings and try again.',
    },
  },

  detail: {
    title: 'Block',
    notFoundTitle: 'Block not found',
    notFoundMessage: 'It may have been deleted.',
    appsCard: 'Apps',
    itemsCount: (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`,
    appsCountLine: (count: number) => `${count} ${count === 1 ? 'app' : 'apps'}`,
    appsAndSitesLine: (apps: number, sites: number) =>
      `${apps} ${apps === 1 ? 'app' : 'apps'} · ${sites} ${sites === 1 ? 'website' : 'websites'}`,
    edit: 'Edit',
    scheduleCard: 'Schedule',
    strictnessCard: 'Mode',
    thresholdLine: (minutes: number) => `Shield after ${minutes} min of use`,
    hardLine: 'Unbreakable while the block runs',
    pausedBadge: 'Paused',
    pauseToday: 'Pause today',
    pauseTodayCaption: 'Stays paused until you resume it.',
    resume: 'Resume',
    delete: 'Delete',
    deleteTitle: 'Delete this block?',
    deleteMessage: 'The schedule stops immediately. This cannot be undone.',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
  },

  state: {
    active: 'Active',
    upcoming: 'Upcoming',
    paused: 'Paused',
    done: 'Done',
    offDay: 'Off day',
  },

  days: {
    daily: 'Every day',
    oneTime: 'One time',
    weekdays: 'Weekdays',
    weekends: 'Weekends',
    weekdayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as string[],
  },

  strictness: {
    threshold: 'Threshold',
    hard: 'Hard',
  },
} as const;
