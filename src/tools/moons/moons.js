/**
 * EVE Suite — Moon Watch
 * Athanors and Tataras in two lanes (extracting / idle), arrivals calendar,
 * and the chunk-stagger optimiser. Carries over the PLAN_KEY and EXCLUDE_KEY
 * localStorage keys so saved plans survive the migration.
 *
 * Note: this tool reads system metadata (security, constellation) directly
 * into the shared name cache using the 'sysmeta<sysId>' key pattern — the
 * same pattern as the original. We access the cache via loadNameCache /
 * saveNameCache from esi-client.js.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiGetPaged, getTok, resolveNames,
         nameOf, structureName }                       from '@core/esi-client.js';
import { loadNameCache, saveNameCache }                from '@core/storage.js';
import { $, esc, fmtDur }                             from '@core/format.js';

const MY_SECTION = 'moons';
const REFINERY_TYPES = { 35835: 'Athanor', 35836: 'Tatara' };
const PLAN_KEY    = 'eve_extraction_plans_v1';
const EXCLUDE_KEY = 'eve_extraction_exclude_v1';
let chars = loadChars();
let refineries = [];
let extractionPlans = [];
let optFilter = { constellation: 'all' };
let excludeKeywords = [];
try { extractionPlans = JSON.parse(localStorage.getItem(PLAN_KEY) || '[]') || []; } catch {}
let excludeRaw = '';
try { excludeRaw = JSON.parse(localStorage.getItem(EXCLUDE_KEY) || '""') || ''; } catch {
  try { excludeRaw = localStorage.getItem(EXCLUDE_KEY) || ''; } catch {}
}
function parseExclude(str) { return (str || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
excludeKeywords = parseExclude(excludeRaw);
function isExcluded(name, system) {
  if (!excludeKeywords.length) return false;
  const hay = ((name || '') + ' ' + (system || '')).toLowerCase();
  return excludeKeywords.some(k => hay.includes(k));
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateKey(d) { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayLabel(d) { return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
function statusOf(r) { if (r.arrive) return Date.parse(r.arrive) > Date.now() ? 'extracting' : 'ready'; return 'idle'; }

// ── Shared boot helpers ───────────────────────────────────────────────────────

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn = $('loadBtn'); btn.disabled = true;
  $('out').innerHTML = '<div class="empty"><span class="spin"></span>Sighting the moons…</div>';
  refineries = [];
  const errs = [];
  const doneCorps = new Set();

  for (const id of visibleIds(MY_SECTION)) {
    try {
      const s = await getTok(id); if (!s) throw new Error('token expired');
      const corpId = s.corpId; if (!corpId || doneCorps.has(corpId)) continue;
      doneCorps.add(corpId);
      let list;
      try { list = await esiGetPaged('/corporations/' + corpId + '/structures/', s.access, 5); }
      catch (e) { errs.push((s.corpName || ('Corp ' + corpId)) + ': ' + (e.status === 403 ? 'no read via ' + (s.charName || 'pilot') + ' — needs the Station Manager role' : e.message)); continue; }
      let extractions = [];
      try { extractions = await esiGet('/corporation/' + corpId + '/mining/extractions/', s.access); }
      catch (e) { if (e.status === 403) errs.push((s.corpName || 'corp') + ': extraction timers unreadable (corp-mining scope/role) — refineries shown without chunk clocks'); }
      const exMap = {}; extractions.forEach(x => { exMap[x.structure_id] = x; });
      for (const st of list) {
        const isRef = REFINERY_TYPES[st.type_id]; if (!isRef) continue;
        const ex = exMap[st.structure_id] || {};
        refineries.push({ sid: st.structure_id, typeId: st.type_id, type: isRef, sysId: st.system_id, corp: s.corpName || '', tok: s.access, start: ex.extraction_start_time, arrive: ex.chunk_arrival_time, decay: ex.natural_decay_time });
      }
    } catch { /* per-pilot errors skipped */ }
  }

  try { await resolveNames(refineries.map(r => r.sysId)); } catch {}

  // System metadata: security + constellation, stored in name cache under 'sysmeta<id>'
  const nameCache = loadNameCache();
  await Promise.all(refineries.map(async r => {
    r.name   = await structureName(r.sid, r.tok).catch(() => 'Structure ' + r.sid);
    r.system = nameOf(r.sysId, 'System ' + r.sysId);
    try {
      const key = 'sysmeta' + r.sysId;
      if (!nameCache[key]) {
        const sy = await esiGet('/universe/systems/' + r.sysId + '/');
        let cn = ''; try { cn = (await esiGet('/universe/constellations/' + sy.constellation_id + '/')).name; } catch {}
        nameCache[key] = { n: JSON.stringify({ nm: sy.name, sec: sy.security_status, con: cn }), c: 'meta' };
        saveNameCache(nameCache);
      }
      const meta = JSON.parse(nameCache[key].n);
      if (meta.nm) r.system = meta.nm;
      r.sec = meta.sec; r.constellation = meta.con || 'Unknown';
    } catch { r.constellation = 'Unknown'; }
  }));

  render(errs);
  btn.disabled = false;
}

