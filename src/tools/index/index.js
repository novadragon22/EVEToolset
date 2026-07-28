/**
 * EVE Suite — Hub (index)
 *
 * This is the ONLY page that runs the OAuth login flow.
 * All other tools read pre-authenticated characters from localStorage.
 *
 * SETUP
 * ─────
 * 1. Register one EVE Developer application at https://developers.eveonline.com
 *    - Callback URL: the URL of THIS page (index.html)
 *    - Scopes: see SCOPE_INFO in src/core/constants.js
 * 2. Set SUITE_CLIENT_ID below to your app's client ID.
 * 3. Set AUTH_CALLBACK to the deployed URL of this page.
 *    For GitHub Pages: 'https://<username>.github.io/<repo>/index.html'
 *    For local dev:    'http://localhost:5173/src/tools/index/index.html'
 */

import { ACTIVE_SCOPES, KEY_CHARS, KEY_THEME } from '@core/constants.js';
import { loadDashboard, saveClientId }          from '@core/storage.js';
import { esiPub }                               from '@core/esi-client.js';
import { beginLogin, handleSuiteRedirect }      from '@core/auth.js';
import { initRoster, initPilotStrip }           from '@core/roster.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SUITE_CLIENT_ID = '6818f29c041649c7b31327bdfd35c0f5';
const AUTH_CALLBACK   = 'https://novadragon22.github.io/EVEToolset/index.html';

// Publish client ID so tools can refresh tokens without embedding it themselves
saveClientId(SUITE_CLIENT_ID);
console.log('[EVE Toolset] callback URL:', AUTH_CALLBACK);

// ── App data ──────────────────────────────────────────────────────────────────

/**
 * Thematic SVG hero art for each tool card.
 * Kept here rather than in constants because it's purely a hub-UI concern.
 */
