/**
 * In-memory mock backend for the Rules feature.
 *
 * Used by: jest tests (default), demo mode (EXPO_PUBLIC_ENGINE=mock) and as
 * the pre-integration default until the real store (Ч5) is wired through
 * configureRulesBackend(). Implements the Ч1 contracts only.
 */

import type {
  AppSettings,
  BlockRule,
  BlockingEngine,
  AuthStatus,
  RulesRepository,
} from '@/core/contracts';

/** Deterministic-ish selection ref for a set of demo app ids. */
export function demoSelectionRef(ids: string[]): string {
  return `mock-selection:${[...ids].sort().join('+') || 'none'}`;
}

/** Decode the deterministic demo ref back into app ids (controlled toggling). */
export function parseDemoSelection(selectionRef: string): string[] {
  if (!selectionRef.startsWith('mock-selection:')) {
    return [];
  }
  const ids = selectionRef.slice('mock-selection:'.length);
  return ids.length > 0 ? ids.split('+') : [];
}

type Listener = () => void;

/** RulesRepository over a plain Map, with change notifications for live UI. */
export class InMemoryRulesRepository implements RulesRepository {
  private readonly rules = new Map<string, BlockRule>();
  private readonly listeners = new Set<Listener>();

  async list(): Promise<BlockRule[]> {
    return [...this.rules.values()].sort(
      (a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id),
    );
  }

  async get(id: string): Promise<BlockRule | null> {
    return this.rules.get(id) ?? null;
  }

  async save(rule: BlockRule): Promise<void> {
    this.rules.set(rule.id, { ...rule });
    this.emit();
  }

  async remove(id: string): Promise<void> {
    if (this.rules.delete(id)) {
      this.emit();
    }
  }

  /** Non-contract extra: lets useRules() live-update without polling. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test/demo helper: bulk insert without notifications. */
  seed(rules: BlockRule[]): void {
    for (const rule of rules) {
      this.rules.set(rule.id, { ...rule });
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

/** BlockingEngine stub: authorizes instantly, applies by doing nothing. */
export class MockEngine implements BlockingEngine {
  async authorize(): Promise<AuthStatus> {
    return 'approved';
  }

  async apply(_rule: BlockRule): Promise<void> {
    /* demo: nothing to arm */
  }

  async remove(_ruleId: string): Promise<void> {
    /* demo: nothing to disarm */
  }

  async pauseAll(_durationMin: number): Promise<void> {
    /* demo */
  }

  async resumeAll(): Promise<void> {
    /* demo */
  }

  async rearmAll(): Promise<void> {
    /* demo */
  }
}

/** Minimal AppSettings stub — settings themselves belong to Ч5. */
export const mockSettings: AppSettings = {
  globalPausedUntil: null,
  hapticsEnabled: true,
};

/**
 * Fresh in-memory repository + mock engine. The app always starts EMPTY —
 * the user creates blocks themselves (spec decision #2). Tests stage data
 * explicitly via repository.seed([...]).
 */
export function createMockBackend(): {
  repository: InMemoryRulesRepository;
  engine: MockEngine;
} {
  return { repository: new InMemoryRulesRepository(), engine: new MockEngine() };
}
