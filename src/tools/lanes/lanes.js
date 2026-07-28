/**
 * EVE Suite — Freight Lanes
 * Jump-freighter flight plan: legs, light-years, fuel from live coordinates
 * and real JDC/JFC/JF skill levels. No sign-in required (public ESI only).
 */
import { KEY_THEME }                              from '@core/constants.js';
import { esiGet, esiPost }                        from '@core/esi-client.js';
import { $, esc, fmtInt, fmtFull, roman }         from '@core/format.js';

// Theme cross-tab sync (no roster needed — this tool is public-only)
window.addEventListener('storage', e => {
  if (e.key === KEY_THEME && e.newValue) try { document.documentElement.dataset.theme = e.newValue; } catch {}
});
try { if (window.self === window.top) { const bl = $('backlink'); if (bl) bl.style.display = 'inline-flex'; } } catch {}

function toast(msg, bad = false) { const t = $('toast'); if (!t) return; t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 3600); }

// ── Ship data ─────────────────────────────────────────────────────────────────

const SHIPS = {
  ark:    { name: 'Ark',    race: 'Amarr',    iso: 'Helium Isotopes',   baseRange: 5.0, baseFuel: 3100 },
  rhea:   { name: 'Rhea',   race: 'Caldari',  iso: 'Nitrogen Isotopes', baseRange: 5.0, baseFuel: 3100 },
  anshar: { name: 'Anshar', race: 'Gallente', iso: 'Oxygen Isotopes',   baseRange: 5.0, baseFuel: 3100 },
  nomad:  { name: 'Nomad',  race: 'Minmatar', iso: 'Hydrogen Isotopes', baseRange: 5.0, baseFuel: 3100 },
};

const LY_M = 9.4607e15; // metres per light-year
let ship = 'anshar', JDC = 5, JFC = 5, JF = 5;

function maxRange()  { return SHIPS[ship].baseRange * (1 + 0.2 * JDC); }
function fuelPerLy() { return SHIPS[ship].baseFuel  * (1 - 0.1 * JFC) * (1 - 0.1 * JF); }

// ── Ship/skill selectors ──────────────────────────────────────────────────────

$('shipSel').innerHTML = Object.entries(SHIPS)
  .map(([k, s]) => `<option value="${k}"${k === ship ? ' selected' : ''}>${s.name} (${s.race})</option>`)
  .join('');
$('shipSel').onchange = e => { ship = e.target.value; };

function fillSk(id, min, cb) {
  const s = $(id); s.innerHTML = '';
  for (let i = min; i <= 5; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = roman(i); if (i === 5) o.selected = true;
    s.appendChild(o);
  }
  s.onchange = e => cb(+e.target.value);
}
fillSk('jdcSel', 0, v => { JDC = v; });
fillSk('jfcSel', 0, v => { JFC = v; });
fillSk('jfSel',  1, v => { JF  = v; });

// ── Midpoints ─────────────────────────────────────────────────────────────────

let wayCount = 0;
$('addWay').onclick = () => {
  wayCount++;
  const sp = document.createElement('input');
  sp.className = 'wayin'; sp.placeholder = 'midpoint system';
  $('ways').appendChild(sp);
};

// ── System lookup ─────────────────────────────────────────────────────────────

const sysCache = {};
async function systemByName(name) {
  const k = name.toLowerCase();
  if (sysCache[k]) return sysCache[k];
  const r = await esiPost('/universe/ids/', [name]);
  const s = (r.systems || [])[0];
  if (!s) throw new Error('unknown system: "' + name + '" (ESI needs the exact name)');
  const d = await esiGet('/universe/systems/' + s.id + '/');
  const out = { id: s.id, name: d.name, pos: d.position, sec: d.security_status };
  sysCache[k] = out; return out;
}

function lyBetween(a, b) {
  const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y, dz = a.pos.z - b.pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / LY_M;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

async function plan() {
  const names = [
    $('fromIn').value.trim(),
    ...[...document.querySelectorAll('.wayin')].map(i => i.value.trim()).filter(Boolean),
    $('toIn').value.trim(),
  ].filter(Boolean);
  if (names.length < 2) { toast('need at least an origin and a destination', true); return; }
  $('out').innerHTML = '<div class="empty"><span class="spin"></span>Filing the plan…</div>';
  try {
    const stops = [];
    for (const n of names) stops.push(await systemByName(n));
    const fpl = fuelPerLy(), mr = maxRange();
    let totLy = 0, totFuel = 0, over = 0;
    const legs = stops.slice(1).map((b, i) => {
      const a = stops[i]; const ly = lyBetween(a, b); const fuel = Math.ceil(ly * fpl);
      const bad = ly > mr;
      if (bad) over++; else { totLy += ly; totFuel += fuel; }
      return { a, b, ly, fuel, bad };
    });
    const nodeHtml = s =>
      `<div class="node"><span class="np${s.sec >= 0.45 ? ' hi' : ''}"></span>` +
      `<div class="nn">${esc(s.name)}</div>` +
      `<div class="nl">${s.sec.toFixed(1)} sec${s.sec >= 0.45 ? ' · NO CYNO (highsec)' : ''}</div></div>`;
    const legHtml = l =>
      `<div class="leg${l.bad ? ' over' : ''}"><span class="line"></span><div class="lbox">` +
      `<div class="ly">${l.ly.toFixed(2)} LY${l.bad ? ' — OVER RANGE' : ''}</div>` +
      `<div class="fu">${l.bad ? 'add a midpoint' : fmtInt(l.fuel) + ' ' + SHIPS[ship].iso.split(' ')[0].toLowerCase() + ' iso'}</div></div></div>`;
    let lane = '';
    stops.forEach((s, i) => { lane += nodeHtml(s); if (i < legs.length) lane += legHtml(legs[i]); });
    const hiSecDest = stops.slice(1).some(s => s.sec >= 0.45);
    $('out').innerHTML =
      `<div class="lane panel">${lane}</div>` +
      `<div class="totals panel">` +
      `<div class="t"><div class="l">Ship · max jump</div><div class="v">${SHIPS[ship].name} · ${maxRange().toFixed(1)} LY</div></div>` +
      `<div class="t"><div class="l">Jumps</div><div class="v">${legs.length}${over ? ' (' + over + ' over range)' : ''}</div></div>` +
      `<div class="t"><div class="l">Distance jumped</div><div class="v">${totLy.toFixed(2)} LY</div></div>` +
      `<div class="t"><div class="l">Fuel · ${esc(SHIPS[ship].iso)}</div><div class="v">${fmtInt(totFuel)}</div></div>` +
      `</div>` +
      `<div class="smallprint panel">Distances are straight-line light-years from live ESI system coordinates. ` +
      `Fuel = ⌈ly × ${fmtFull(fpl)}⌉ per jump (base 3,100 × JFC × JF). ` +
      (hiSecDest ? '<b>Note:</b> legs ending in highsec (0.45+) can\'t be jumped to — cynos can\'t be lit there; route to a lowsec midpoint instead. ' : '') +
      `Jump fatigue and gate routing are not modelled here.</div>`;
  } catch (e) { $('out').innerHTML = `<div class="empty">plan failed: ${esc(e.message)}</div>`; }
}

$('planBtn').onclick = plan;
[$('fromIn'), $('toIn')].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') plan(); }));
