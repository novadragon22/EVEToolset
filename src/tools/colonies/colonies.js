/**
 * EVE Suite — Colony Orbit (colonies)
 *
 * Reads every PI colony for every visible roster character via ESI, renders
 * each as a planet tile with an SVG ring showing how much extractor time is
 * left, and integrates with the Chain Works pilot chalkboard roles so you
 * can watch only the pilots on extractor duty.
 */

import { KEY_CHARS, KEY_THEME }                from '@core/constants.js';
import { loadChars,
         sectionOn, setSection, visibleIds,
         reportDashboard }                     from '@core/storage.js';
import { esiGet, getTok, resolveNames, nameOf,
         pLimit }                              from '@core/esi-client.js';
import { $, esc, fmtDur }                     from '@core/format.js';

// ── Tool identity ─────────────────────────────────────────────────────────────

const MY_SECTION = 'colonies';

// ── localStorage keys (tool-local) ───────────────────────────────────────────

/** Chain Works pilot chalkboard: { [charId]: 'Extractor'|'Factory'|'Full chain'|'Not Required' } */
const CHAINS_ROLE_KEY = 'eve_suite_chains_roles';

/** Persisted watch-only toggle state. */
const WATCH_KEY = 'eve_suite_colonies_watch';

// ── Ring scale: a full ring = 48 h of extractor time remaining ───────────────

const CYCLE_RING_H = 48;

// ── State ─────────────────────────────────────────────────────────────────────

let chars    = loadChars();
let tiles    = null;   // null = not yet loaded; [] after first load
let lastErrs = [];
let watchOnly = false;
try { watchOnly = localStorage.getItem(WATCH_KEY) === '1'; } catch { /* ignore */ }

// ── Pilot role helpers ────────────────────────────────────────────────────────

function chainRoles() {
  try { return JSON.parse(localStorage.getItem(CHAINS_ROLE_KEY) || '{}') || {}; } catch { return {}; }
}

function roleOf(charId) {
  return chainRoles()[charId] || '—';
}

function onExtractorDuty(charId) {
  const r = roleOf(charId);
  return r === 'Extractor' || r === 'Full chain';
}

// ── Toast notification ────────────────────────────────────────────────────────

function toast(msg, bad = false) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 3600);
}

// ── Pilot tag strip ───────────────────────────────────────────────────────────

function renderPilots() {
  const el = $('pilots');
  if (!el) return;
  const ids = Object.keys(chars);
  if (!ids.length) {
    el.innerHTML = '<span class="nochars">no pilots — sign in from the Toolset menu</span>';
    return;
  }
  el.innerHTML = ids.map(id => {
    const on  = sectionOn(id, MY_SECTION);
    const c   = chars[id];
    const tip = 'click to ' + (on ? 'exclude from' : 'include in') + ' this tool';
    return `<button class="ptag${on ? '' : ' off'}" data-id="${id}" title="${tip}">${esc(c.charName || ('Char ' + id))}</button>`;
  }).join('');

  el.querySelectorAll('.ptag').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id;
      setSection(id, MY_SECTION, !sectionOn(id, MY_SECTION));
      renderPilots();
      if (window.onRosterChange) window.onRosterChange();
    };
  });
}

// ── Guard: show helpful empties when there are no usable pilots ───────────────

function noPilotsGuard(containerId) {
  const ids = visibleIds(MY_SECTION);
  const el  = $(containerId);
  if (!Object.keys(chars).length) {
    if (el) el.innerHTML = '<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu and add characters there — every tool shares that one sign-in.</div>';
    return true;
  }
  if (!ids.length) {
    if (el) el.innerHTML = '<div class="empty">All pilots are excluded from this tool.<br>Click a pilot name above to include one.</div>';
    return true;
  }
  return false;
}

// ── ESI fetch ─────────────────────────────────────────────────────────────────

