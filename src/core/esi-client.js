/**
 * EVE Suite — ESI HTTP client
 *
 * Provides:
 *   esiPub(path)                    – unauthenticated public endpoint
 *   esiGet(path, token?)            – GET, optional auth
 *   esiPost(path, body, token?)     – POST with JSON body, optional auth
 *   esiGetPaged(path, token?, cap?) – auto-paginate using X-Pages header
 *   getTok(charId)                  – return a valid access token, refreshing if needed
 *   pLimit(n)                       – concurrency limiter factory
 *   resolveNames(ids)               – bulk id→name via /universe/names/ with cache
 *   nameOf(id, fallback?)           – synchronous name lookup from cache
 *   structureName(id, token)        – resolve a structure name (needs auth)
 */

import { ESI_BASE, SSO_TOKEN, ESI_CONCURRENCY } from './constants.js';
import { loadChars, saveChars, loadClientId, loadNameCache, saveNameCache } from './storage.js';

// ── Concurrency limiter ───────────────────────────────────────────────────────

/**
 * Create a concurrency-limited function wrapper.
 * Identical algorithm to the legacy pLimit/pLimit2 in the HTML files.
 *
 * @param {number} n – max parallel promises
 * @returns {(fn: () => Promise<T>) => Promise<T>}
 */
export function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const [fn, res, rej] = queue.shift();
    Promise.resolve().then(fn).then(
      v  => { active--; res(v); next(); },
      e  => { active--; rej(e); next(); },
    );
  };
  return fn => new Promise((res, rej) => { queue.push([fn, res, rej]); next(); });
}

/** Suite-wide shared limiter — 6 parallel ESI requests. */
export const esiLimit = pLimit(ESI_CONCURRENCY);

// ── Token management ──────────────────────────────────────────────────────────

/**
 * POST to the EVE SSO token endpoint.
 * @param {URLSearchParams|string} body
 * @returns {Promise<object>}
 */
export async function postToken(body) {
  const r = await fetch(SSO_TOKEN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body instanceof URLSearchParams ? body.toString() : body,
  });
  if (!r.ok) {
    let detail = '';
    try { detail = ' ' + (await r.text()).slice(0, 120); } catch { /* ignore */ }
    throw new Error('token HTTP ' + r.status + detail);
  }
  return r.json();
}

/**
 * Refresh the stored token for a character and update localStorage.
 * Throws if no refresh token is stored or if the client ID is missing.
 *
 * @param {number|string} charId
 * @returns {Promise<import('./storage.js').CharEntry>}
 */
export async function refreshTok(charId) {
  const chars = loadChars();
  const s     = chars[String(charId)];
  if (!s || !s.refresh) throw new Error('no refresh token for character ' + charId);
  const cid   = loadClientId();
  if (!cid) throw new Error('sign-in config not shared yet — open the Toolset hub (index.html) once');
  const t     = await postToken(new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: s.refresh,
    client_id:     cid,
  }));
  const updated = {
    ...s,
    access:  t.access_token,
    refresh: t.refresh_token || s.refresh,
    expires: Date.now() + (t.expires_in || 1200) * 1000,
  };
  chars[String(charId)] = updated;
  saveChars(chars);
  return updated;
}

/**
 * Return a CharEntry with a valid access token for charId, refreshing if
 * the token has expired or is about to (within 60 s).
 * Returns null if the character is not in the roster.
 *
 * @param {number|string} charId
 * @returns {Promise<import('./storage.js').CharEntry|null>}
 */
