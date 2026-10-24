import { EventLog, MemoryEventLogDriver, SqliteEventLogDriver } from '../eventLog';
import type { EventRecord, EventType } from '../../../core/contracts';

// expo-sqlite cannot load under jest (its transitive expo-asset is not
// hoisted), so the module is replaced with a tiny SQL-shaped fake that
// validates the exact statements the driver emits.
interface FakeRow {
  id: string;
  type: EventType;
  rule_id: string | null;
  at: number;
  meta: string | null;
}

// "mock"-prefixed so the hoisted jest.mock factory may close over it.
const mockStore = { rows: [] as FakeRow[] };

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    runSync: (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('INSERT OR REPLACE INTO events')) {
        const [id, type, rule_id, at, meta] = params as [
          string,
          EventType,
          string | null,
          number,
          string | null,
        ];
        mockStore.rows = mockStore.rows.filter((row) => row.id !== id);
        mockStore.rows.push({ id, type, rule_id, at, meta });
        return;
      }
      if (sql.startsWith('DELETE FROM events')) {
        mockStore.rows = [];
        return;
      }
      throw new Error(`unexpected statement: ${sql}`);
    },
    getAllSync: (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('SELECT id, type, rule_id, at, meta FROM events WHERE at >= ?')) {
        const [from, to] = params as [number, number];
        return mockStore.rows
          .filter((row) => row.at >= from && row.at <= to)
          .sort((a, b) => a.at - b.at);
      }
      if (sql.startsWith('SELECT id, type, rule_id, at, meta FROM events ORDER BY at ASC')) {
        return [...mockStore.rows].sort((a, b) => a.at - b.at);
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  }),
}));

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1',
    type: 'shield_shown',
    ruleId: 'rule-1',
    at: 1_000,
    ...overrides,
  };
}

describe('EventLog over the memory driver', () => {
  let log: EventLog;

  beforeEach(() => {
    log = new EventLog(new MemoryEventLogDriver());
  });

  it('is not persistent by construction (explicit flag)', () => {
    expect(log.persistent).toBe(false);
  });

  it('roundtrips events with meta and null ruleId', async () => {
    await log.append(
      event({
        id: 'a',
        type: 'rule_applied',
        ruleId: 'r1',
        at: 100,
        meta: { title: 'Focus', rearmed: true, minutes: 30 },
      }),
    );
    await log.append(event({ id: 'b', type: 'paused', ruleId: null, at: 200 }));
    await log.append(event({ id: 'c', type: 'bypass', at: 300, meta: {} }));

    const events = await log.eventsBetween(0, 1_000);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      id: 'a',
      type: 'rule_applied',
      ruleId: 'r1',
      at: 100,
      meta: { title: 'Focus', rearmed: true, minutes: 30 },
    });
    expect(events[1]).toEqual({ id: 'b', type: 'paused', ruleId: null, at: 200 });
    expect(events[2]).toMatchObject({ id: 'c', type: 'bypass' });
  });

  it('filters by the [from, to] window and sorts by time', async () => {
    await log.append(event({ id: 'a', at: 500 }));
    await log.append(event({ id: 'b', at: 100 }));
    await log.append(event({ id: 'c', at: 900 }));
    await log.append(event({ id: 'd', at: 1_500 }));

    const events = await log.eventsBetween(100, 900);
    expect(events.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('record assigns id and timestamp', async () => {
    const recorded = await log.record('resumed', null, { auto: true });
    expect(recorded.id).toMatch(/^evt_/);
    expect(recorded.type).toBe('resumed');
    expect(recorded.ruleId).toBeNull();
    expect(Math.abs(recorded.at - Date.now())).toBeLessThan(1_000);

    const all = await log.all();
    expect(all).toHaveLength(1);
  });

  it('degrades corrupt meta to undefined', async () => {
    const memory = new MemoryEventLogDriver();
    memory.append({ id: 'x', type: 'bypass', ruleId: null, at: 1, meta: '{broken' });
    const broken = new EventLog(memory);
    const events = await broken.eventsBetween(0, 10);
    expect(events[0].meta).toBeUndefined();
  });

  it('clears all events', async () => {
    await log.record('paused');
    log.clear();
    await expect(log.all()).resolves.toEqual([]);
  });
});

describe('EventLog over the sqlite driver', () => {
  // expo-sqlite cannot load under jest (its transitive expo-asset is not
  // hoisted), so the module is replaced with a tiny SQL-shaped fake that
  // validates the exact statements the driver emits (jest.mock above).

  beforeEach(() => {
    mockStore.rows = [];
  });

  it('persists rows through the sqlite statement surface', async () => {
    const driver = SqliteEventLogDriver.open();
    expect(driver).not.toBeNull();

    const log = new EventLog(driver as SqliteEventLogDriver, true);
    expect(log.persistent).toBe(true);

    await log.append(event({ id: 'a', at: 10, meta: { minutes: 5 } }));
    await log.append(event({ id: 'b', at: 20, ruleId: null }));
    await log.append(event({ id: 'c', at: 30 }));

    const window = await log.eventsBetween(15, 25);
    expect(window.map((e) => e.id)).toEqual(['b']);
    expect(window[0].meta).toBeUndefined();

    const all = await log.all();
    expect(all.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(all[0].meta).toEqual({ minutes: 5 });
  });

  it('replaces rows with the same id (INSERT OR REPLACE)', async () => {
    const driver = SqliteEventLogDriver.open();
    const log = new EventLog(driver as SqliteEventLogDriver, true);

    await log.append(event({ id: 'a', at: 10 }));
    await log.append(event({ id: 'a', at: 99 }));
    const all = await log.all();
    expect(all).toHaveLength(1);
    expect(all[0].at).toBe(99);
  });

  it('opens the shared singleton over sqlite when available', () => {
    // In this file expo-sqlite is mocked, so the shared log is "persistent";
    // in every other test file it falls back to memory.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { eventLog: shared } = require('../eventLog') as { eventLog: EventLog };
    expect(shared.persistent).toBe(true);
  });
});
