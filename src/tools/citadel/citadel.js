/**
 * EVE Suite — Citadel Watch
 * Corp Upwell structures grouped by hull type, fuel-tube cards, service dots,
 * snooze/refuelled toggle for low-fuel alerts.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGetPaged, getTok, resolveNames, nameOf,
         structureName }                               from '@core/esi-client.js';
import { $, esc, fmtDur, fmtBlocks }                  from '@core/format.js';

const MY_SECTION = 'citadel';
let chars = loadChars();
let towersByCorp = null;

// ── Shared boot helpers ───────────────────────────────────────────────────────

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

// ── Fuel consumption table (SDE values, blocks/hr per service) ────────────────

const SVC_FUEL_BLK_HR_BY_NAME = {
  // Engineering Service Modules (groupID 1415)
  'Standup Supercapital Shipyard I': 36,
  'Standup Manufacturing Plant I':   12,
  'Standup Capital Shipyard I':      24,
  'Standup Invention Lab I':         12,
  'Standup Research Lab I':          12,
  'Standup Hyasyoda Research Lab':   10,
  // Citadel Service Modules (groupID 1321)
  'Standup Market Hub I':            40,
  'Standup Cloning Center I':        10,
  // Resource Processing Service Modules (groupID 1322)
  'Standup Reprocessing Facility I': 10,
  'Standup Composite Reactor I':     15,
  'Standup Hybrid Reactor I':        15,
  'Standup Biochemical Reactor I':   15,
  // FLEX Service Modules (groupID 1324)
  'Standup Cynosural Field Generator I': 15,
  'Standup Conduit Generator I':     30,
  'Standup Cynosural System Jammer I':   40,
  'Standup Metenox Moon Drill':       5,
  // Moon Drilling (groupID 1887)
  'Standup Moon Drill I':             5,
  // Unpublished — confirmed SDE values
  'Standup Drug Lab I':               5,
  'Structure Compression Plant':      5,
  'Structure Time Efficiency Laboratory':  5,
  'Structure Material Efficiency Laboratory': 10,
};

function fuelBph(s) {
  let bph = 0;
  (s.services || []).forEach(v => {
    if (v.state === 'online') {
      const rate = SVC_FUEL_BLK_HR_BY_NAME[(v.name || '').replace(/_/g, ' ')];
      bph += rate != null ? rate : 10;
    }
  });
  return bph;
}

// ── Snooze store (structure_id → true) ───────────────────────────────────────

const SNOOZE_KEY = 'eve_suite_citadel_snooze';
function loadSnooze() { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; } }
function saveSnooze(s) { try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch {} }
let snoozed = loadSnooze();

window._towerSnooze = function(id) {
  id = String(id);
  if (snoozed[id]) delete snoozed[id]; else snoozed[id] = true;
  saveSnooze(snoozed);
  if (towersByCorp) render();
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

const MAX_FUEL_DAYS = 60;

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn = $('loadBtn'); btn.disabled = true;
  $('out').innerHTML = '<div class="empty"><span class="spin"></span>Walking the skyline…</div>';
  const corps = {};
  for (const id of visibleIds(MY_SECTION)) {
    try {
      const s = await getTok(id); if (!s) throw new Error('token expired');
      const corpId = s.corpId; if (!corpId || corps[corpId]) continue;
      corps[corpId] = { name: s.corpName || ('Corp ' + corpId), via: s.charName };
      try {
        const st = await esiGetPaged('/corporations/' + corpId + '/structures/', s.access, 5);
        corps[corpId].structures = st; corps[corpId].tok = s.access;
      } catch (e) {
        corps[corpId].err = e.status === 403
          ? 'no read via ' + (s.charName || 'pilot') + ' — needs the Station Manager role'
          : e.message;
      }
    } catch { /* per-pilot errors silently skipped */ }
  }
  const all = Object.values(corps).flatMap(c => c.structures || []);
  try { await resolveNames(all.flatMap(s => [s.type_id, s.system_id])); } catch {}
  await Promise.all(all.map(s => {
    const c = Object.values(corps).find(x => (x.structures || []).includes(s));
    return structureName(s.structure_id, c.tok).then(n => { s._name = n; }).catch(() => {});
  }));
  towersByCorp = corps; render();
  btn.disabled = false;
}

