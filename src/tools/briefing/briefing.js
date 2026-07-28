/**
 * EVE Suite — Command Briefing
 * One strip per pilot: wallet, training, jobs, colonies, orders, whereabouts.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, getTok, resolveNames, nameOf }        from '@core/esi-client.js';
import { $, esc, fmtISK, fmtDur, fmtInt, roman }      from '@core/format.js';

const MY_SECTION = 'briefing';
let chars = loadChars();
let pilots = [];

// ── Shared tool boot helpers ──────────────────────────────────────────────────

function renderPilots() {
  const el = $('pilots'); if (!el) return;
  const ids = Object.keys(chars);
  if (!ids.length) { el.innerHTML = '<span class="nochars">no pilots — sign in from the Toolset menu</span>'; return; }
  el.innerHTML = ids.map(id => {
    const on = sectionOn(id, MY_SECTION);
    return `<button class="ptag${on ? '' : ' off'}" data-id="${id}" title="click to ${on ? 'exclude' : 'include'}">${esc((chars[id] || {}).charName || ('Char ' + id))}</button>`;
  }).join('');
  el.querySelectorAll('.ptag').forEach(b => { b.onclick = () => { setSection(b.dataset.id, MY_SECTION, !sectionOn(b.dataset.id, MY_SECTION)); renderPilots(); if (window.onRosterChange) window.onRosterChange(); }; });
}

function noPilotsGuard(cid) {
  const ids = visibleIds(MY_SECTION); const el = $(cid);
  if (!Object.keys(chars).length) { if (el) el.innerHTML = '<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu and add characters there.</div>'; return true; }
  if (!ids.length) { if (el) el.innerHTML = '<div class="empty">All pilots excluded — click a name above to include one.</div>'; return true; }
  return false;
}

function tickClock() { const el = $('eveclock'); if (!el) return; const d = new Date(); el.textContent = String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0') + ' EVE'; }
tickClock(); setInterval(tickClock, 15_000);
try { if (window.self === window.top) { const bl = $('backlink'); if (bl) bl.style.display = 'inline-flex'; } } catch { /* iframe */ }
window.addEventListener('storage', e => { if (e.key === KEY_CHARS) { chars = loadChars(); renderPilots(); if (window.onRosterChange) window.onRosterChange(); } if (e.key === KEY_THEME && e.newValue) try { document.documentElement.dataset.theme = e.newValue; } catch {} });

// ── Tool logic ────────────────────────────────────────────────────────────────

async function readPilot(id) {
  const p = { id, errs: {} };
  const s = await getTok(id);
  if (!s) throw new Error('token expired — re-open the Toolset menu');
  p.name = s.charName || ('Char ' + id); p.corp = s.corpName || '';
  const T = s.access;
  const grab = async (key, fn) => { try { p[key] = await fn(); } catch (e) { p.errs[key] = e.status === 403 ? 'scope missing' : 'unavailable'; } };
  await Promise.all([
    grab('wallet',  () => esiGet('/characters/' + id + '/wallet/', T)),
    grab('queue',   () => esiGet('/characters/' + id + '/skillqueue/', T)),
    grab('jobs',    () => esiGet('/characters/' + id + '/industry/jobs/', T)),
    grab('planets', () => esiGet('/characters/' + id + '/planets/', T)),
    grab('orders',  () => esiGet('/characters/' + id + '/orders/', T)),
    grab('loc',     () => esiGet('/characters/' + id + '/location/', T)),
  ]);
  return p;
}

