/**
 * App catalog for the creation flows' Apps step.
 *
 * Static base catalog + real category fetch: the iTunes Lookup API returns
 * each app's actual App Store genre, which we map onto our buckets. Plain
 * HTTPS — works in Expo Go, dev-client and production, no special
 * entitlements. Overrides are cached in memory for the session; any failure
 * silently falls back to the static categories.
 *
 * Apple never exposes the device's installed-app list (or their categories)
 * to the app — on real iOS builds the actual selection happens through the
 * system FamilyActivityPicker. This catalog powers the demo/preview picker
 * everywhere else.
 */

export type CatalogCategory = 'social' | 'messaging' | 'video' | 'games' | 'browsers';

export const CATEGORY_ORDER: readonly CatalogCategory[] = [
  'social',
  'messaging',
  'video',
  'games',
  'browsers',
];

export interface CatalogApp {
  id: string;
  name: string;
  category: CatalogCategory;
  /** iTunes track id — present when the real genre can be fetched. */
  itunesId?: number;
}

/**
 * Demo app catalog (Expo Go / demo mode). `itunesId` is only set where the
 * App Store track id is stable and well-known; apps without one keep their
 * static category.
 */
export const CATALOG_APPS: readonly CatalogApp[] = [
  { id: 'instagram', name: 'Instagram', category: 'social', itunesId: 389801252 },
  { id: 'tiktok', name: 'TikTok', category: 'social', itunesId: 835599320 },
  { id: 'x', name: 'X', category: 'social', itunesId: 333903271 },
  { id: 'reddit', name: 'Reddit', category: 'social', itunesId: 1064216828 },
  { id: 'threads', name: 'Threads', category: 'social', itunesId: 6446906020 },
  { id: 'snapchat', name: 'Snapchat', category: 'social', itunesId: 447188370 },
  { id: 'linkedin', name: 'LinkedIn', category: 'social', itunesId: 288429040 },
  { id: 'whatsapp', name: 'WhatsApp', category: 'messaging', itunesId: 310633997 },
  { id: 'telegram', name: 'Telegram', category: 'messaging', itunesId: 686449807 },
  { id: 'discord', name: 'Discord', category: 'messaging', itunesId: 985746746 },
  { id: 'messenger', name: 'Messenger', category: 'messaging', itunesId: 454638411 },
  { id: 'slack', name: 'Slack', category: 'messaging', itunesId: 618783545 },
  { id: 'youtube', name: 'YouTube', category: 'video', itunesId: 544007664 },
  { id: 'netflix', name: 'Netflix', category: 'video', itunesId: 363590051 },
  { id: 'twitch', name: 'Twitch', category: 'video', itunesId: 467248092 },
  { id: 'vk', name: 'VK', category: 'video' },
  { id: 'roblox', name: 'Roblox', category: 'games', itunesId: 431946152 },
  { id: 'steam', name: 'Steam', category: 'games' },
  { id: 'brawl-stars', name: 'Brawl Stars', category: 'games' },
  { id: 'clash-royale', name: 'Clash Royale', category: 'games', itunesId: 553934876 },
  { id: 'safari', name: 'Safari', category: 'browsers' },
  { id: 'chrome', name: 'Chrome', category: 'browsers', itunesId: 535886823 },
  { id: 'arc', name: 'Arc', category: 'browsers' },
  { id: 'opera', name: 'Opera', category: 'browsers' },
];

/** Real App Store genre → catalog bucket. Unknown genres keep static data. */
const GENRE_BUCKETS: Record<string, CatalogCategory> = {
  'Social Networking': 'social',
  News: 'social',
  'Photo & Video': 'video',
  Entertainment: 'video',
  Games: 'games',
  Productivity: 'messaging',
  Utilities: 'browsers',
};

export function genreToCategory(genre: string): CatalogCategory | null {
  return GENRE_BUCKETS[genre] ?? null;
}

interface LookupResult {
  results?: { trackId?: number; primaryGenreName?: string }[];
}

/** Session cache — one network hit per JS context at most. */
const overridesCache = new Map<string, CatalogCategory>();

/**
 * Real categories for the catalog apps, in one batched iTunes Lookup
 * request. Rejects on network/HTTP failure; callers must fall back to the
 * static catalog.
 */
export async function fetchCategoryOverrides(): Promise<Record<string, CatalogCategory>> {
  if (overridesCache.size > 0) {
    return Object.fromEntries(overridesCache);
  }

  const withIds = CATALOG_APPS.filter((app) => typeof app.itunesId === 'number');
  const appByTrackId = new Map<number, string>(
    withIds.map((app) => [app.itunesId as number, app.id]),
  );

  const ids = withIds.map((app) => app.itunesId).join(',');
  const response = await fetch(`https://itunes.apple.com/lookup?id=${ids}`);
  if (!response.ok) {
    throw new Error(`iTunes lookup failed: ${response.status}`);
  }
  const data = (await response.json()) as LookupResult;

  const overrides: Record<string, CatalogCategory> = {};
  for (const result of data.results ?? []) {
    const appId = result.trackId !== undefined ? appByTrackId.get(result.trackId) : undefined;
    const genre = result.primaryGenreName;
    if (!appId || !genre) {
      continue;
    }
    const bucket = genreToCategory(genre);
    if (bucket) {
      overrides[appId] = bucket;
      overridesCache.set(appId, bucket);
    }
  }
  return overrides;
}
