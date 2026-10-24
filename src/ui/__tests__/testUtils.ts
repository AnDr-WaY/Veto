import {act} from 'react';
import TestRenderer from 'react-test-renderer';
import type {ReactElement} from 'react';

// React 19 act() requires this flag; react-test-renderer relies on act.
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Sync test renderer for snapshot tests: wraps create() in act() so the
 * initial commit is flushed and no "not wrapped in act" warnings occur.
 */
export function renderElement(element: ReactElement) {
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

export function jsonOf(renderer: ReturnType<typeof TestRenderer.create>): unknown {
  return renderer.toJSON();
}
