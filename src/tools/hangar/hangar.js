/**
 * EVE Suite — Fitting Hangar
 * Every in-game fitting grouped by hull, slot board on click, EFT copy.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, getTok, resolveNames, nameOf }        from '@core/esi-client.js';
import { $, esc }                                      from '@core/format.js';

const MY_SECTION = 'hangar';
let chars = loadChars();
let bays  = null;

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

// ── Slot section lookup ───────────────────────────────────────────────────────

const FLAG_SECTIONS = [
  { name: 'High slots', lo: 27, hi: 34 },
  { name: 'Mid slots',  lo: 19, hi: 26 },
  { name: 'Low slots',  lo: 11, hi: 18 },
  { name: 'Rigs',       lo: 92, hi: 99 },
  { name: 'Subsystems', lo: 125, hi: 132 },
  { name: 'Drone bay',  lo: 87, hi: 87 },
  { name: 'Cargo',      lo: 5,  hi: 5  },
];
function sectionOf(flag) {
  for (const s of FLAG_SECTIONS) if (flag >= s.lo && flag <= s.hi) return s.name;
  return 'Other';
}

// ── EFT export ────────────────────────────────────────────────────────────────

function eftOf(entry) {
  const f = entry.fit;
  const bySec = {};
  f.items.forEach(i => { const s = sectionOf(i.flag); (bySec[s] = bySec[s] || []).push(i); });
  let out = '[' + nameOf(f.ship_type_id, 'Ship') + ', ' + f.name + ']\n';
  ['Low slots', 'Mid slots', 'High slots', 'Rigs', 'Subsystems'].forEach(sec => {
    (bySec[sec] || []).forEach(i => { for (let k = 0; k < (i.quantity || 1); k++) out += nameOf(i.type_id, 'Module') + '\n'; });
    if (bySec[sec] && bySec[sec].length) out += '\n';
  });
  ['Drone bay', 'Cargo', 'Other'].forEach(sec => {
    (bySec[sec] || []).forEach(i => { out += nameOf(i.type_id, 'Item') + ' x' + (i.quantity || 1) + '\n'; });
  });
  return out.trim();
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn = $('loadBtn'); btn.disabled = true;
  $('out').innerHTML = '<div class="empty"><span class="spin"></span>Opening the bays…</div>';
  bays = {}; const errs = [];
  for (const id of visibleIds(MY_SECTION)) {
    try {
      const s = await getTok(id); if (!s) throw new Error('token expired — re-open the Toolset menu');
      const fits = await esiGet('/characters/' + id + '/fittings/', s.access);
      fits.forEach(f => { (bays[f.ship_type_id] = bays[f.ship_type_id] || []).push({ fit: f, owner: s.charName || ('Char ' + id) }); });
    } catch (e) { errs.push(((chars[id] || {}).charName || id) + ': ' + (e.status === 403 ? 'fittings scope missing — re-add in the Toolset menu' : e.message)); }
  }
  const typeIds = Object.keys(bays).map(Number)
    .concat(Object.values(bays).flatMap(list => list.flatMap(x => x.fit.items.map(i => i.type_id))));
  try { await resolveNames(typeIds); } catch {}
  render(errs);
  btn.disabled = false;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(errs) {
  const errHtml = (errs || []).map(e => `<div class="charerr">⚠ ${esc(e)}</div>`).join('');
  const hulls = Object.keys(bays);
  if (!hulls.length) { $('out').innerHTML = errHtml + '<div class="empty">no saved fittings on the roster</div>'; return; }
  hulls.sort((a, b) => String(nameOf(+a, '')).localeCompare(String(nameOf(+b, ''))));
  let totalFits = 0;
  $('out').innerHTML = errHtml + hulls.map(h => {
    const list = bays[h]; totalFits += list.length;
    return `<div class="bay panel" data-hull="${h}">` +
      `<div class="bay-hd"><span class="hull">${esc(nameOf(+h, 'Hull ' + h))}</span><span class="grip"></span><span class="cnt">${list.length} fit${list.length > 1 ? 's' : ''}</span></div>` +
      `<div class="chips">${list.map((x, i) => `<button class="fitchip" data-hull="${h}" data-i="${i}">${esc(x.fit.name)} <span style="opacity:.6">· ${esc(x.owner)}</span></button>`).join('')}</div>` +
      `<div class="board" id="board-${h}"></div></div>`;
  }).join('');
  document.querySelectorAll('.fitchip').forEach(ch => { ch.onclick = () => openFit(ch.dataset.hull, +ch.dataset.i); });
  reportDashboard(MY_SECTION, totalFits + ' fits across ' + hulls.length + ' hulls', 'ok');
  $('loadNote').textContent = 'Bays read ' + new Date().toUTCString().slice(17, 25) + ' EVE';
}

function openFit(hull, i) {
  const entry = bays[hull][i]; const f = entry.fit;
  const board = $('board-' + hull);
  const already = board.classList.contains('open') && board.dataset.i === String(i);
  document.querySelectorAll('.board').forEach(b => b.classList.remove('open'));
  if (already) return;
  const bySec = {};
  f.items.forEach(it => { const s = sectionOf(it.flag); (bySec[s] = bySec[s] || []).push(it); });
  board.dataset.i = String(i);
  board.innerHTML =
    `<div class="bh"><span class="fn">${esc(f.name)} — ${esc(entry.owner)}${f.description ? ' · ' + esc(f.description) : ''}</span>` +
    `<button class="btn" id="eftBtn-${hull}">Copy as EFT</button></div>` +
    `<div class="slotcols">${FLAG_SECTIONS.concat([{ name: 'Other' }]).filter(s => bySec[s.name] && bySec[s.name].length).map(s =>
      `<div class="scol"><div class="sh">${s.name.toUpperCase()}</div>` +
      bySec[s.name].map(it => `<div class="mod"><span>${esc(nameOf(it.type_id, 'Type ' + it.type_id))}</span><span class="mq">×${it.quantity || 1}</span></div>`).join('') +
      `</div>`).join('')}</div>`;
  board.classList.add('open');
  $('eftBtn-' + hull).onclick = () => {
    const txt = eftOf(entry);
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(() => toast('EFT copied'), () => toast('copy blocked', true));
    else toast('clipboard unavailable', true);
  };
}

$('loadBtn').onclick = loadAll;
window.onRosterChange = () => { if (bays) loadAll(); };
renderPilots();