function cell(label, val, sub, warn) {
  return `<div class="cell${warn ? ' warn' : ''}"><div class="l">${label}</div><div class="v">${val}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}

function renderAll() {
  const now = Date.now();
  let totISK = 0, training = 0, idle = 0, jobsAll = 0, ordersAll = 0;
  const html = pilots.map(p => {
    if (p.fatal) return `<div class="strip panel"><div class="who"><span class="cn">${esc(p.name || ('Char ' + p.id))}</span></div><div class="charerr" style="grid-column:2/-1;align-self:center">⚠ ${esc(p.fatal)}</div></div>`;
    const q = (p.queue || []).filter(e => e.finish_date && Date.parse(e.finish_date) > now);
    const cur = q[0];
    if (cur) training++; else idle++;
    const qEnd = q.length ? Date.parse(q[q.length - 1].finish_date) : null;
    if (typeof p.wallet === 'number') totISK += p.wallet;
    const actJobs = (p.jobs || []).filter(j => j.status === 'active').length; jobsAll += actJobs;
    const ords = (p.orders || []).length; ordersAll += ords;
    return `<div class="strip panel">` +
      `<div class="who"><span class="cn">${esc(p.name)}</span><span class="cc">${esc(p.corp)}</span></div>` +
      cell('Wallet', p.errs.wallet ? '—' : fmtISK(p.wallet), p.errs.wallet || '') +
      cell('Training', p.errs.queue ? '—' : (cur ? esc(nameOf(cur.skill_id, 'skill')) + ' ' + roman(cur.finished_level) : 'queue empty'),
        p.errs.queue || (cur ? 'ends ' + fmtDur(Date.parse(cur.finish_date) - now) : 'set a skill!'), !p.errs.queue && !cur) +
      cell('Queue runway', q.length ? fmtDur(qEnd - now) : '—', q.length + ' entries') +
      cell('Industry jobs', p.errs.jobs ? '—' : String(actJobs), p.errs.jobs || ((p.jobs || []).length + ' total')) +
      cell('Colonies · orders', (p.errs.planets ? '—' : (p.planets || []).length) + ' · ' + (p.errs.orders ? '—' : ords), 'colonies · live orders') +
      cell('Whereabouts', p.errs.loc ? '—' : esc(nameOf((p.loc || {}).solar_system_id, '…')), p.errs.loc || 'solar system') +
      `</div>`;
  }).join('');
  $('out').innerHTML = html +
    `<div class="agg panel">` +
    `<div class="a"><div class="l">Roster ISK</div><div class="v">${fmtISK(totISK)}</div></div>` +
    `<div class="a"><div class="l">Training / idle</div><div class="v">${training} / ${idle}</div></div>` +
    `<div class="a"><div class="l">Industry jobs live</div><div class="v">${jobsAll}</div></div>` +
    `<div class="a"><div class="l">Market orders live</div><div class="v">${ordersAll}</div></div>` +
    `<div class="a"><div class="l">Pilots on deck</div><div class="v">${visibleIds(MY_SECTION).length}</div></div>` +
    `</div>`;
  reportDashboard(MY_SECTION, fmtISK(totISK) + ' · ' + training + ' training' + (idle ? ' · ' + idle + ' idle!' : ''), idle ? 'bad' : 'ok');
  $('loadNote').textContent = 'Briefing read ' + new Date().toUTCString().slice(17, 25) + ' EVE';
}

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn = $('loadBtn'); btn.disabled = true;
  $('out').innerHTML = '<div class="empty"><span class="spin"></span>Reading the morning briefing…</div>';
  pilots = [];
  for (const id of visibleIds(MY_SECTION)) {
    try { pilots.push(await readPilot(id)); }
    catch (e) { pilots.push({ id, name: (chars[id] || {}).charName, fatal: e.message }); }
  }
  const skillIds = pilots.flatMap(p => (p.queue || []).map(e => e.skill_id));
  const sysIds   = pilots.map(p => ((p.loc || {}).solar_system_id)).filter(Boolean);
  try { await resolveNames([...skillIds, ...sysIds]); } catch { /* non-fatal */ }
  renderAll();
  btn.disabled = false;
}

$('loadBtn').onclick = loadAll;
window.onRosterChange = () => { if (pilots.length) loadAll(); };
renderPilots();
