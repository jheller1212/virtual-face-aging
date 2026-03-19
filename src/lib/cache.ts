const CACHE_KEY = 'vfa_result_cache';
const MAX_ENTRIES = 20;

interface CacheEntry {
  resultB64: string;
  timestamp: number;
}

type CacheMap = Record<string, CacheEntry>;

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: CacheMap) {
  // Evict oldest entries if over limit
  const entries = Object.entries(cache);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const keep = entries.slice(entries.length - MAX_ENTRIES);
    cache = Object.fromEntries(keep);
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — clear cache and retry
    localStorage.removeItem(CACHE_KEY);
  }
}

/** Hash a file's contents + settings into a cache key. */
export async function buildCacheKey(
  file: File,
  currentAge: number,
  targetAge: number,
  realism: number,
  quality: string,
  size: string,
  customPrompt: string
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${fileHash}_${currentAge}_${targetAge}_${realism}_${quality}_${size}_${customPrompt}`;
}

export function getCachedResult(key: string): string | null {
  const cache = loadCache();
  return cache[key]?.resultB64 ?? null;
}

export function setCachedResult(key: string, resultB64: string) {
  const cache = loadCache();
  cache[key] = { resultB64, timestamp: Date.now() };
  saveCache(cache);
}