const ART = {
  industry: `<svg viewBox="0 0 342 130" fill="none">
   <defs><pattern id="bp" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" stroke="var(--line)" stroke-width="1"/></pattern></defs>
   <rect width="342" height="130" fill="url(#bp)"/>
   <g stroke="var(--gold)" stroke-width="1.7"><circle cx="118" cy="62" r="25"/><circle cx="118" cy="62" r="8"/>
   <g stroke-width="2.4"><path d="M118 31v-8M118 101v-8M87 62h-8M157 62h-8M96 40l-6-6M146 90l-6-6M140 40l6-6M90 90l6-6"/></g></g>
   <g stroke="var(--cyan)" stroke-width="1.5" opacity=".85"><path d="M188 86l42-17 42 17-42 17z"/><path d="M188 70l42-17 42 17"/><path d="M188 54l42-17 42 17"/></g></svg>`,
  fits: `<svg viewBox="0 0 342 130" fill="none">
   <g stroke="var(--gold)" stroke-width="1.8"><path d="M171 22 L206 65 L171 108 L136 65 Z"/><line x1="171" y1="22" x2="171" y2="108"/><line x1="136" y1="65" x2="206" y2="65"/></g>
   <g stroke="var(--cyan)" stroke-width="1.4" fill="var(--bg)">
   <rect x="70" y="40" width="13" height="13"/><rect x="70" y="78" width="13" height="13"/>
   <rect x="259" y="40" width="13" height="13"/><rect x="259" y="78" width="13" height="13"/>
   <rect x="100" y="20" width="13" height="13"/><rect x="229" y="20" width="13" height="13"/></g>
   <g stroke="var(--line2)" stroke-width="1"><path d="M83 46H136M83 84H140M272 46H206M272 84H202M113 26l30 18M229 26l-30 18"/></g></svg>`,
  structures: `<svg viewBox="0 0 342 130" fill="none">
   <g opacity=".5" fill="var(--cyan)"><circle cx="50" cy="28" r="1.3"/><circle cx="300" cy="40" r="1.3"/><circle cx="260" cy="20" r="1"/><circle cx="80" cy="100" r="1"/></g>
   <ellipse cx="171" cy="110" rx="92" ry="13" stroke="var(--cyan)" stroke-width="1.2" opacity=".55"/>
   <g stroke="var(--gold)" stroke-width="1.8" fill="var(--panel)"><path d="M171 14 l26 16 v60 l-26 16 -26-16 v-60 z"/></g>
   <g stroke="var(--gold)" stroke-width="1.2" opacity=".8"><path d="M145 42h52M145 66h52M145 90h52M171 14v-9M158 6h26"/></g>
   <g stroke="var(--cyan)" stroke-width="1.4"><path d="M197 50l24-10M145 80l-24 10"/></g></svg>`,
  jump: `<svg viewBox="0 0 342 130" fill="none">
   <g opacity=".6" fill="var(--cyan)"><circle cx="60" cy="30" r="1.3"/><circle cx="120" cy="22" r="1"/><circle cx="250" cy="26" r="1.3"/><circle cx="300" cy="44" r="1"/><circle cx="90" cy="96" r="1"/></g>
   <path d="M44 98 Q171 8 298 98" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="4 6" opacity=".8"/>
   <circle cx="44" cy="98" r="4.5" fill="var(--gold)"/><circle cx="298" cy="98" r="4.5" fill="var(--green)"/>
   <g stroke="var(--gold)" stroke-width="1.7" fill="var(--panel)"><path d="M150 40 h30 l10 11 -10 11 h-30 l-8-11 z"/></g>
   <path d="M142 51 h-16" stroke="var(--amber)" stroke-width="3"/><path d="M150 45 h26M150 57 h26" stroke="var(--line2)" stroke-width="1"/></svg>`,
  pi: `<svg viewBox="0 0 342 130" fill="none">
   <g opacity=".5" fill="var(--cyan)"><circle cx="40" cy="24" r="1.2"/><circle cx="300" cy="30" r="1.2"/><circle cx="270" cy="100" r="1"/></g>
   <circle cx="118" cy="65" r="30" stroke="var(--gold)" stroke-width="1.8" fill="var(--panel)"/>
   <path d="M92 50c10 8 40 8 52 0M88 65h60M92 80c10-8 40-8 52 0" stroke="var(--gold-dim)" stroke-width="1.1" opacity=".8"/>
   <ellipse cx="118" cy="65" rx="52" ry="15" stroke="var(--cyan)" stroke-width="1.4" opacity=".8"/>
   <circle cx="176" cy="60" r="3.5" fill="var(--amber)"/>
   <g stroke="var(--cyan)" stroke-width="1.4"><path d="M215 40h95M215 65h80M215 90h95"/><circle cx="215" cy="40" r="3"/><circle cx="295" cy="65" r="3"/><circle cx="215" cy="90" r="3"/></g></svg>`,
};

