/**
 * EVE Suite — formatting utilities
 *
 * Pure functions only; no DOM, no state, no imports.
 *
 * Naming notes
 * ────────────
 * The legacy HTML files used two ISK formatters with different names and
 * slightly different behaviour:
 *   • fmtISK  – most tools: sign-aware, handles null/NaN, no " ISK" suffix
 *   • fmtIsk  – industry.html: no sign handling, always appends " ISK"
 *
 * This module exports a single `fmtISK` that is sign-aware, handles
 * null/NaN, and does NOT append " ISK" (consistent with the majority).
 * Industry tool code that relied on the " ISK" suffix can call `fmtISKFull`.
 *
 * fmtDur vs fmtDur2
 * ─────────────────
 * • fmtDur(ms)   – millisecond input; zero-value label is caller-supplied
 *                  (the legacy files used 'done', 'expired', or 'ready'
 *                   depending on context — pass it as the second arg).
 * • fmtDurSec(s) – second input; used by industry research time estimates.
 */

// ── ISK ──────────────────────────────────────────────────────────────────────

/**
 * Format an ISK amount with T/B/M/K suffix.
 * Returns '—' for null/undefined/NaN.
 * Negative values are prefixed with '−' (minus sign, U+2212).
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function fmtISK(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e12) return s + (a / 1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return s + (a / 1e9).toFixed(2)  + 'B';
  if (a >= 1e6)  return s + (a / 1e6).toFixed(2)  + 'M';
  if (a >= 1e3)  return s + (a / 1e3).toFixed(1)  + 'K';
  return s + a.toFixed(a > 0 && a < 10 ? 2 : 0);
}

/**
 * Like fmtISK but always appends ' ISK'. Used by industry panels that
 * show amounts in isolation (not inside a table column).
 */
export function fmtISKFull(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (a / 1e9).toFixed(2) + 'B ISK';
  if (a >= 1e6) return (a / 1e6).toFixed(2) + 'M ISK';
  if (a >= 1e3) return (a / 1e3).toFixed(1) + 'K ISK';
  return Math.round(a) + ' ISK';
}

// ── Numbers ───────────────────────────────────────────────────────────────────

/**
 * Full decimal number, locale-formatted with up to 2 decimal places.
 * Returns '—' for null/NaN.
 */
export function fmtFull(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Integer, locale-formatted (comma thousands separator).
 * Returns '—' for null/NaN.
 */
export function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US');
}

/**
 * Quantity display: integers ≥1000 get comma formatting; smaller values
 * keep up to 2 decimal places. Used by blueprint/material quantity columns.
 */
export function fmtQ(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return Math.round(n).toLocaleString();
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Volume in m³ with M/K suffix for large values.
 * Returns '—' for null/NaN.
 */
export function fmtM3(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M m³';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K m³';
  return Math.round(n) + ' m³';
}

/**
 * Block count (moon-mining). e.g. 1,234 blocks
 */
export function fmtBlocks(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString() + ' blocks';
}

// ── Time / duration ───────────────────────────────────────────────────────────

/**
 * Format a millisecond duration as "Xd Yh", "Yh Zm", or "Zm".
 *
 * @param {number|null} ms       – duration in milliseconds
 * @param {string}      zeroLabel – label when ms ≤ 0 (e.g. 'done', 'ready', 'expired')
 * @returns {string}
 */
export function fmtDur(ms, zeroLabel = 'done') {
  if (ms == null) return '—';
  if (ms <= 0) return zeroLabel;
  const d  = Math.floor(ms / 86_400_000);
  const h  = Math.floor(ms % 86_400_000 / 3_600_000);
  const mi = Math.floor(ms % 3_600_000  /    60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mi}m`;
  return `${mi}m`;
}

/**
 * Format a second duration, including seconds for sub-minute values.
 * Used by industry research time estimates (fmtDur2 in legacy code).
 *
 * @param {number|null} sec – duration in seconds
 * @returns {string}
 */
export function fmtDurSec(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86_400);
  const h = Math.floor(sec % 86_400 / 3_600);
  const m = Math.floor(sec % 3_600  /    60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/**
 * Compact hours display. Used by skill training time columns.
 * e.g. 45m, 2h, 2.5h
 *
 * @param {number} sec – duration in seconds
 * @returns {string}
 */
export function fmtHrs(sec) {
  const hh = sec / 3600;
  if (hh < 1) return Math.round(sec / 60) + 'm';
  return hh === Math.round(hh) ? hh + 'h' : hh.toFixed(1) + 'h';
}

/**
 * Relative time ago string. Inputs are Unix timestamps (ms).
 *
 * @param {number} ts – Unix ms timestamp
 * @returns {string}
 */
export function timeago(ts) {
  const m = (Date.now() - ts) / 60_000;
  if (m < 1)    return 'just now';
  if (m < 60)   return Math.round(m) + 'm ago';
  if (m < 1440) return Math.round(m / 60) + 'h ago';
  return Math.round(m / 1440) + 'd ago';
}

// ── Misc ──────────────────────────────────────────────────────────────────────

/**
 * Roman numeral for skill levels 0–5.
 * Falls back to the plain number string for values outside that range.
 */
export function roman(n) {
  return ['0', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n);
}

/**
 * HTML-escape a value. Coerces to string first; treats null/undefined as ''.
 */
export function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

/**
 * Shorthand for document.getElementById — matches the `$` helper that
 * every legacy tool file inlined.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export const $ = id => document.getElementById(id);
