import React, { act } from 'react';
import { renderElement } from './testUtils';
import { TimelineBar } from '../components/TimelineBar';

/**
 * Geometry tests: the track measures itself via onLayout, so the tests
 * fire the handler with a fixed width and then assert the pixel boxes
 * the segments land on (react-test-renderer is ambient-any, predicates
 * are typed structurally).
 */

type Box = { left?: number; width?: number };
type Instance = { props?: { style?: unknown; onLayout?: unknown } };

function fireLayout(renderer: { root: any }, width: number) {
  const track = renderer.root.find(
    (node: Instance) => typeof node.props?.onLayout === 'function',
  );
  act(() => {
    (track.props as { onLayout: (event: unknown) => void }).onLayout({
      nativeEvent: { layout: { width } },
    });
  });
}

/** Segment overlays: host Views with plain-object styles pinned top+bottom (the RN jest mock wraps every view, so only string-typed host nodes count). */
function segmentBoxes(renderer: { root: any }): Box[] {
  return renderer.root
    .findAll((node: Instance & { type?: unknown }) => {
      const style = node.props?.style;
      return (
        typeof node.type === 'string' &&
        typeof style === 'object' &&
        style !== null &&
        !Array.isArray(style) &&
        (style as Box & { position?: string; top?: number; bottom?: number }).position ===
          'absolute' &&
        (style as Box & { top?: number }).top === 0 &&
        (style as Box & { bottom?: number }).bottom === 0
      );
    })
    .map((node: Instance) => node.props?.style as Box);
}

describe('TimelineBar', () => {
  it('falls back to percentage boxes before the first layout', () => {
    const renderer = renderElement(<TimelineBar segments={[{ start: 0.5, end: 0.51 }]} />);
    const flat = JSON.stringify(renderer.toJSON());
    expect(flat).toContain('"left":"50%"');
    expect(flat).toContain('"width":"1%"');
  });

  it('inflates a few-minute window to a visible sliver', () => {
    const renderer = renderElement(<TimelineBar segments={[{ start: 0.5, end: 0.505 }]} />);
    fireLayout(renderer, 350);
    // 0.505 × 350 rounds to a 2pt sliver — inflated to the 6pt minimum.
    expect(segmentBoxes(renderer)).toEqual([expect.objectContaining({ left: 175, width: 6 })]);
  });

  it('grows an end-of-day sliver leftward instead of off the edge', () => {
    const renderer = renderElement(<TimelineBar segments={[{ start: 0.995, end: 1 }]} />);
    fireLayout(renderer, 350);
    // Right edge pinned at 350; the minimum sliver extends leftward.
    expect(segmentBoxes(renderer)).toEqual([expect.objectContaining({ left: 344, width: 6 })]);
  });

  it('rounds neighbouring windows onto a shared edge (no hairline gap)', () => {
    const renderer = renderElement(
      <TimelineBar segments={[{ start: 0, end: 0.375 }, { start: 0.375, end: 0.5 }]} />,
    );
    fireLayout(renderer, 350);
    const [first, second] = segmentBoxes(renderer);
    expect(first.left).toBe(0);
    expect((first.left ?? 0) + (first.width ?? 0)).toBe(second.left); // flush
    expect((second.left ?? 0) + (second.width ?? 0)).toBe(175); // 0.5 × 350
  });
});