/** Tool card definitions — url is relative to the dist root. */
const APPS = [
  { key: 'industry',  name: 'Industry Console',   tag: 'Manufacturing · Planner',    url: 'industry.html',
    desc: 'Compare owned blueprint originals and copies against everything buildable, plan manufacturing/reaction jobs against structure rigs, and track jobs across your characters and corps.',
    feats: ['Blueprints', 'Job planner', 'Corp roles', 'ESI assets'] },
  { key: 'colonies',  name: 'Colony Orbit',        tag: 'Planetary Interaction',      url: 'colonies.html',
    desc: 'Every colony as a planet tile with its extractor clock on a ring — spot dark colonies at a glance. Chain drafting lives in Chain Works.',
    feats: ['Ring clocks', 'Extractors', 'Alarms'] },
  { key: 'hangar',    name: 'Fitting Hangar',      tag: 'Fittings · Bays',           url: 'hangar.html',
    desc: 'Every in-game fitting racked into bays by hull, with slot boards and one-click EFT export.',
    feats: ['Bays by hull', 'Slot boards', 'EFT export'] },
  { key: 'citadel',   name: 'Citadel Watch',       tag: 'Citadels · Fuel',           url: 'citadel.html',
    desc: 'The corp skyline — every Upwell structure as a tower with a fuel tube, services and state.',
    feats: ['Skyline', 'Fuel tubes', 'Services'] },
  { key: 'chains',    name: 'Chain Works',         tag: 'PI · P0→P4 Draft',          url: 'chains.html',
    desc: 'Draft planetary production: full P0→P4 chain trees with hourly quantities, planet-type coverage, a gate-network candidate-system hunt, and a pilot chalkboard for extractor/factory duty.',
    feats: ['Chain trees', 'Planet coverage', 'System hunt', 'Pilot roles'] },
  { key: 'moons',     name: 'Moon Watch',          tag: 'Extractions · Optimiser',   url: 'moons.html',
    desc: 'Athanors and Tataras in three lanes — chunks inbound, chunks landed, drills idle — with an arrivals calendar and the chunk stagger optimiser.',
    feats: ['Idle alerts', 'Chunk clocks', 'Arrivals', 'Optimiser'] },
  { key: 'lanes',     name: 'Freight Lanes',       tag: 'Logistics · Flight plan',   url: 'lanes.html',
    desc: 'A flight-plan strip for jump freighters — legs, light-years and fuel from live coordinates and your real skills.',
    feats: ['Flight plan', 'LY & fuel', 'Midpoints'] },
  { key: 'briefing',  name: 'Command Briefing',    tag: 'Briefing · All pilots',     url: 'briefing.html',
    desc: 'One command strip per pilot — wallet, training, jobs, colonies, orders and whereabouts before you undock.',
    feats: ['Strips', 'Runway', 'Aggregates'] },
  { key: 'exchange',  name: 'The Exchange',        tag: 'Prices · Appraisal',        url: 'exchange.html',
    desc: 'A trading pit for any item — five-hub board, a year of history, cargo-scan appraisal and your live orders.',
    feats: ['Hub board', 'History', 'Appraisal', 'My orders'] },
  { key: 'treasury',  name: 'The Treasury',        tag: 'ISK · Analytics',           url: 'treasury.html',
    desc: 'A vault-door view of the roster's ISK — the dial, mirrored income/spend ledgers, daily net flow and the latest trades.',
    feats: ['Vault dial', 'Ledgers', 'Net flow', 'Trades'] },
  { key: 'academy',   name: 'Training Deck',       tag: 'Training · Queues',         url: 'academy.html',
    desc: 'Every queue as a vertical training track with countdowns, progress and idle alarms.',
    feats: ['Tracks', 'Runway', 'Idle alarms'] },
  { key: 'holdings',  name: 'Cargo Holds',         tag: 'Holdings · Value',          url: 'holdings.html',
    desc: 'The roster's stuff racked shelf by shelf per location, containers folded under parents, valued at CCP averages, searchable.',
    feats: ['Shelves', 'Boxed items', 'Search', 'Valuation'] },
  { key: 'contracts', name: 'Contract Docket',     tag: 'Couriers · Exchanges',      url: 'contracts.html',
    desc: 'Every personal contract across the roster in one inked registry — couriers in transit, exchanges waiting on a buyer, collateral in play and rewards still owed.',
    feats: ['Couriers', 'Exchanges', 'Collateral', 'Status stamps'] },
  { key: 'mining',    name: 'Extraction Ledger',   tag: 'Ore · Ice · Gas',           url: 'mining.html',
    desc: 'The roster's last 30 days at the rock face — daily haul on a belt-line chart, the ore mix, and which systems and pilots actually paid.',
    feats: ['Daily haul', 'Ore mix', 'By system', 'CCP price est.'] },
  { key: 'clones',    name: 'Clone Bay',           tag: 'Implants · Jump clones',    url: 'clones.html',
    desc: 'A vat room for every pilot — active implants slot by slot, jump clones and where they float, home stations, and live jump-cooldown meters from your real Infomorph skills.',
    feats: ['Implant racks', 'Jump clones', 'Cooldowns', 'Home station'] },
];

/** Percentage positions [top%, left%] of each star on the stage. */
const STAR_POS = {
  briefing:  [27, 50],
  mining:    [30, 10],  colonies: [33, 29], industry: [33, 71], clones:    [30, 90],
  exchange:  [56, 12],  academy:  [54, 35], treasury: [54, 65], lanes:     [56, 88],
  hangar:    [80, 27],  holdings: [84, 50], citadel:  [80, 73], contracts: [82, 90],
  moons:     [55, 50],  chains:   [8,  29],
};