async function loadAll() {
  if (noPilotsGuard('out')) return;

  const btn = $('loadBtn');
  btn.disabled = true;
  $('out').innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="spin"></span>Scanning the orbits…</div>';

  tiles = [];
  const errs = [];

  for (const id of visibleIds(MY_SECTION)) {
    try {
      const s = await getTok(id);
      if (!s) throw new Error('token expired — re-open the Toolset menu');
      const T  = s.access;
      const nm = s.charName || ('Char ' + id);

      const planets = await esiGet('/characters/' + id + '/planets/', T);

      // Fetch colony detail for each planet in parallel (max 4 at once)
      const lim = pLimit(4);

      await Promise.all(planets.map(p => lim(async () => {
        const t = {
          charId:   id,
          owner:    nm,
          planet:   p,
          pinTotal: p.num_pins,
          lvl:      p.upgrade_level,
          ptype:    p.planet_type,
          sys:      p.solar_system_id,
        };
        try {
          const d    = await esiGet('/characters/' + id + '/planets/' + p.planet_id + '/', T);
          const pins = d.pins || [];
          const extr = pins.filter(x => x.extractor_details);
          t.extractors = extr.length;
          t.factories  = pins.filter(x => x.schematic_id).length;
          const exps   = extr.map(x => x.expiry_time ? Date.parse(x.expiry_time) : null).filter(x => x != null);
          t.soonest    = exps.length ? Math.min(...exps) : null;
          t.latest     = exps.length ? Math.max(...exps) : null;
        } catch {
          t.detailErr = true;
        }
        tiles.push(t);
      })));
    } catch (e) {
      errs.push(
        ((chars[id] || {}).charName || id) + ': ' +
        (e.status === 403 ? 'PI scope missing — re-add in the Toolset menu' : e.message),
      );
    }
  }

  // Bulk-resolve planet and system names
  try {
    await resolveNames([
      ...tiles.map(t => t.planet.planet_id),
      ...tiles.map(t => t.sys),
    ]);
  } catch { /* non-fatal */ }

  render(errs);
  btn.disabled = false;
}

// ── SVG ring ──────────────────────────────────────────────────────────────────

function ring(fracLeft, alarm) {
  const R   = 46;
  const C   = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(1, fracLeft)));
  return (
    `<svg viewBox="0 0 110 110">` +
    `<circle class="ring-bg" cx="55" cy="55" r="${R}" fill="none" stroke-width="6"/>` +
    `<circle class="ring-fg${alarm ? ' alarm' : ''}" cx="55" cy="55" r="${R}" fill="none" stroke-width="6" ` +
    `stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 55 55)"/>` +
    `</svg>`
  );
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(errs) {
  lastErrs = errs || [];
  const now    = Date.now();
  const roles  = chainRoles();
  const errHtml = lastErrs.map(e =>
    `<div class="charerr" style="grid-column:1/-1">⚠ ${esc(e)}</div>`,
  ).join('');

  if (!tiles.length) {
    $('out').innerHTML = errHtml + '<div class="empty" style="grid-column:1/-1">no colonies on the roster</div>';
    return;
  }

  const shown = watchOnly ? tiles.filter(t => onExtractorDuty(t.charId)) : tiles;

  if (!shown.length) {
    $('out').innerHTML =
      errHtml +
      '<div class="empty" style="grid-column:1/-1">' +
      'no colonies belong to pilots chalked <b>Extractor</b> or <b>Full chain</b> — ' +
      'chalk duty on the Chain Works pilot chalkboard, or untick the watch</div>';
    reportDashboard(MY_SECTION, 'extractor watch: nobody chalked', 'muted');
    return;
  }

  let dark = 0;
  shown.sort((a, b) => (a.soonest || 0) - (b.soonest || 0));

  $('out').innerHTML = errHtml + shown.map(t => {
    const role         = roles[t.charId] || '—';
    const duty         = role === 'Extractor' || role === 'Full chain';
    const factoryRole  = role === 'Factory';
    const left         = t.soonest != null ? t.soonest - now : null;
    const expired      = left != null && left <= 0;
    const noExtr       = t.extractors === 0;
    // A Factory-chalked pilot's colony without extractors is by design
    const factoryExpected = factoryRole && noExtr;
    const alarm        = (expired || (noExtr && !factoryExpected)) && !t.detailErr;
    if (alarm) dark++;

    const frac  = left == null ? 0 : Math.max(0, left) / (CYCLE_RING_H * 3_600_000);
    const clock = t.detailErr
      ? 'colony detail unreadable'
      : factoryExpected
        ? 'factory colony — no extractors expected'
        : noExtr
          ? 'no extractors installed'
          : expired
            ? 'EXTRACTORS EXPIRED'
            : 'heads run ' + fmtDur(left) +
              (t.latest && t.latest !== t.soonest ? ' → ' + fmtDur(t.latest - now) : '');

    const badge = role !== '—'
      ? `<span class="rolebadge rb-${duty ? 'duty' : 'fact'}">${esc(role)}</span>`
      : '';

    return (
      `<div class="tile card${alarm ? ' alarm' : ''}${duty ? ' onduty' : ''}">` +
        `<span class="lvl">CC ${t.lvl}</span>` +
        `<div class="ringwrap">` +
          ring(frac, expired) +
          `<span class="ptype pt-${esc(t.ptype || 'x')}">${esc(t.ptype || '?')}</span>` +
        `</div>` +
        `<div class="pn">${esc(nameOf(t.planet.planet_id, 'Planet'))}</div>` +
        `<div class="own">${esc(t.owner)}${badge} · ${esc(nameOf(t.sys, 'system'))}</div>` +
        `<div class="clock">${clock}</div>` +
        `<div class="pins">` +
          `<span>${t.pinTotal} pins</span>` +
          `<span>${t.extractors != null ? t.extractors + ' extr' : '—'}</span>` +
          `<span>${t.factories  != null ? t.factories  + ' fact' : '—'}</span>` +
        `</div>` +
      `</div>`
    );
  }).join('');

  const dutyCount = shown.filter(t => onExtractorDuty(t.charId)).length;
  reportDashboard(
    MY_SECTION,
    (watchOnly ? 'watching ' : '') + shown.length + ' colonies' +
    (watchOnly ? ' on extractor duty' : '') +
    (dark ? ` · ${dark} need attention!` : ' · all cycling'),
    dark ? 'bad' : 'ok',
  );
  $('loadNote').textContent =
    'Orbits scanned ' + new Date().toUTCString().slice(17, 25) + ' EVE' +
    (dutyCount && !watchOnly ? ` · ${dutyCount} on extractor duty` : '');
}