export async function getTok(charId) {
  const chars = loadChars();
  const s     = chars[String(charId)];
  if (!s) return null;
  if (s.expires > Date.now() + 60_000) return s;
  try   { return await refreshTok(charId); }
  catch { return s.expires > Date.now() ? s : null; }
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Internal fetch wrapper for ESI.
 * Returns { json, res } so callers that need response headers (e.g. X-Pages)
 * can access them.
 *
 * @param {string} path   – ESI path, e.g. '/characters/123/assets/'
 * @param {{ token?: string, method?: string, body?: any }} [opts]
 * @returns {Promise<{ json: any, res: Response }>}
 */
export async function esiFetch(path, opts = {}) {
  const headers = {};
  if (opts.token)              headers['Authorization'] = 'Bearer ' + opts.token;
  if (opts.body !== undefined) headers['Content-Type']  = 'application/json';

  const r = await fetch(ESI_BASE + path, {
    method:  opts.method || 'GET',
    headers,
    body:    opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!r.ok) {
    const err = new Error(`ESI ${r.status} on ${path.split('?')[0]}`);
    err.status = r.status;
    throw err;
  }

  return { json: await r.json(), res: r };
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Unauthenticated ESI GET. For public endpoints that need no token.
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function esiPub(path) {
  const r = await fetch(ESI_BASE + path);
  if (!r.ok) { const e = new Error('ESI ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

/**
 * Authenticated (or public) ESI GET.
 * @param {string}         path
 * @param {string|null}   [token]  – omit for public endpoints
 * @returns {Promise<any>}
 */
export async function esiGet(path, token) {
  return (await esiFetch(path, { token })).json;
}

/**
 * Authenticated (or public) ESI POST with a JSON body.
 * @param {string}         path
 * @param {any}            body
 * @param {string|null}   [token]
 * @returns {Promise<any>}
 */
export async function esiPost(path, body, token) {
  return (await esiFetch(path, { method: 'POST', body, token })).json;
}

/**
 * Auto-paginated ESI GET using the X-Pages response header.
 *
 * @param {string}       path    – must not already include a `page=` param
 * @param {string|null} [token]
 * @param {number}      [cap=10] – maximum pages to fetch (safety ceiling)
 * @returns {Promise<any[]>}
 */
export async function esiGetPaged(path, token, cap = 10) {
  const sep   = path.includes('?') ? '&' : '?';
  const first = await esiFetch(path + sep + 'page=1', { token });
  let   out   = first.json;
  const pages = Math.min(parseInt(first.res.headers.get('X-Pages') || '1', 10), cap);
  for (let p = 2; p <= pages; p++) {
    try {
      const page = await esiFetch(path + sep + 'page=' + p, { token });
      out = out.concat(page.json);
    } catch { /* partial results are better than none */ }
  }
  return out;
}

// ── Universe name resolution ──────────────────────────────────────────────────

// Module-level cache — loaded once from localStorage, written back on change.
let _nameCache = null;

function getNameCache() {
  if (!_nameCache) _nameCache = loadNameCache();
  return _nameCache;
}

function flushNameCache() {
  if (_nameCache) saveNameCache(_nameCache);
}

/**
 * Resolve a single chunk of IDs via POST /universe/names/.
 * On a 404 with multiple IDs, binary-splits and retries.
 */
async function _resolveChunk(chunk) {
  const cache = getNameCache();
  try {
    const results = await esiPost('/universe/names/', chunk);
    results.forEach(r => { cache[r.id] = { n: r.name, c: r.category }; });
  } catch (e) {
    if (e.status === 404 && chunk.length > 1) {
      const m = chunk.length >> 1;
      await _resolveChunk(chunk.slice(0, m));
      await _resolveChunk(chunk.slice(m));
    } else if (e.status === 404) {
      cache[chunk[0]] = { n: '#' + chunk[0], c: 'unknown' };
    }
    // Other errors: leave the IDs unresolved this pass
  }
}

/**
 * Bulk-resolve an array of numeric IDs to names, using and populating the
 * local cache. Unknown IDs are fetched in batches of 900 (ESI limit).
 *
 * @param {number[]} ids
 * @returns {Promise<{ [id: number]: string|null }>}
 */
export async function resolveNames(ids) {
  const cache = getNameCache();
  const need  = [...new Set(ids.filter(i => i && i < 1e12 && !cache[i]))];
  for (let i = 0; i < need.length; i += 900) {
    await _resolveChunk(need.slice(i, i + 900).map(Number));
  }
  if (need.length) flushNameCache();
  const out = {};
  ids.forEach(i => { out[i] = cache[i] ? cache[i].n : null; });
  return out;
}

/**
 * Synchronous name lookup from cache. Returns the fallback (default '#id')
 * if the ID is not yet cached.
 *
 * @param {number|string} id
 * @param {string}        [fallback]
 * @returns {string}
 */
export function nameOf(id, fallback) {
  const cache = getNameCache();
  return cache[id] ? cache[id].n : (fallback !== undefined ? fallback : '#' + id);
}

/**
 * Resolve a structure name. Checks the cache first; if missing, hits
 * /universe/structures/{id}/ (requires esi-universe.read_structures.v1).
 *
 * @param {number|string} id
 * @param {string}        token – access token with the structure-read scope
 * @returns {Promise<string>}
 */
export async function structureName(id, token) {
  const cache = getNameCache();
  if (cache[id]) return cache[id].n;
  try {
    const info = await esiGet('/universe/structures/' + id + '/', token);
    const name = info.name || ('#' + id);
    cache[id]  = { n: name, c: 'structure' };
    flushNameCache();
    return name;
  } catch {
    return '#' + id;
  }
}