// ── Render ────────────────────────────────────────────────────────────────────

function phaseChip(r) {
  const now = Date.now();
  const st  = statusOf(r);
  const sec = r.sec != null ? r.sec.toFixed(1) : '?';
  let line, sub = '';
  if (st === 'extracting') {
    line = 'Chunk lands in ' + fmtDur(Date.parse(r.arrive) - now);
    if (r.decay) sub = 'auto-decays ' + fmtDur(Date.parse(r.decay) - now) + ' after';
  } else {
    line = 'No extraction scheduled'; sub = 'drill is dark — schedule a chunk';
  }
  return `<div class="mchip card st-${st}">` +
    `<span class="mimg-wrap"><img class="mimg" src="https://images.evetech.net/types/${r.typeId}/render?size=64" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` +
    `<span class="phase ph-${st}"></span></span>` +
    `<div><div class="mn">${esc(r.name)}</div><div class="mt">${esc(r.type)} · ${sec} ${esc(r.system)} · ${esc(r.constellation || '')}</div>` +
    `<div class="ms">${line}</div>${sub ? `<div class="md">${sub}</div>` : ''}</div></div>`;
}

function render(errs) {
  const errHtml = (errs || []).map(e => `<div class="charerr">⚠ ${esc(e)}</div>`).join('');
  if (!refineries.length) {
    $('out').innerHTML = errHtml + '<div class="empty">no Athanors or Tataras on the corp books</div>';
    reportDashboard(MY_SECTION, 'no refineries readable', 'muted'); return;
  }
  const lanes = { extracting: [], ready: [], idle: [] };
  refineries.forEach(r => lanes[statusOf(r)].push(r));
  lanes.extracting.sort((a, b) => Date.parse(a.arrive) - Date.parse(b.arrive));
  const lane = (key, title, desc, list) =>
    `<div class="swim panel ${key}"><div class="swim-hd"><h2>${title}</h2><span class="cnt">${list.length}</span><span class="desc">${desc}</span></div>` +
    (list.length ? `<div class="moonchips">${list.map(phaseChip).join('')}</div>` : '<div class="empty" style="padding:14px">none</div>') + `</div>`;
  $('out').innerHTML = errHtml + `<div class="lanes3">` +
    lane('extracting', 'Extracting', 'chunks inbound, soonest first', lanes.extracting) +
    lane('idle', 'Idle', 'no extraction scheduled — dead time', lanes.idle) +
    `</div>`;
  $('calPanel').style.display = ''; $('optGrid').style.display = '';
  refreshOptFilters(); renderCalendar(); renderPlanList();
  reportDashboard(MY_SECTION,
    lanes.extracting.length + ' extracting' + (lanes.idle.length ? ' · ' + lanes.idle.length + ' idle!' : ''),
    lanes.idle.length ? 'bad' : 'ok');
  $('loadNote').textContent = 'Moons sighted ' + new Date().toUTCString().slice(17, 25) + ' EVE · ' + refineries.length + ' refineries';
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function refineryArrivals() {
  return refineries.filter(r => r.arrive && !isExcluded(r.name, r.system))
    .map(r => ({ name: r.name, system: r.system, constellation: r.constellation || 'Unknown', date: new Date(r.arrive) }));
}

function refreshOptFilters() {
  const sel = $('optConst'); if (!sel) return;
  const consts = [...new Set(refineries.map(r => r.constellation || 'Unknown'))].filter(Boolean).sort();
  if (optFilter.constellation !== 'all' && !consts.includes(optFilter.constellation)) optFilter.constellation = 'all';
  sel.innerHTML = '<option value="all">All constellations</option>' + consts.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = optFilter.constellation;
  const dl = $('constDatalist'); if (dl) dl.innerHTML = consts.map(c => `<option value="${esc(c)}">`).join('');
}

function renderCalendar() {
  const wrap = $('calendarWrap'); if (!wrap) return;
  const windowDays = Math.max(3, Math.min(60, +$('optWindow').value || 14));
  const arrivals = refineryArrivals().filter(a => optFilter.constellation === 'all' || a.constellation === optFilter.constellation);
  const today = startOfDay(Date.now()); const buckets = {};
  arrivals.forEach(a => { const k = dateKey(a.date); (buckets[k] = buckets[k] || []).push(a); });
  let strip = '', list = '';
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(today, i), k = dateKey(d), items = buckets[k] || [];
    const lvl = items.length === 0 ? '' : items.length <= 2 ? 'lo' : 'hi';
    strip += `<div class="cal-tile ${lvl}${i === 0 ? ' today' : ''}"><span class="cal-dow">${d.toLocaleDateString([], { weekday: 'short' })}</span><span class="cal-dom">${d.getDate()}</span>${items.length ? `<span class="cal-count">${items.length}</span>` : ''}</div>`;
    if (items.length) list += `<div class="cal-day-row"><div class="cal-day-date">${dayLabel(d)}</div><div class="cal-day-chips">${items.map(a => `<span class="cal-chip">${esc(a.name)} <i>${esc(a.system)}</i></span>`).join('')}</div></div>`;
  }
  wrap.innerHTML = `<div class="cal-strip">${strip}</div>` + (list ? `<div class="cal-list">${list}</div>` : `<div class="empty" style="padding:14px">No scheduled arrivals in this window${optFilter.constellation !== 'all' ? ' for ' + esc(optFilter.constellation) : ''}.</div>`);
}

