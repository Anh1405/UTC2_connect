import { GiphyFetch } from '@giphy/js-fetch-api';

const gf = new GiphyFetch(import.meta.env.VITE_GIPHY_KEY);

// Simple in-memory cache
const memCache = new Map();
const cache = async (key, fn, ttl = 30_000) => {
  const now = Date.now();
  const cached = memCache.get(key);
  if (cached && now - cached.ts < ttl) return cached.val;
  const val = await fn();
  memCache.set(key, { val, ts: now });
  return val;
};

// Exports used by GifPicker
export const searchGifs = (q, { offset = 0, limit = 10 } = {}) => {
  if (!q || !q.trim()) {
    // trending as fallback
    return cache(`trending:${offset}:${limit}`, () => gf.trending({ offset, limit }), 30_000);
  }
  const key = `search:${q}:${offset}:${limit}`;
  return cache(key, () => gf.search(q, { offset, limit, lang: 'vi' }), 15_000);
};

export const trendingGifs = ({ offset = 0, limit = 10 } = {}) => {
  return cache(`trending:${offset}:${limit}`, () => gf.trending({ offset, limit }), 30_000);
};

export const translateGif = (phrase) => {
  if (!phrase) return Promise.resolve(null);
  const key = `translate:${phrase}`;
  return cache(key, () => gf.translate(phrase, { lang: 'vi' }), 10_000);
};