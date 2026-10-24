/**
 * View-model tests for the Rules feature: the two creation drafts (quick
 * block / schedule), locale-aware weekday ordering, 5-minute grid
 * validation, overnight windows, timeline segments and next-block selection.
 */

import {
  blockRuleToQuickDraft,
  blockRuleToScheduleDraft,
  clampGrid,
  defaultQuickDraft,
  defaultScheduleDraft,
  demoSelectionNames,
  derivedTitle,
  firstWeekdayIndex,
  formatDays,
  formatRange,
  formatRangeWithDuration,
  formatRuleDays,
  formatSelectionDetail,
  isOneShotExpired,
  nextBlocks,
  orderedWeekdays,
  quickDraftProblems,
  quickDraftToNewBlockRule,
  ruleState,
  scheduleDraftProblems,
  scheduleDraftToNewBlockRule,
  timelineSegments,
} from '../viewModel';
import { validateRule } from '@/core/contracts';
import type { BlockRule } from '@/core/contracts';

function makeRule(partial: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_1',
    title: 'Focus',
    selectionRef: 'selection:1',
    selectionCount: 2,
    days: 'daily',
    startMin: 540,
    endMin: 1020,
    strictness: 'hard',
    shieldMessage: 'Focus.',
    paused: false,
    createdAt: 0,
    ...partial,
  };
}

/** Filled schedule draft mirroring what a created rule round-trips. */
function filledScheduleDraft(overrides: Partial<ReturnType<typeof defaultScheduleDraft>> = {}) {
  return {
    ...defaultScheduleDraft(),
    selectionRef: 'selection:test',
    selectionCount: 2,
    selectionLabel: 'Instagram, YouTube',
    ...overrides,
  };
}

describe('the 5-minute grid', () => {
  it('snaps minutes to the grid and wraps at midnight', () => {
    expect(clampGrid(0)).toBe(0);
    expect(clampGrid(7)).toBe(5);
    expect(clampGrid(8)).toBe(10);
    expect(clampGrid(1430)).toBe(1430);
    expect(clampGrid(1438)).toBe(0);
    expect(clampGrid(1470)).toBe(30);
    expect(clampGrid(-5)).toBe(1435);
  });
});