const STAR_LINKS = [
  ['briefing', 'colonies'], ['briefing', 'industry'],
  ['colonies', 'academy'],  ['industry', 'treasury'], ['colonies', 'exchange'], ['industry', 'lanes'],
  ['academy', 'treasury'],  ['academy', 'hangar'],    ['treasury', 'citadel'],
  ['exchange', 'hangar'],   ['lanes', 'citadel'],     ['hangar', 'holdings'],   ['citadel', 'holdings'],
  ['mining', 'colonies'],   ['mining', 'exchange'],   ['clones', 'lanes'],
  ['contracts', 'lanes'],   ['contracts', 'citadel'],
  ['moons', 'citadel'],     ['moons', 'mining'],      ['chains', 'colonies'],   ['chains', 'briefing'],
];

const STAR_ACCENT = {
  industry: '#e8a850', colonies: '#4ac89a', lanes: '#4a90c4', hangar: '#c86a3a', citadel: '#9ad84a',
  briefing: '#e8d296', exchange: '#d8a24a', treasury: '#6ad86a', academy: '#a48ad6', holdings: '#7ab8c8',
  contracts: '#c8c88a', mining: '#8aa0b8', clones: '#5ad8c8', moons: '#c0c8d8', chains: '#b8d86a',
};

const STAR_BG = {
  industry:  'radial-gradient(circle at 35% 30%,#3a2818,#0f0a06)',
  colonies:  'radial-gradient(circle at 35% 30%,#1a3428,#0a0f0c)',
  lanes:     'radial-gradient(circle at 35% 30%,#1a2838,#0a0e14)',
  hangar:    'radial-gradient(circle at 35% 30%,#3a2418,#0f0a06)',
  citadel:   'repeating-linear-gradient(0deg,rgba(154,216,74,.08) 0 1px,transparent 1px 11px),repeating-linear-gradient(90deg,rgba(154,216,74,.08) 0 1px,transparent 1px 11px),radial-gradient(circle at 35% 30%,#1c2a10,#0a0f06)',
  briefing:  'radial-gradient(circle at 35% 30%,#3a3418,#0f0d06)',
  exchange:  'radial-gradient(circle at 35% 30%,#3a2c14,#0f0b05)',
  treasury:  'radial-gradient(circle at 35% 30%,#1c3418,#0a0f06)',
  academy:   'radial-gradient(circle at 35% 30%,#2a2038,#0d0a12)',
  holdings:  'radial-gradient(circle at 35% 30%,#182c34,#060c0f)',
  contracts: 'repeating-linear-gradient(0deg,rgba(200,200,138,.06) 0 1px,transparent 1px 9px),radial-gradient(circle at 35% 30%,#2e2c14,#0d0c05)',
  mining:    'repeating-linear-gradient(-45deg,rgba(138,160,184,.07) 0 6px,transparent 6px 14px),radial-gradient(circle at 35% 30%,#20262e,#08090c)',
  clones:    'radial-gradient(circle at 35% 30%,#12302e,#060e0d)',
  moons:     'radial-gradient(circle at 62% 30%,#262c38 22%,#10141c 60%,#06080c)',
  chains:    'radial-gradient(circle at 30% 35%,#243018,#0a0e06)',
};

const STAR_SUB = {
  industry: 'manufacturing · planner', colonies: 'planetary interaction', lanes: 'capital logistics',
  hangar: 'ship fittings', citadel: 'fuel & fleet assets', briefing: 'pilot briefing',
  exchange: 'prices & appraisal', treasury: 'isk ledger', academy: 'training queues',
  holdings: 'holdings & value', contracts: 'couriers & exchanges', mining: 'extraction ledger',
  clones: 'implants & jump clones', moons: 'moon chunks & stagger', chains: 'PI chain drafting',
};

// ── Dashboard badge helper ────────────────────────────────────────────────────

