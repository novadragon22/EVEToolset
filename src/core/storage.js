/**
 * EVE Suite — localStorage helpers
 *
 * Wraps every localStorage access so:
 *   • parse errors never throw into tool code
 *   • quota errors on writes are silently caught (read-only tool contexts
 *     should still function; the worst outcome is a lost preference)
 *   • every key is imported from constants so there's no magic string drift
 *
 * This module does NOT import esi-client or auth — it is a leaf dependency
 * that those modules may import safely.
 */

import {
  KEY_CHARS,
  KEY_CLIENT_ID,
  KEY_CHAR_SECTIONS,
  KEY_DASHBOARD,
  KEY_NAME_CACHE,
  MAX_SUITE_CHARS,
} from './constants.js';

// ── Raw get/set helpers ───────────────────────────────────────────────────────

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Character roster ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} CharEntry
 * @property {string}      access   – current access token (JWT)
 * @property {string}      refresh  – refresh token
 * @property {number}      expires  – token expiry as Unix ms timestamp
 * @property {number}      charId
 * @property {string}      charName
 * @property {number|null} corpId
 * @property {string}      corpName
 */

/**
 * Load the full roster from localStorage.
 * @returns {{ [charId: string]: CharEntry }}
 */
export function loadChars() {
  return lsGet(KEY_CHARS, {});
}

/**
 * Persist the roster to localStorage.
 * @param {{ [charId: string]: CharEntry }} chars
 */
export function saveChars(chars) {
  lsSet(KEY_CHARS, chars);
}

/**
 * Upsert a single character entry, enforcing the MAX_SUITE_CHARS FIFO cap.
 * Existing entries are updated in-place (no position change).
 * New entries that would exceed the cap evict the oldest (first) key.
 *
 * @param {CharEntry} entry – must include charId
 * @returns {{ [charId: string]: CharEntry }} updated roster
 */
export function upsertChar(entry) {
  const chars = loadChars();
  const id    = String(entry.charId);
  const isNew = chars[id] == null;
  chars[id]   = entry;
  if (isNew) {
    const ids = Object.keys(chars);
    while (ids.length > MAX_SUITE_CHARS) {
      delete chars[ids.shift()];
    }
  }
  saveChars(chars);
  return chars;
}

/**
 * Remove a character from the roster.
 * @param {number|string} charId
 * @returns {{ [charId: string]: CharEntry }} updated roster
 */
export function removeChar(charId) {
  const chars = loadChars();
  delete chars[String(charId)];
  saveChars(chars);
  return chars;
}

// ── Client ID (published by index.html for tool token refreshes) ──────────────

/**
 * Read the suite OAuth client ID that index.html publishes.
 * Returns '' if not yet set (tool opened before ever visiting the hub).
 */
export function loadClientId() {
  try { return localStorage.getItem(KEY_CLIENT_ID) || ''; } catch { return ''; }
}

/**
 * Write the client ID (called once, from index.html after login is set up).
 * @param {string} id
 */
export function saveClientId(id) {
  try { localStorage.setItem(KEY_CLIENT_ID, id); } catch { /* ignore */ }
}

// ── Per-tool character section visibility ─────────────────────────────────────

/**
 * Check whether a character is visible in a given tool's section.
 * Defaults to visible (true) if no preference has been saved.
 *
 * @param {number|string} charId
 * @param {string}        toolKey – e.g. 'colonies', 'treasury'
 */
export function sectionOn(charId, toolKey) {
  try {
    const prefs = lsGet(KEY_CHAR_SECTIONS, {});
    const forId = prefs[String(charId)];
    return !forId || forId[toolKey] !== false;
  } catch {
    return true;
  }
}

/**
 * Persist the visibility state for a character in a tool section.
 *
 * @param {number|string} charId
 * @param {string}        toolKey
 * @param {boolean}       on
 */
export function setSection(charId, toolKey, on) {
  try {
    const prefs   = lsGet(KEY_CHAR_SECTIONS, {});
    const id      = String(charId);
    prefs[id]     = prefs[id] || {};
    prefs[id][toolKey] = on;
    lsSet(KEY_CHAR_SECTIONS, prefs);
  } catch { /* ignore */ }
}

/**
 * Return the IDs of all roster characters that are visible for a tool.
 *
 * @param {string} toolKey
 * @returns {string[]}
 */
export function visibleIds(toolKey) {
  return Object.keys(loadChars()).filter(id => sectionOn(id, toolKey));
}

// ── Dashboard status reporting ─────────────────────────────────────────────────

/**
 * Write a one-liner status blob that index.html reads for the dashboard tiles.
 *
 * @param {string} toolKey  – e.g. 'colonies'
 * @param {string} text     – short human-readable status
 * @param {'ok'|'warn'|'error'} level
 */
export function reportDashboard(toolKey, text, level = 'ok') {
  try {
    const all = lsGet(KEY_DASHBOARD, {});
    all[toolKey] = { text, level, ts: Date.now() };
    lsSet(KEY_DASHBOARD, all);
  } catch { /* ignore */ }
}

/**
 * Read the full dashboard status map.
 * @returns {{ [toolKey: string]: { text: string, level: string, ts: number } }}
 */
export function loadDashboard() {
  return lsGet(KEY_DASHBOARD, {});
}

// ── Universe name cache ────────────────────────────────────────────────────────

/** Maximum entries kept in the name cache before the oldest are pruned. */
const NAME_CACHE_MAX  = 9_000;
const NAME_CACHE_KEEP = 8_000;

/**
 * Load the full name cache from localStorage.
 * @returns {{ [id: string]: { n: string, c: string } }}
 */
export function loadNameCache() {
  return lsGet(KEY_NAME_CACHE, {});
}

/**
 * Persist the name cache, pruning oldest entries if it exceeds the cap.
 * @param {{ [id: string]: { n: string, c: string } }} cache
 */
export function saveNameCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length > NAME_CACHE_MAX) {
    keys.slice(0, keys.length - NAME_CACHE_KEEP).forEach(k => delete cache[k]);
  }
  lsSet(KEY_NAME_CACHE, cache);
}
