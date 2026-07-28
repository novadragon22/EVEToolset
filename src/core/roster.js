/**
 * EVE Suite — roster UI helpers
 *
 * Renders the pilot strip (small portrait chips used by every tool) and the
 * full roster panel (index.html only). Listens for cross-tab storage changes
 * so all open tools stay in sync when a character is added or removed.
 *
 * Usage in tool pages (pilot strip only)
 * ──────────────────────────────────────
 *   import { initPilotStrip } from '@core/roster.js';
 *   initPilotStrip();        // call after DOMContentLoaded
 *
 * Usage in index.html (full roster)
 * ───────────────────────────────────
 *   import { initRoster } from '@core/roster.js';
 *   initRoster({ clientId, callbackUrl, onAdd, onRemove });
 */

import { KEY_CHARS, KEY_TOKEN_SCOPES, ACTIVE_SCOPES } from './constants.js';
import { loadChars, removeChar }                      from './storage.js';
import { auditScopes, tokenScopes }                   from './auth.js';

const EVE_PORTRAIT = id =>
  `https://images.evetech.net/characters/${id}/portrait?size=64`;

// ── Pilot strip (all tool pages) ─────────────────────────────────────────────

/**
 * Render all `.pilot-strip` elements on the page from the stored roster.
 * Each strip shows a row of portrait chips; the first character is highlighted.
 */
export function renderPilotStrip() {
  const chars = loadChars();
  const ids   = Object.keys(chars);

  document.querySelectorAll('.pilot-strip').forEach(el => {
    if (!ids.length) {
      el.style.display = 'none';
      el.innerHTML     = '';
      return;
    }
    el.style.display = 'flex';
    el.innerHTML = ids.map((id, i) => {
      const name = chars[id].charName || ('Character ' + id);
      return (
        `<div class="pilot-chip${i === 0 ? ' on' : ''}" ` +
        `title="${name}" ` +
        `style="background-image:url(${EVE_PORTRAIT(id)});` +
               `background-size:cover;background-position:center">` +
        `</div>`
      );
    }).join('');
  });
}

/**
 * Attach a storage listener so the pilot strip stays in sync across tabs.
 * Call once per page (idempotent if called multiple times by accident).
 */
let _pilotStripListening = false;
export function initPilotStrip() {
  renderPilotStrip();
  if (_pilotStripListening) return;
  _pilotStripListening = true;
  window.addEventListener('storage', e => {
    if (e.key === KEY_CHARS) renderPilotStrip();
  });
}

// ── Full roster panel (index.html) ────────────────────────────────────────────

/**
 * Render the full roster panel into `#roster`.
 * Annotates each chip with scope-audit badges.
 *
 * @param {{ onAdd: () => void, onRemove: (charId: string) => void }} opts
 */
export function renderRoster({ onAdd, onRemove } = {}) {
  const roster = document.getElementById('roster');
  if (!roster) return;

  const chars   = loadChars();
  const ids     = Object.keys(chars);
  const max     = ids.length; // shown in the + chip tooltip
  const active  = ACTIVE_SCOPES.map(s => s.scope);

  // Recompute scope audit for all current chars and persist it
  const scopeAudit = {};
  ids.forEach(id => {
    scopeAudit[id] = auditScopes(chars[id].access || '', active);
  });
  try {
    localStorage.setItem(KEY_TOKEN_SCOPES, JSON.stringify(scopeAudit));
  } catch { /* ignore */ }

  const addChip =
    `<span class="add-chip" id="addCharBtn" ` +
    `title="Add character (${max} remembered)">+</span>`;

  if (!ids.length) {
    roster.innerHTML = addChip;
  } else {
    roster.innerHTML = ids.map(id => {
      const c     = chars[id];
      const label = c.charName + (c.corpName ? ' · ' + c.corpName : '');
      const audit = scopeAudit[id];
      const miss  = audit?.missing || [];
      const scopeNote = audit?.scopes
        ? ` — ${audit.scopes.length} scopes granted` +
          (miss.length
            ? ` · MISSING ${miss.length} scope${miss.length === 1 ? '' : 's'} ` +
              `(remove & re-add to grant): ${miss.join(', ')}`
            : ' · all active scopes present')
        : '';
      const outline = miss.length
        ? ' style="outline:1px solid #d8a24a;outline-offset:1px"'
        : '';
      return (
        `<span class="rchip" title="${label.replace(/"/g, '&quot;')}${scopeNote}"${outline}>` +
        `<img alt="" src="${EVE_PORTRAIT(id)}" onerror="this.style.visibility='hidden'">` +
        `<span class="x" title="Sign out" data-charid="${id}">` +
        `<svg width="12" height="12" viewBox="0 0 10 10" fill="none" style="vertical-align:-1px">` +
        `<path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
        `</svg></span></span>`
      );
    }).join('') + addChip;
  }

  // Wire up remove buttons
  roster.querySelectorAll('.x[data-charid]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.charid;
      removeChar(id);
      renderRoster({ onAdd, onRemove });
      renderPilotStrip();
      onRemove?.(id);
    };
  });

  // Wire up add button
  const addBtn = document.getElementById('addCharBtn');
  if (addBtn) addBtn.onclick = () => onAdd?.();
}

/**
 * Initialise the full roster panel and attach a storage listener.
 * Call from index.html after DOMContentLoaded.
 *
 * @param {{ onAdd: () => void, onRemove?: (id: string) => void }} opts
 */
let _rosterListening = false;
export function initRoster(opts = {}) {
  renderRoster(opts);
  renderPilotStrip();
  if (_rosterListening) return;
  _rosterListening = true;
  window.addEventListener('storage', e => {
    if (e.key === KEY_CHARS) {
      renderRoster(opts);
      renderPilotStrip();
    }
  });
}
