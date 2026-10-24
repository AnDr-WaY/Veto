/**
 * Data seam for the Rules feature.
 *
 * Screens and hooks read data ONLY through useRules()/useRuleActions() from
 * './hooks', which delegate to the backend configured here.
 *
 * Default backend: in-memory mock (see ./__mocks__/mockBackend). The real
 * store worker (Ч5) — or the integrate step — calls configureRulesBackend()
 * once at the app root to swap in the MMKV-backed repository and the real
 * BlockingEngine. Demo mode (EXPO_PUBLIC_ENGINE=mock) keeps the mock engine
 * but starts empty, like production — the user creates blocks themselves.
 */

import type { BlockingEngine, RulesRepository } from '@/core/contracts';
import { createMockBackend } from './__mocks__/mockBackend';

export interface RulesBackend {
  repository: RulesRepository;
  /** Null until a real engine is wired; hooks then skip engine calls. */
  engine: BlockingEngine | null;
}

let configured: RulesBackend | null = null;
let cachedDefault: RulesBackend | null = null;

/** True when the app runs in demo mode (mock engine, empty data). */
export function isDemoEngine(): boolean {
  return process.env.EXPO_PUBLIC_ENGINE === 'mock';
}

/**
 * Wire the real backend (Ч5 store + Ч3 engine). Pass null to fall back
 * to the mock default (used by tests).
 */
export function configureRulesBackend(backend: RulesBackend | null): void {
  configured = backend;
  cachedDefault = null;
}

export function getRulesBackend(): RulesBackend {
  if (configured) {
    return configured;
  }
  if (!cachedDefault) {
    const mock = createMockBackend();
    cachedDefault = { repository: mock.repository, engine: mock.engine };
  }
  return cachedDefault;
}

/** Test helper: drop the cached mock so each test gets a fresh store. */
export function resetRulesBackendForTests(): void {
  configured = null;
  cachedDefault = null;
}
