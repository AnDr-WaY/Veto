import type { EventRecord, EventType, StatsRepository } from '../../core/contracts';
import { newId } from './keys';

/** Shape of EventRecord.meta per the contract (inline there, named here). */
export type EventMeta = Record<string, string | number | boolean>;

/**
 * Append-only event log (contract: StatsRepository, EventRecord).
 *
 * Production storage is expo-sqlite. The native module is loaded through a
 * lexical `require` guarded by try/catch: under jest — and anywhere the
 * sqlite module cannot load — the log transparently falls back to an
 * in-memory driver with identical behavior, keeping stores and stats fully
 * testable.
 */

interface EventRow {
  id: string;
  type: EventType;
  ruleId: string | null;
  at: number;
  meta: string | null;
}

/** Minimal sync sqlite surface used by the driver (expo-sqlite sync API). */
export interface SqliteDatabaseLike {
  execSync(source: string): unknown;
  runSync(source: string, params?: unknown[]): unknown;
  getAllSync(source: string, params?: unknown[]): unknown[];
}

export interface EventLogDriver {
  append(row: EventRow): void;
  between(fromMs: number, toMs: number): EventRow[];
  all(): EventRow[];
  clear(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  rule_id TEXT,
  at INTEGER NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
`;

export class MemoryEventLogDriver implements EventLogDriver {
  private rows: EventRow[] = [];

  append(row: EventRow): void {
    this.rows.push({ ...row });
  }

  between(fromMs: number, toMs: number): EventRow[] {
    return this.rows
      .filter((row) => row.at >= fromMs && row.at <= toMs)
      .sort((a, b) => a.at - b.at);
  }

  all(): EventRow[] {
    return [...this.rows].sort((a, b) => a.at - b.at);
  }

  clear(): void {
    this.rows = [];
  }
}

export const EVENT_DB_NAME = 'veto-events.db';

export class SqliteEventLogDriver implements EventLogDriver {
  private readonly db: SqliteDatabaseLike;

  constructor(db: SqliteDatabaseLike) {
    this.db = db;
    db.execSync(SCHEMA);
  }

  /** Opens the app database; returns null when sqlite is unavailable. */
  static open(name: string = EVENT_DB_NAME): SqliteEventLogDriver | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SQLite = require('expo-sqlite') as {
        openDatabaseSync: (databaseName: string) => SqliteDatabaseLike;
      };
      return new SqliteEventLogDriver(SQLite.openDatabaseSync(name));
    } catch {
      return null;
    }
  }

  append(row: EventRow): void {
    this.db.runSync(
      'INSERT OR REPLACE INTO events (id, type, rule_id, at, meta) VALUES (?, ?, ?, ?, ?)',
      [row.id, row.type, row.ruleId, row.at, row.meta],
    );
  }

  between(fromMs: number, toMs: number): EventRow[] {
    const rows = this.db.getAllSync(
      'SELECT id, type, rule_id, at, meta FROM events WHERE at >= ? AND at <= ? ORDER BY at ASC',
      [fromMs, toMs],
    ) as Record<string, unknown>[];
    return rows.map(toRow);
  }

  all(): EventRow[] {
    const rows = this.db.getAllSync(
      'SELECT id, type, rule_id, at, meta FROM events ORDER BY at ASC',
      [],
    ) as Record<string, unknown>[];
    return rows.map(toRow);
  }

  clear(): void {
    this.db.runSync('DELETE FROM events', []);
  }
}

function toRow(raw: Record<string, unknown>): EventRow {
  return {
    id: String(raw.id),
    type: raw.type as EventType,
    ruleId: raw.rule_id === null || raw.rule_id === undefined ? null : String(raw.rule_id),
    at: Number(raw.at),
    meta: raw.meta === null || raw.meta === undefined ? null : String(raw.meta),
  };
}

function encodeMeta(meta?: EventMeta): string | null {
  return meta === undefined ? null : JSON.stringify(meta);
}

function decodeMeta(raw: string | null): EventMeta | undefined {
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as EventMeta;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Event log repository (contract StatsRepository) + small conveniences used
 * by the stores: `record` builds and appends an event in one call.
 */
export class EventLog implements StatsRepository {
  private readonly driver: EventLogDriver;

  /** False when running on the in-memory fallback (no sqlite available). */
  readonly persistent: boolean;

  constructor(driver: EventLogDriver, persistent = false) {
    this.driver = driver;
    this.persistent = persistent;
  }

  async append(event: EventRecord): Promise<void> {
    this.driver.append({
      id: event.id,
      type: event.type,
      ruleId: event.ruleId,
      at: event.at,
      meta: encodeMeta(event.meta),
    });
  }

  async eventsBetween(fromMs: number, toMs: number): Promise<EventRecord[]> {
    return this.driver.between(fromMs, toMs).map((row) => ({
      id: row.id,
      type: row.type,
      ruleId: row.ruleId,
      at: row.at,
      ...(decodeMeta(row.meta) !== undefined ? { meta: decodeMeta(row.meta) } : {}),
    }));
  }

  /** Builds an event (id + timestamp assigned) and appends it. */
  async record(
    type: EventType,
    ruleId: string | null = null,
    meta?: EventMeta,
  ): Promise<EventRecord> {
    const event: EventRecord = {
      id: newId('evt'),
      type,
      ruleId,
      at: Date.now(),
      ...(meta !== undefined ? { meta } : {}),
    };
    await this.append(event);
    return event;
  }

  async all(): Promise<EventRecord[]> {
    return this.driver.all().map((row) => ({
      id: row.id,
      type: row.type,
      ruleId: row.ruleId,
      at: row.at,
      ...(decodeMeta(row.meta) !== undefined ? { meta: decodeMeta(row.meta) } : {}),
    }));
  }

  clear(): void {
    this.driver.clear();
  }
}

export function createEventLog(): EventLog {
  const sqlite = SqliteEventLogDriver.open();
  return sqlite !== null
    ? new EventLog(sqlite, true)
    : new EventLog(new MemoryEventLogDriver(), false);
}

/** Shared app-wide event log. */
export const eventLog: EventLog = createEventLog();