function dashBadge(key) {
  const d = loadDashboard()[key];
  if (!d) return '<span class="dash-badge muted">not synced yet</span>';
  const ageMin = (Date.now() - d.ts) / 60_000;
  const ageTxt = ageMin < 1 ? 'just now' : ageMin < 60 ? Math.round(ageMin) + 'm ago' : Math.round(ageMin / 60) + 'h ago';
  return `<span class="dash-badge ${d.level}"><span class="dash-dot"></span>${d.text} · ${ageTxt}</span>`;
}

// ── Constellation builder ─────────────────────────────────────────────────────

function buildCards() {
  const cont = document.getElementById('constellation');
  cont.classList.toggle('compact', APPS.length > 6);
  cont.innerHTML = APPS.map((a, i) => {
    const [top, left] = STAR_POS[a.key] || [50, 50];
    const accent = STAR_ACCENT[a.key] || '#e8a850';
    const bg     = STAR_BG[a.key]     || 'radial-gradient(circle at 35% 30%,var(--panel2),var(--panel))';
    return (
      `<div class="tool-star" data-i="${i}" style="top:${top}%;left:${left}%;color:${accent}">` +
        `<div class="star-core sig-${a.key}" style="background:${bg};box-shadow:0 0 35px ${accent}59"></div>` +
        `<div class="nm">${a.name}</div>` +
        `<div class="tag">${STAR_SUB[a.key] || a.tag}</div>` +
        `<div class="dash-row">${dashBadge(a.key)}</div>` +
      `</div>`
    );
  }).join('');

  cont.querySelectorAll('.tool-star').forEach(c => {
    c.onclick = () => openTool(+c.dataset.i);
  });

  drawLinks();
}

function drawLinks() {
  const svg = document.getElementById('constLinks');
  svg.innerHTML = STAR_LINKS.map(([a, b]) => {
    const [ay, ax] = STAR_POS[a] || [50, 50];
    const [by, bx] = STAR_POS[b] || [50, 50];
    return `<line x1="${ax}%" y1="${ay}%" x2="${bx}%" y2="${by}%" stroke="rgba(var(--gold-rgb),.18)" stroke-width="1"/>`;
  }).join('');
}

window.addEventListener('resize', drawLinks);

// ── Inline tool iframe ────────────────────────────────────────────────────────

const toolwrap = document.getElementById('toolwrap');
const toolFrame = document.getElementById('toolFrame');

function openTool(i) {
  const a = APPS[i];
  document.getElementById('toolName').textContent = a.name;
  document.getElementById('extLink').href         = a.url;
  toolFrame.src = a.url;
  toolwrap.classList.add('show');
}

function closeTool() {
  toolwrap.classList.remove('show');
  toolFrame.src = 'about:blank';
}

document.getElementById('backBtn').onclick       = closeTool;
document.getElementById('titleHome').onclick     = closeTool;
window.addEventListener('keydown', e => {
  if (toolwrap.classList.contains('show') && e.key === 'Escape') closeTool();
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(name) {
  if (!name) return;
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem(KEY_THEME, name); } catch { /* ignore */ }
  document.querySelectorAll('.theme-swatch').forEach(b =>
    b.classList.toggle('on', b.dataset.theme === name),
  );
}

document.querySelectorAll('.theme-swatch').forEach(b => {
  b.onclick = () => applyTheme(b.dataset.theme);
});

// Cross-tab theme sync
window.addEventListener('storage', e => {
  if (e.key === KEY_THEME) applyTheme(e.newValue);
});

applyTheme(document.documentElement.dataset.theme || 'default');

// ── EVE clock + Tranquility status ────────────────────────────────────────────

function slTick() {
  const el = document.getElementById('slClock');
  if (!el) return;
  const d = new Date();
  el.textContent =
    String(d.getUTCHours()).padStart(2, '0') + ':' +
    String(d.getUTCMinutes()).padStart(2, '0') + ' EVE';
}
slTick();
setInterval(slTick, 15_000);

async function slStatus() {
  const el = document.getElementById('slPlayers');
  if (!el) return;
  try {
    const r = await fetch('https://esi.evetech.net/latest/status/');
    if (!r.ok) throw 0;
    const s = await r.json();
    el.textContent = Number(s.players).toLocaleString() + ' pilots online';
  } catch {
    el.textContent = 'Tranquility status unavailable';
  }
}
slStatus();
setInterval(slStatus, 300_000);

// ── Scope overlay ─────────────────────────────────────────────────────────────

function renderScopeList() {
  document.getElementById('scopeList').innerHTML = ACTIVE_SCOPES.map(s =>
    `<li><b>${s.scope}</b><span class="sd">${s.desc} — <i>${s.tool}</i></span></li>`,
  ).join('');
}

document.getElementById('scopeCancel').onclick  = () =>
  document.getElementById('scopeOverlay').classList.remove('show');
document.getElementById('scopeConfirm').onclick = () => {
  document.getElementById('scopeOverlay').classList.remove('show');
  beginLogin(SUITE_CLIENT_ID, AUTH_CALLBACK);
};

// ── Command palette ───────────────────────────────────────────────────────────

const cmdk     = document.getElementById('cmdk');
const cmdkIn   = document.getElementById('cmdkIn');
const cmdkList = document.getElementById('cmdkList');
let   cmdkSel  = 0;

function cmdkMatches() {
  const q = cmdkIn.value.trim().toLowerCase();
  return APPS
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q) || a.key.includes(q));
}

