/**
 * App catalog seam: genre mapping and static catalog invariants. The
 * network path (iTunes Lookup) is not exercised here — only its pure
 * pieces.
 */

import { CATALOG_APPS, CATEGORY_ORDER, genreToCategory } from '../appCatalog';

describe('genreToCategory', () => {
  it('maps real App Store genres onto catalog buckets', () => {
    expect(genreToCategory('Social Networking')).toBe('social');
    expect(genreToCategory('Photo & Video')).toBe('video');
    expect(genreToCategory('Entertainment')).toBe('video');
    expect(genreToCategory('Games')).toBe('games');
    expect(genreToCategory('Productivity')).toBe('messaging');
    expect(genreToCategory('Utilities')).toBe('browsers');
  });

  it('returns null for unknown genres so static data stays', () => {
    expect(genreToCategory('Medical')).toBeNull();
    expect(genreToCategory('')).toBeNull();
  });
});

describe('CATALOG_APPS', () => {
  it('has unique ids and valid static categories', () => {
    const ids = CATALOG_APPS.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const app of CATALOG_APPS) {
      expect(CATEGORY_ORDER).toContain(app.category);
      expect(app.name.length).toBeGreaterThan(0);
    }
  });
});