// ── EVE clock ─────────────────────────────────────────────────────────────────

function tickClock() {
  const el = $('eveclock');
  if (!el) return;
  const d = new Date();
  el.textContent =
    String(d.getUTCHours()).padStart(2, '0') + ':' +
    String(d.getUTCMinutes()).padStart(2, '0') + ' EVE';
}
tickClock();
setInterval(tickClock, 15_000);

// ── Cross-tab sync ────────────────────────────────────────────────────────────

window.addEventListener('storage', e => {
  if (e.key === KEY_CHARS) {
    chars = loadChars();
    renderPilots();
    if (window.onRosterChange) window.onRosterChange();
  }
  if (e.key === KEY_THEME) {
    const name = e.newValue;
    if (name) try { document.documentElement.dataset.theme = name; } catch { /* ignore */ }
  }
  if (e.key === CHAINS_ROLE_KEY && tiles) {
    render(lastErrs);
  }
});

// Re-load automatically when the roster changes (character added/removed)
window.onRosterChange = () => { if (tiles) loadAll(); };

// ── Back-link: show only when not inside the hub iframe ──────────────────────

try {
  if (window.self === window.top) {
    const bl = $('backlink');
    if (bl) bl.style.display = 'inline-flex';
  }
} catch { /* cross-origin iframe — leave hidden */ }

// ── Watch-only toggle ─────────────────────────────────────────────────────────

const watchChk = $('watchChk');
watchChk.checked = watchOnly;
watchChk.addEventListener('change', () => {
  watchOnly = watchChk.checked;
  try { localStorage.setItem(WATCH_KEY, watchOnly ? '1' : '0'); } catch { /* ignore */ }
  if (tiles) render(lastErrs);
});

// ── Load button ───────────────────────────────────────────────────────────────

$('loadBtn').onclick = loadAll;

// ── Boot ──────────────────────────────────────────────────────────────────────

renderPilots();