function cmdkRender() {
  const m = cmdkMatches();
  if (cmdkSel >= m.length) cmdkSel = Math.max(0, m.length - 1);
  cmdkList.innerHTML = m.map(({ a, i }, j) =>
    `<div class="cmdk-item${j === cmdkSel ? ' sel' : ''}" data-i="${i}">` +
    `<span>${a.name}</span><span class="t">${a.tag}</span></div>`,
  ).join('') || '<div class="cmdk-item"><span class="t">no match</span></div>';

  cmdkList.querySelectorAll('.cmdk-item[data-i]').forEach(el => {
    el.onclick = () => { cmdkClose(); openTool(+el.dataset.i); };
  });
}

function cmdkOpen()  { cmdk.classList.add('show'); cmdkIn.value = ''; cmdkSel = 0; cmdkRender(); setTimeout(() => cmdkIn.focus(), 0); }
function cmdkClose() { cmdk.classList.remove('show'); }

window.addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
  if (((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) ||
      (e.key === '/' && !inField && !toolwrap.classList.contains('show'))) {
    e.preventDefault();
    cmdk.classList.contains('show') ? cmdkClose() : cmdkOpen();
    return;
  }
  if (!cmdk.classList.contains('show')) return;
  if (e.key === 'Escape')    { cmdkClose(); }
  else if (e.key === 'ArrowDown') { cmdkSel++; cmdkRender(); e.preventDefault(); }
  else if (e.key === 'ArrowUp')   { cmdkSel = Math.max(0, cmdkSel - 1); cmdkRender(); e.preventDefault(); }
  else if (e.key === 'Enter') {
    const m = cmdkMatches();
    if (m[cmdkSel]) { cmdkClose(); openTool(m[cmdkSel].i); }
  }
});
cmdkIn.addEventListener('input', () => { cmdkSel = 0; cmdkRender(); });
cmdk.addEventListener('click', e => { if (e.target === cmdk) cmdkClose(); });

// ── Roster & auth ─────────────────────────────────────────────────────────────

initRoster({
  onAdd:    () => beginLogin(SUITE_CLIENT_ID, AUTH_CALLBACK),
  onRemove: () => { /* roster.js already re-renders */ },
});
initPilotStrip();

// Process ?code= OAuth callback on page load
handleSuiteRedirect(SUITE_CLIENT_ID, AUTH_CALLBACK).then(entry => {
  if (entry) {
    // Fresh login — re-render roster to show the new character
    initRoster({
      onAdd:    () => beginLogin(SUITE_CLIENT_ID, AUTH_CALLBACK),
      onRemove: () => {},
    });
  }
});

// Cross-tab roster sync for constellation (dashboard badges may have updated)
window.addEventListener('storage', e => {
  if (e.key === KEY_CHARS) buildCards();
});

// ── Boot ──────────────────────────────────────────────────────────────────────

renderScopeList();
buildCards();