describe('locale-aware week ordering', () => {
  it('starts the week on Monday for most locales', () => {
    expect(firstWeekdayIndex('ru-RU')).toBe(1);
    expect(firstWeekdayIndex('de-DE')).toBe(1);
    expect(firstWeekdayIndex('en-GB')).toBe(1);
  });

  it('starts the week on Sunday for US-style locales', () => {
    expect(firstWeekdayIndex('en-US')).toBe(0);
    expect(firstWeekdayIndex('ja-JP')).toBe(0);
    expect(firstWeekdayIndex('zh_CN')).toBe(0);
  });

  it('lays out the seven day toggles from the first day', () => {
    expect(orderedWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(orderedWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('quick block draft', () => {
  function filled(draft: ReturnType<typeof defaultQuickDraft>) {
    return {
      ...draft,
      selectionRef: 'selection:test',
      selectionCount: 1,
      selectionLabel: 'Instagram',
    };
  }

  it('defaults to hard mode and an end one hour from now', () => {
    const draft = defaultQuickDraft(14 * 60); // 14:00
    expect(draft.mode).toBe('hard');
    expect(draft.endMin).toBe(15 * 60);
    expect(draft.selectionRef).toBe('');
  });

  it('collects problems for an untouched draft', () => {
    const problems = quickDraftProblems(defaultQuickDraft(600), 600);
    expect(problems).toEqual(['selectionEmpty']);
  });

  it('rejects a zero-length or off-grid end time, accepts overnight', () => {
    const draft = filled(defaultQuickDraft(600));
    expect(quickDraftProblems(draft, 600)).toEqual([]);
    // endMin before now is an overnight window, not an error.
    expect(quickDraftProblems({ ...draft, endMin: 570 }, 600)).toEqual([]);
    expect(quickDraftProblems({ ...draft, endMin: 600 }, 600)).toContain('untilInvalid');
    expect(quickDraftProblems({ ...draft, endMin: 601 }, 600)).toContain('untilInvalid');
  });

  it('produces a rule starting at the current minute and passes validation', () => {
    // Draft and payload see the same "now" (14:07): the block starts exactly
    // now — no quarter-grid snapping — and ends at the default 15:00.
    const payload = quickDraftToNewBlockRule(filled(defaultQuickDraft(14 * 60 + 7)), 14 * 60 + 7);
    expect(validateRule({ ...payload, id: 'x', paused: false, createdAt: 0 })).toEqual([]);
    expect(payload.startMin).toBe(14 * 60 + 7);
    expect(payload.endMin).toBe(905);
    expect(payload.oneShot).toBe(true);
    expect(payload.days).toBe('daily');
    expect(payload.strictness).toBe('hard');
    expect(payload.title).toBe('Instagram');
  });

  it('maps the threshold mode to threshold strictness', () => {
    const draft = { ...filled(defaultQuickDraft(600)), mode: 'threshold' as const };
    expect(quickDraftToNewBlockRule(draft, 600).strictness).toBe('threshold');
  });
});

describe('schedule draft', () => {
  function filled(draft: ReturnType<typeof defaultScheduleDraft>) {
    return {
      ...draft,
      selectionRef: 'selection:test',
      selectionCount: 2,
      selectionLabel: 'Instagram, YouTube',
    };
  }

  it('defaults to all days, the 9–17 window and hard mode', () => {
    const draft = defaultScheduleDraft();
    expect(draft.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(draft.startMin).toBe(540);
    expect(draft.endMin).toBe(1020);
    expect(draft.mode).toBe('hard');
  });

  it('collects problems when days or selection are missing', () => {
    expect(scheduleDraftProblems(defaultScheduleDraft())).toEqual(['selectionEmpty']);
    expect(scheduleDraftProblems({ ...filled(defaultScheduleDraft()), days: [] })).toEqual([
      'daysEmpty',
    ]);
    // end < start is an overnight window; only a zero-length window fails.
    expect(
      scheduleDraftProblems({ ...filled(defaultScheduleDraft()), startMin: 600, endMin: 540 }),
    ).toEqual([]);
    expect(
      scheduleDraftProblems({ ...filled(defaultScheduleDraft()), startMin: 600, endMin: 600 }),
    ).toEqual(['rangeInvalid']);
  });

  it('stores a midnight pick as 24:00', () => {
    const payload = scheduleDraftToNewBlockRule({
      ...filled(defaultScheduleDraft()),
      startMin: 22 * 60,
      endMin: 0,
    });
    expect(payload.endMin).toBe(1440);
    expect(validateRule({ ...payload, id: 'x', paused: false, createdAt: 0 })).toEqual([]);
  });

  it('collapses all seven days to "daily" and passes validation', () => {
    const payload = scheduleDraftToNewBlockRule(filled(defaultScheduleDraft()));
    expect(validateRule({ ...payload, id: 'x', paused: false, createdAt: 0 })).toEqual([]);
    expect(payload.days).toBe('daily');
    expect(payload.oneShot).toBeUndefined();
    expect(payload.title).toBe('Instagram +1');
  });

  it('keeps an explicit sorted day list', () => {
    const payload = scheduleDraftToNewBlockRule({
      ...filled(defaultScheduleDraft()),
      days: [5, 1, 0],
    });
    expect(payload.days).toEqual([0, 1, 5]);
  });
});

describe('derived titles', () => {
  it('uses the single app name, or the first plus a count', () => {
    expect(derivedTitle('Instagram', 'Quick block')).toBe('Instagram');
    expect(derivedTitle('Instagram, YouTube, X', 'Quick block')).toBe('Instagram +2');
    expect(derivedTitle('', 'Schedule')).toBe('Schedule');
  });

  it('keeps an explicit draft title (edit rename) over the derived one', () => {
    const draft = {
      ...filledScheduleDraft(),
      title: 'My own name  ',
    };
    expect(scheduleDraftToNewBlockRule(draft).title).toBe('My own name');
    // Creation drafts (no title) still derive from the selection label.
    expect(scheduleDraftToNewBlockRule(filledScheduleDraft()).title).toBe('Instagram +1');
  });
});

describe('day formatting', () => {
  it('formats day lists with preset names', () => {
    expect(formatDays('daily')).toBe('Every day');
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(formatDays([0, 6])).toBe('Weekends');
    expect(formatDays([5, 3])).toBe('Wed, Fri');
  });

  it('labels one-shot rules "One time" instead of "Every day"', () => {
    expect(formatRuleDays(makeRule({ days: 'daily' }))).toBe('Every day');
    expect(formatRuleDays(makeRule({ days: 'daily', oneShot: true }))).toBe('One time');
  });
});

describe('one-shot expiry', () => {
  // 2026-10-22, 14:07 local time.
  const day = [2026, 9, 22] as const;
  const createdAt = new Date(day[0], day[1], day[2], 14, 7).getTime();
  const oneShot = makeRule({
    oneShot: true,
    startMin: 14 * 60 + 7,
    endMin: 15 * 60,
    createdAt,
  });

  it('keeps the block while its window is still running', () => {
    expect(isOneShotExpired(oneShot, new Date(day[0], day[1], day[2], 14, 30))).toBe(false);
    expect(isOneShotExpired(oneShot, new Date(day[0], day[1], day[2], 14, 59))).toBe(false);
  });

  it('expires the block at the end minute and on any later day', () => {
    expect(isOneShotExpired(oneShot, new Date(day[0], day[1], day[2], 15, 0))).toBe(true);
    expect(isOneShotExpired(oneShot, new Date(day[0], day[1], day[2], 23, 59))).toBe(true);
    expect(isOneShotExpired(oneShot, new Date(2026, 9, 23, 10, 0))).toBe(true);
  });

  it('never expires recurring rules', () => {
    const recurring = makeRule({ startMin: 540, endMin: 600, createdAt });
    expect(isOneShotExpired(recurring, new Date(2026, 9, 23, 10, 0))).toBe(false);
  });

  it('keeps an overnight one-shot through the next morning', () => {
    const late = new Date(day[0], day[1], day[2], 23, 0).getTime();
    const overnight = makeRule({ oneShot: true, startMin: 23 * 60, endMin: 60, createdAt: late });
    expect(isOneShotExpired(overnight, new Date(day[0], day[1], day[2], 23, 30))).toBe(false);
    expect(isOneShotExpired(overnight, new Date(day[0], day[1], day[2] + 1, 0, 30))).toBe(false);
    expect(isOneShotExpired(overnight, new Date(day[0], day[1], day[2] + 1, 1, 0))).toBe(true);
    expect(isOneShotExpired(overnight, new Date(day[0], day[1], day[2] + 2, 0, 30))).toBe(true);
  });
});

describe('edit prefill (rule → draft)', () => {
  it('round-trips a quick block, keeping its window start', () => {
    const rule = makeRule({
      oneShot: true,
      startMin: 14 * 60 + 7,
      endMin: 15 * 60,
      selectionRef: 'mock-selection:instagram',
      strictness: 'hard',
      title: 'Custom',
    });

    const draft = blockRuleToQuickDraft(rule);
    expect(draft.endMin).toBe(15 * 60);
    expect(draft.mode).toBe('hard');
    expect(draft.title).toBe('Custom');
    expect(draft.selectionLabel).toBe('Instagram');

    const payload = quickDraftToNewBlockRule(draft, rule.startMin);
    expect(payload.startMin).toBe(14 * 60 + 7); // original start preserved
    expect(payload.endMin).toBe(15 * 60);
    expect(payload.title).toBe('Custom');
    expect(payload.strictness).toBe('hard');
    expect(payload.oneShot).toBe(true);
    expect(validateRule({ ...payload, id: rule.id, paused: rule.paused, createdAt: 0 })).toEqual(
      [],
    );
  });

  it('round-trips a schedule and expands "daily" back to seven days', () => {
    const rule = makeRule({ days: 'daily', startMin: 570, endMin: 630 });

    const draft = blockRuleToScheduleDraft(rule);
    expect(draft.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(draft.startMin).toBe(570);
    expect(draft.endMin).toBe(630);

    const payload = scheduleDraftToNewBlockRule(draft);
    expect(payload.days).toBe('daily');
    expect(payload.startMin).toBe(570);
    expect(payload.endMin).toBe(630);
    expect(payload.oneShot).toBeUndefined();
  });

  it('keeps an explicit day list and preserves threshold strictness', () => {
    const draft = blockRuleToScheduleDraft(makeRule({ days: [1, 3], strictness: 'threshold' }));
    expect(draft.days).toEqual([1, 3]);
    expect(draft.mode).toBe('threshold');
  });

  it('recovers demo app names from the selection ref, never from native refs', () => {
    expect(demoSelectionNames('mock-selection:instagram+tiktok')).toEqual([
      'Instagram',
      'TikTok',
    ]);
    expect(demoSelectionNames('mock-selection:none')).toEqual([]);
    // Opaque native selection (or anything else): no names to show.
    expect(demoSelectionNames('family-activity:ab12cd34')).toEqual([]);
  });
});

describe('detail apps line', () => {
  it('lists the actual app names in demo mode', () => {
    expect(
      formatSelectionDetail(makeRule({ selectionRef: 'mock-selection:instagram+tiktok' })),
    ).toBe('Instagram, TikTok');
  });

  it('splits apps and websites when the pick reported the breakdown', () => {
    expect(
      formatSelectionDetail(makeRule({ selectionCount: 7, webDomainCount: 2 })),
    ).toBe('5 apps · 2 websites');
    expect(
      formatSelectionDetail(makeRule({ selectionCount: 1, webDomainCount: 1 })),
    ).toBe('0 apps · 1 website');
  });

  it('falls back to a plain app count for legacy native selections', () => {
    expect(formatSelectionDetail(makeRule({ selectionCount: 4 }))).toBe('4 apps');
    expect(formatSelectionDetail(makeRule({ selectionCount: 1 }))).toBe('1 app');
  });
});

describe('today state', () => {
  const weekday = 3; // Wednesday

  it('builds blocked timeline segments as day fractions', () => {
    const segments = timelineSegments(
      [
        makeRule({ startMin: 360, endMin: 720 }),
        makeRule({ id: 'paused', paused: true }),
        makeRule({ id: 'off', days: [0] }),
      ],
      weekday,
    );
    expect(segments).toEqual([{ start: 0.25, end: 0.5, tone: 'blocked' }]);
  });

  it('splits active and upcoming blocks and skips paused/off-day ones', () => {
    const rules = [
      makeRule({ id: 'a', startMin: 540, endMin: 600 }), // active at 9:30
      makeRule({ id: 'b', startMin: 600, endMin: 660 }), // upcoming at 9:30
      makeRule({ id: 'c', startMin: 480, endMin: 520 }), // done
      makeRule({ id: 'd', startMin: 570, endMin: 610, paused: true }),
      makeRule({ id: 'e', startMin: 560, endMin: 620, days: [0] }),
    ];

    const { active, upcoming } = nextBlocks(rules, 570, weekday);
    expect(active.map((rule) => rule.id)).toEqual(['a']);
    expect(upcoming.map((entry) => entry.rule.id)).toEqual(['b']);
    expect(upcoming[0]?.startsInMin).toBe(30);
  });

  it('computes rule states for chips', () => {
    const rule = makeRule({ startMin: 540, endMin: 600, days: [3] });
    expect(ruleState(rule, 530, weekday)).toBe('upcoming');
    expect(ruleState(rule, 570, weekday)).toBe('active');
    expect(ruleState(rule, 601, weekday)).toBe('done');
    expect(ruleState(rule, 570, 0)).toBe('offDay');
    expect(ruleState({ ...rule, paused: true }, 570, weekday)).toBe('paused');
  });

  it('handles overnight windows in the timeline, states and next blocks', () => {
    // Wednesdays 22:00 -> 02:00: evening on Wed, morning tail on Thu.
    const overnight = makeRule({ id: 'night', startMin: 22 * 60, endMin: 120, days: [3] });
    expect(timelineSegments([overnight], weekday)).toEqual([
      { start: 22 / 24, end: 1, tone: 'blocked' },
    ]);
    // Thursday carries Wednesday's morning tail.
    expect(timelineSegments([overnight], 4)).toEqual([
      { start: 0, end: 2 / 24, tone: 'blocked' },
    ]);
    expect(ruleState(overnight, 23 * 60, weekday)).toBe('active');
    expect(ruleState(overnight, 60, 4)).toBe('active');
    expect(ruleState(overnight, 60, weekday)).toBe('offDay');

    const night = nextBlocks([overnight], 23 * 60, weekday);
    expect(night.active.map((rule) => rule.id)).toEqual(['night']);
    const tail = nextBlocks([overnight], 60, 4);
    expect(tail.active.map((rule) => rule.id)).toEqual(['night']);
  });
});

describe('formatting', () => {
  it('renders ranges and midnight as 24:00', () => {
    expect(formatRange(540, 1020)).toBe('09:00 – 17:00');
    expect(formatRange(1380, 1440)).toBe('23:00 – 24:00');
  });

  it('shows the duration for overnight ranges', () => {
    expect(formatRangeWithDuration(1380, 60)).toBe('23:00 – 01:00 · 2 h');
    expect(formatRangeWithDuration(1380, 30)).toBe('23:00 – 00:30 · 1 h 30 min');
    expect(formatRangeWithDuration(540, 1020)).toBe('09:00 – 17:00');
  });
});