// ── Render ────────────────────────────────────────────────────────────────────

const HULL_CLASS = {
  'Athanor':'refinery','Tatara':'refinery',
  'Astrahus':'citadel','Fortizar':'citadel','Keepstar':'citadel',
  'Raitaru':'engineering complex','Azbel':'engineering complex','Sotiyo':'engineering complex',
  'Ansiblex Jump Gate':'navigation','Pharolux Cyno Beacon':'navigation','Tenebrex Cyno Jammer':'navigation',
  'Metenox Moon Drill':'moon drill','Orbital Skyhook':'sovereignty',
};

function render() {
  const now = Date.now();
  const corps = towersByCorp;
  let strip = '', all = [], low = 0, total = 0;
  for (const cid of Object.keys(corps)) {
    const c = corps[cid];
    strip += `<div class="corpband panel"><span>${esc(c.name)}</span><span>${(c.structures||[]).length||0} structures · read via ${esc(c.via||'—')}</span></div>`;
    if (c.err) { strip += `<div class="charerr">⚠ ${esc(c.err)}</div>`; continue; }
    (c.structures || []).forEach(s => { all.push({ ...s, _corp: c.name }); });
  }
  strip = `<div class="corpstrip">${strip}</div>`;
  if (!all.length) {
    $('out').innerHTML = strip + '<div class="empty">no Upwell structures on the books</div>';
    reportDashboard(MY_SECTION, '0 structures', 'ok');
    $('loadNote').textContent = 'Skyline read ' + new Date().toUTCString().slice(17, 25) + ' EVE';
    return;
  }
  const fuelMsOf = s => s.fuel_expires ? Date.parse(s.fuel_expires) - now : Infinity;
  const days_lt10 = s => { const ms = fuelMsOf(s); return ms !== Infinity && ms / 86_400_000 < 10; };
  const groups = {};
  all.forEach(s => { const tn = nameOf(s.type_id, 'Type ' + s.type_id); (groups[tn] = groups[tn] || []).push(s); });
  const lanes = Object.keys(groups).map(tn => {
    const list = groups[tn].slice().sort((a, b) => fuelMsOf(a) - fuelMsOf(b));
    return { tn, list, min: fuelMsOf(list[0]) };
  }).sort((a, b) => a.min - b.min || a.tn.localeCompare(b.tn));

  const towerCard = s => {
    total++;
    const fuelMs  = s.fuel_expires ? Date.parse(s.fuel_expires) - now : null;
    const days    = fuelMs == null ? null : fuelMs / 86_400_000;
    const pct     = days == null ? 0 : Math.max(2, Math.min(100, 100 * days / MAX_FUEL_DAYS));
    const lowFuel = days != null && days < 7;
    const tempAlert  = days != null && days < 10;
    const isSnoozed  = tempAlert && !!snoozed[String(s.structure_id)];
    if (lowFuel) low++;
    const state = (s.state || '').replace(/_/g, ' ');
    const svcs  = (s.services || []).map(v =>
      `<div class="svc"><span class="dot ${v.state === 'online' ? 'on' : 'off'}"></span>${esc((v.name || '').replace(/_/g, ' '))}</div>`
    ).join('');
    const bph     = fuelBph(s);
    const noSvcs  = bph === 0;
    const inBay   = s.fuel_quantity != null ? s.fuel_quantity : null;
    const target30 = Math.ceil(30 * 24 * bph);
    const needed  = bph === 0 ? 0 : inBay != null
      ? Math.max(0, target30 - inBay)
      : (days != null && days < 30 ? Math.ceil((30 - days) * 24 * bph) : 0);
    const fuelInfo = noSvcs
      ? '<div class="fl" style="margin-top:4px">no online services · no fuel consumption</div>'
      : `<div class="fl" style="margin-top:4px">${inBay != null ? fmtBlocks(inBay) + ' in bay · ' : ''}${fmtBlocks(bph)}/hr · ~${fmtBlocks(bph * 24 * 30)}/month</div>` +
        (needed > 0 ? `<div class="fl" style="margin-top:4px;color:var(--c-warn)">⬆ ${needed.toLocaleString()} blocks to reach 30 days</div>` : '');
    return `<div class="tower panel${lowFuel ? ' lowfuel' : ''}${isSnoozed ? ' snoozed-tower' : ''}">` +
      `<div class="tube"><span class="cap"></span><span class="fill ${lowFuel ? 'low' : 'ok'}" style="height:${pct.toFixed(0)}%"></span></div>` +
      `<div class="tbody"><div class="thead">` +
      `<img class="timg" src="https://images.evetech.net/types/${+s.type_id||0}/render?size=64" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` +
      `<div class="thead-t"><div class="tn">${esc(s._name || ('Structure ' + s.structure_id))}</div>` +
      `<div class="tt">${esc(s._corp || '')}</div><div class="sys">${esc(nameOf(s.system_id, 'System'))}</div></div></div>` +
      `<div class="fuelnum"><div class="fv">${fuelMs == null ? 'no fuel data' : fmtDur(fuelMs)}</div>` +
      `<div class="fl">fuel remaining${days != null ? ' · expires ' + s.fuel_expires.slice(0, 10) : ''}</div>${fuelInfo}</div>` +
      `<span class="state st-${s.state === 'shield_vulnerable' || s.state === 'armor_vulnerable' || s.state === 'hull_vulnerable' ? 'warn' : 'ok'}">${esc(state || 'state unknown')}</span>` +
      (svcs ? `<div class="svcs">${svcs}</div>` : '') +
      (tempAlert ? `<button class="refuel-btn visible${isSnoozed ? ' refuelled' : ''}" onclick="window._towerSnooze(${s.structure_id})">${isSnoozed ? '✓ Refuelled' : 'Refuelled'}</button>` : '') +
      `</div></div>`;
  };

  // Auto-clear snooze for structures now at ≥10 days fuel
  let snoozeChanged = false;
  all.forEach(s => {
    const sid = String(s.structure_id);
    if (snoozed[sid]) {
      const d = s.fuel_expires ? (Date.parse(s.fuel_expires) - now) / 86_400_000 : null;
      if (d == null || d >= 10) { delete snoozed[sid]; snoozeChanged = true; }
    }
  });
  if (snoozeChanged) saveSnooze(snoozed);

  const html = lanes.map(L => {
    const active  = L.list.filter(s => !(days_lt10(s) && snoozed[String(s.structure_id)]));
    const pinned  = L.list.filter(s => days_lt10(s) && snoozed[String(s.structure_id)]);
    const ordered = [...active, ...pinned];
    const activeMin = active.length ? fuelMsOf(active[0]) : Infinity;
    const isHot   = activeMin !== Infinity && activeMin / 86_400_000 < 7;
    const cls     = HULL_CLASS[L.tn];
    const desc    = (cls ? cls + ' · ' : '') + 'lowest fuel ' + (activeMin === Infinity ? 'no fuel data' : fmtDur(activeMin));
    return `<div class="tlane panel${isHot ? ' hot' : ''}">` +
      `<div class="tlane-hd"><h2>${esc(L.tn)}</h2><span class="cnt">${L.list.length}</span><span class="desc">${esc(desc)}</span></div>` +
      `<div class="towers">${ordered.map(towerCard).join('')}</div></div>`;
  }).join('');

  $('out').innerHTML = strip + `<div class="typelanes">${html}</div>`;
  reportDashboard(MY_SECTION, total + ' structures' + (low ? ' · ' + low + ' low fuel!' : ''), low ? 'bad' : 'ok');
  $('loadNote').textContent = 'Skyline read ' + new Date().toUTCString().slice(17, 25) + ' EVE';
}

$('loadBtn').onclick = loadAll;
window.onRosterChange = () => { if (towersByCorp) loadAll(); };
renderPilots();