// ── Optimiser ─────────────────────────────────────────────────────────────────

function savePlans() { try { localStorage.setItem(PLAN_KEY, JSON.stringify(extractionPlans)); } catch {} renderPlanList(); }

function renderPlanList() {
  const wrap = $('planList'); if (!wrap) return;
  const list = extractionPlans.filter(p => optFilter.constellation === 'all' || (p.constellation || 'Unknown') === optFilter.constellation);
  wrap.innerHTML = list.length
    ? list.map(p => { const ex = isExcluded(p.system, p.system); return `<div class="plan-row"${ex ? ' style="opacity:.45"' : ''}><span>${esc(p.system)}${ex ? ' <i>excluded</i>' : ''}</span><span class="dim">${esc(p.constellation || 'Unspecified')}</span><button class="char-x" data-id="${p.id}">✕</button></div>`; }).join('')
    : '<div class="empty" style="padding:12px;font-size:10.5px">No systems queued.</div>';
  wrap.querySelectorAll('.char-x').forEach(b => { b.onclick = () => { extractionPlans = extractionPlans.filter(p => p.id !== b.dataset.id); savePlans(); }; });
}

$('addPlanBtn').onclick = () => {
  const sysEl = $('planSystem'), cEl = $('planConst');
  const system = sysEl.value.trim(); if (!system) { sysEl.focus(); return; }
  let constellation = cEl.value.trim();
  if (!constellation) { const match = refineries.find(r => (r.system || '').toLowerCase() === system.toLowerCase()); if (match) constellation = match.constellation || ''; }
  extractionPlans.push({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), system, constellation });
  sysEl.value = ''; cEl.value = ''; savePlans();
};

$('optConst').addEventListener('change', e => { optFilter.constellation = e.target.value; renderCalendar(); renderPlanList(); });
$('optWindow').addEventListener('input', renderCalendar);
$('optExclude').value = excludeRaw;
$('optExclude').addEventListener('input', e => {
  excludeKeywords = parseExclude(e.target.value);
  try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify(e.target.value)); } catch {}
  renderCalendar(); renderPlanList();
});

$('genPatternBtn').onclick = () => {
  const gap = Math.max(0.5, +$('optDuration').value || 7);
  const today = startOfDay(Date.now());
  const plansToSchedule = extractionPlans.filter(p =>
    (optFilter.constellation === 'all' || (p.constellation || 'Unknown') === optFilter.constellation) && !isExcluded(p.system, p.system));
  const out = $('patternResult');
  if (!plansToSchedule.length) { out.innerHTML = '<div class="empty" style="padding:20px">No systems to schedule — add one, or it may be hidden by your exclusion keywords.</div>'; return; }
  const units = [];
  plansToSchedule.forEach(p => {
    const refs = refineries.filter(r => (r.system || '').toLowerCase() === p.system.toLowerCase() && !isExcluded(r.name, r.system));
    if (refs.length) refs.forEach(r => units.push({ system: p.system, constellation: p.constellation || r.constellation || 'Unknown', refinery: r.name }));
    else units.push({ system: p.system, constellation: p.constellation || 'Unknown', refinery: null });
  });
  const N = units.length, cycleDays = Math.round(N * gap);
  const results = units.map((u, i) => ({ ...u, startDate: addDays(today, Math.round(i * gap)), nextDate: addDays(addDays(today, Math.round(i * gap)), cycleDays) }));
  out.innerHTML = `<div class="hint2">${N} extraction${N !== 1 ? 's' : ''} across ${plansToSchedule.length} system${plansToSchedule.length !== 1 ? 's' : ''} · one full cycle every <b>${cycleDays}d</b>.</div>` +
    `<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>System</th><th>Refinery</th><th>Constellation</th><th>Suggested start</th><th>Next cycle</th></tr></thead><tbody>` +
    results.map((r, i) => `<tr><td class="dim">${i + 1}</td><td><div class="nm">${esc(r.system)}</div></td><td>${r.refinery ? esc(r.refinery) : '<span class="dim">— not synced —</span>'}</td><td class="dim">${esc(r.constellation || 'Unspecified')}</td><td>${dayLabel(r.startDate)}</td><td class="dim">${dayLabel(r.nextDate)}</td></tr>`).join('') +
    `</tbody></table></div>`;
};

$('loadBtn').onclick = loadAll;
window.onRosterChange = () => { if (refineries.length) loadAll(); };
renderPlanList();
renderPilots();
