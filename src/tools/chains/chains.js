/**
 * EVE Suite — Chain Works
 *
 * Planetary production chain drafter: P0→P4 tree, planet-type coverage,
 * candidate system hunt (BFS over gate network), colony logistics deck
 * with nearest-first route optimiser, roster capacity engine, and the
 * "What to make?" profit ranker.
 *
 * Universe graph and PI schematic data are carried over verbatim from the
 * original PI Planner — real game data, never fabricated.
 */

// Static data assets
import UNIVERSE from '../../assets/universe.js';

import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiPost, getTok, pLimit,
         loadNameCache, saveNameCache }                from '@core/esi-client.js';
import { $, esc, fmtISK, fmtFull, fmtInt,
         fmtHrs, roman }                               from '@core/format.js';

// ── Shared boot helpers ───────────────────────────────────────────────────────

const MY_SECTION = 'chains';
let chars = loadChars();

function renderPilots() {
  const el = $('pilots'); if (!el) return;
  const ids = Object.keys(chars);
  if (!ids.length) { el.innerHTML = '<span class="nochars">no pilots — sign in from the Toolset menu</span>'; return; }
  el.innerHTML = ids.map(id => {
    const on = sectionOn(id, MY_SECTION);
    return `<button class="ptag${on ? '' : ' off'}" data-id="${id}" title="click to ${on ? 'exclude' : 'include'}">${esc((chars[id] || {}).charName || ('Char ' + id))}</button>`;
  }).join('');
  el.querySelectorAll('.ptag').forEach(b => {
    b.onclick = () => { setSection(b.dataset.id, MY_SECTION, !sectionOn(b.dataset.id, MY_SECTION)); renderPilots(); if (window.onRosterChange) window.onRosterChange(); };
  });
}

function toast(msg, bad = false) { const t = $('toast'); if (!t) return; t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 3600); }
function tickClock() { const el = $('eveclock'); if (!el) return; const d = new Date(); el.textContent = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' EVE'; }
tickClock(); setInterval(tickClock, 15_000);
try { if (window.self === window.top) { const bl = $('backlink'); if (bl) bl.style.display = 'inline-flex'; } } catch { /* iframe */ }
window.addEventListener('storage', e => {
  if (e.key === KEY_CHARS) { chars = loadChars(); renderPilots(); if (window.onRosterChange) window.onRosterChange(); }
  if (e.key === KEY_THEME && e.newValue) try { document.documentElement.dataset.theme = e.newValue; } catch {}
  if ([KEY_CHARS, ROLE_KEY, SKILL_CACHE_KEY, EXTRACT_RATE_KEY].includes(e.key)) liveRefresh();
});

// ── PI schematic dataset ──────────────────────────────────────────────────────
// Carried over verbatim from the original PI Planner — real game data.

const PI = {"names":{"44":"Enriched Uranium","2073":"Microorganisms","2267":"Base Metals","2268":"Aqueous Liquids","2270":"Noble Metals","2272":"Heavy Metals","2286":"Planktic Colonies","2287":"Complex Organisms","2288":"Carbon Compounds","2305":"Autotrophs","2306":"Non-CS Crystals","2307":"Felsic Magma","2308":"Suspended Plasma","2309":"Ionic Solutions","2310":"Noble Gas","2311":"Reactive Gas","2312":"Supertensile Plastics","2317":"Oxides","2319":"Test Cultures","2321":"Polyaramids","2327":"Microfiber Shielding","2328":"Water-Cooled CPU","2329":"Biocells","2344":"Condensates","2345":"Camera Drones","2346":"Synthetic Synapses","2348":"Gel-Matrix Biopaste","2349":"Supercomputers","2351":"Smartfab Units","2352":"Nuclear Reactors","2354":"Neocoms","2358":"Biotech Research Reports","2360":"Industrial Explosives","2361":"Hermetic Membranes","2366":"Hazmat Detection Systems","2367":"Cryoprotectant Solution","2389":"Plasmoids","2390":"Electrolytes","2392":"Oxidizing Compound","2393":"Bacteria","2395":"Proteins","2396":"Biofuels","2397":"Industrial Fibers","2398":"Reactive Metals","2399":"Precious Metals","2400":"Toxic Metals","2401":"Chiral Structures","2463":"Nanites","2867":"Broadcast Node","2868":"Integrity Response Drones","2869":"Nano-Factory","2870":"Organic Mortar Applicators","2871":"Recursive Computing Module","2872":"Self-Harmonizing Power Core","2875":"Sterile Conduits","2876":"Wetware Mainframe","3645":"Water","3683":"Oxygen","3689":"Mechanical Parts","3691":"Synthetic Oil","3693":"Fertilizer","3695":"Polytextiles","3697":"Silicate Glass","3725":"Livestock","3775":"Viral Agent","3779":"Biomass","3828":"Construction Blocks","9828":"Silicon","9830":"Rocket Fuel","9832":"Coolant","9834":"Guidance Systems","9836":"Consumer Electronics","9838":"Superconductors","9840":"Transmitter","9842":"Miniature Electronics","9846":"Planetary Vehicles","9848":"Robotics","12836":"Transcranial Microcontrollers","15317":"Genetically Enhanced Livestock","17136":"Ukomi Superconductors","17392":"Data Chips","17898":"High-Tech Transmitters","28974":"Vaccines"},"recipe":{"9838":{"ct":3600,"out":5,"in":[[2389,40],[3645,40]],"name":"Superconductors"},"9832":{"ct":3600,"out":5,"in":[[2390,40],[3645,40]],"name":"Coolant"},"9830":{"ct":3600,"out":5,"in":[[2389,40],[2390,40]],"name":"Rocket Fuel"},"3691":{"ct":3600,"out":5,"in":[[2390,40],[3683,40]],"name":"Synthetic Oil"},"2317":{"ct":3600,"out":5,"in":[[2392,40],[3683,40]],"name":"Oxides"},"3697":{"ct":3600,"out":5,"in":[[2392,40],[9828,40]],"name":"Silicate Glass"},"9840":{"ct":3600,"out":5,"in":[[2389,40],[2401,40]],"name":"Transmitter"},"2328":{"ct":3600,"out":5,"in":[[2398,40],[3645,40]],"name":"Water-Cooled CPU"},"3689":{"ct":3600,"out":5,"in":[[2398,40],[2399,40]],"name":"Mechanical Parts"},"3828":{"ct":3600,"out":5,"in":[[2398,40],[2400,40]],"name":"Construction Blocks"},"44":{"ct":3600,"out":5,"in":[[2399,40],[2400,40]],"name":"Enriched Uranium"},"9836":{"ct":3600,"out":5,"in":[[2400,40],[2401,40]],"name":"Consumer Electronics"},"9842":{"ct":3600,"out":5,"in":[[2401,40],[9828,40]],"name":"Miniature Electronics"},"2463":{"ct":3600,"out":5,"in":[[2393,40],[2398,40]],"name":"Nanites"},"2329":{"ct":3600,"out":5,"in":[[2396,40],[2399,40]],"name":"Biocells"},"2327":{"ct":3600,"out":5,"in":[[2397,40],[9828,40]],"name":"Microfiber Shielding"},"3775":{"ct":3600,"out":5,"in":[[2393,40],[3779,40]],"name":"Viral Agent"},"3693":{"ct":3600,"out":5,"in":[[2393,40],[2395,40]],"name":"Fertilizer"},"15317":{"ct":3600,"out":5,"in":[[2395,40],[3779,40]],"name":"Genetically Enhanced Livestock"},"3725":{"ct":3600,"out":5,"in":[[2395,40],[2396,40]],"name":"Livestock"},"3695":{"ct":3600,"out":5,"in":[[2396,40],[2397,40]],"name":"Polytextiles"},"2319":{"ct":3600,"out":5,"in":[[2393,40],[3645,40]],"name":"Test Cultures"},"2312":{"ct":3600,"out":5,"in":[[3683,40],[3779,40]],"name":"Supertensile Plastics"},"2321":{"ct":3600,"out":5,"in":[[2392,40],[2397,40]],"name":"Polyaramids"},"17136":{"ct":3600,"out":3,"in":[[3691,10],[9838,10]],"name":"Ukomi Superconductor"},"2344":{"ct":3600,"out":3,"in":[[2317,10],[9832,10]],"name":"Condensates"},"2345":{"ct":3600,"out":3,"in":[[3697,10],[9830,10]],"name":"Camera Drones"},"2346":{"ct":3600,"out":3,"in":[[2312,10],[2319,10]],"name":"Synthetic Synapses"},"17898":{"ct":3600,"out":3,"in":[[2321,10],[9840,10]],"name":"High-Tech Transmitter"},"2348":{"ct":3600,"out":3,"in":[[2317,10],[2329,10],[9838,10]],"name":"Gel-Matrix Biopaste"},"2349":{"ct":3600,"out":3,"in":[[2328,10],[9832,10],[9836,10]],"name":"Supercomputers"},"9848":{"ct":3600,"out":3,"in":[[3689,10],[9836,10]],"name":"Robotics"},"2351":{"ct":3600,"out":3,"in":[[3828,10],[9842,10]],"name":"Smartfab Units"},"2352":{"ct":3600,"out":3,"in":[[44,10],[2327,10]],"name":"Nuclear Reactors"},"9834":{"ct":3600,"out":3,"in":[[2328,10],[9840,10]],"name":"Guidance Systems"},"2354":{"ct":3600,"out":3,"in":[[2329,10],[3697,10]],"name":"Neocoms"},"9846":{"ct":3600,"out":3,"in":[[2312,10],[3689,10],[9842,10]],"name":"Planetary Vehicles"},"2358":{"ct":3600,"out":3,"in":[[2463,10],[3725,10],[3828,10]],"name":"Biotech Research Reports"},"28974":{"ct":3600,"out":3,"in":[[3725,10],[3775,10]],"name":"Vaccines"},"2360":{"ct":3600,"out":3,"in":[[3693,10],[3695,10]],"name":"Industrial Explosives"},"2361":{"ct":3600,"out":3,"in":[[2321,10],[15317,10]],"name":"Hermetic Membranes"},"12836":{"ct":3600,"out":3,"in":[[2329,10],[2463,10]],"name":"Transcranial Microcontroller"},"17392":{"ct":3600,"out":3,"in":[[2312,10],[2327,10]],"name":"Data Chips"},"2366":{"ct":3600,"out":3,"in":[[3695,10],[3775,10],[9840,10]],"name":"Hazmat Detection Systems"},"2367":{"ct":3600,"out":3,"in":[[2319,10],[3691,10],[3693,10]],"name":"Cryoprotectant Solution"},"2870":{"ct":3600,"out":1,"in":[[2344,6],[2393,40],[9848,6]],"name":"Organic Mortar Applicators"},"2875":{"ct":3600,"out":1,"in":[[2351,6],[3645,40],[28974,6]],"name":"Sterile Conduits"},"2869":{"ct":3600,"out":1,"in":[[2360,6],[2398,40],[17136,6]],"name":"Nano-Factory"},"2872":{"ct":3600,"out":1,"in":[[2345,6],[2352,6],[2361,6]],"name":"Self-Harmonizing Power Core"},"2871":{"ct":3600,"out":1,"in":[[2346,6],[9834,6],[12836,6]],"name":"Recursive Computing Module"},"2867":{"ct":3600,"out":1,"in":[[2354,6],[17392,6],[17898,6]],"name":"Broadcast Node"},"2868":{"ct":3600,"out":1,"in":[[2348,6],[2366,6],[9846,6]],"name":"Integrity Response Drones"},"2876":{"ct":3600,"out":1,"in":[[2349,6],[2358,6],[2367,6]],"name":"Wetware Mainframe"},"3645":{"ct":1800,"out":20,"in":[[2268,3000]],"name":"Water"},"2389":{"ct":1800,"out":20,"in":[[2308,3000]],"name":"Plasmoids"},"2390":{"ct":1800,"out":20,"in":[[2309,3000]],"name":"Electrolytes"},"3683":{"ct":1800,"out":20,"in":[[2310,3000]],"name":"Oxygen"},"2392":{"ct":1800,"out":20,"in":[[2311,3000]],"name":"Oxidizing Compound"},"2398":{"ct":1800,"out":20,"in":[[2267,3000]],"name":"Reactive Metals"},"2399":{"ct":1800,"out":20,"in":[[2270,3000]],"name":"Precious Metals"},"2400":{"ct":1800,"out":20,"in":[[2272,3000]],"name":"Toxic Metals"},"2401":{"ct":1800,"out":20,"in":[[2306,3000]],"name":"Chiral Structures"},"9828":{"ct":1800,"out":20,"in":[[2307,3000]],"name":"Silicon"},"2393":{"ct":1800,"out":20,"in":[[2073,3000]],"name":"Bacteria"},"3779":{"ct":1800,"out":20,"in":[[2286,3000]],"name":"Biomass"},"2395":{"ct":1800,"out":20,"in":[[2287,3000]],"name":"Proteins"},"2396":{"ct":1800,"out":20,"in":[[2288,3000]],"name":"Biofuels"},"2397":{"ct":1800,"out":20,"in":[[2305,3000]],"name":"Industrial Fibers"}},"p0":[2073,2267,2268,2270,2272,2286,2287,2288,2305,2306,2307,2308,2309,2310,2311],"p0pt":{"2272":["I","L","P"],"2305":["T"],"2306":["L","P"],"2307":["L"],"2308":["L","P","S"],"2309":["G","S"],"2310":["G","I","S"],"2311":["G"],"2286":["I","O"],"2287":["O","T"],"2288":["B","O","T"],"2073":["B","I","O","T"],"2267":["B","G","L","P","S"],"2268":["B","G","I","O","S","T"],"2270":["B","P"]},"tier":{"2272":0,"2305":0,"2306":0,"2307":0,"2308":0,"2309":0,"2310":0,"2311":0,"2286":0,"2287":0,"2288":0,"2073":0,"2267":0,"2268":0,"2270":0,"2389":1,"3645":1,"9838":2,"2390":1,"9832":2,"9830":2,"3683":1,"3691":2,"2392":1,"2317":2,"9828":1,"3697":2,"2401":1,"9840":2,"2398":1,"2328":2,"2399":1,"3689":2,"2400":1,"3828":2,"44":2,"9836":2,"9842":2,"2393":1,"2463":2,"2396":1,"2329":2,"2397":1,"2327":2,"3779":1,"3775":2,"2395":1,"3693":2,"15317":2,"3725":2,"3695":2,"2319":2,"2312":2,"2321":2,"17136":3,"2344":3,"2345":3,"2346":3,"17898":3,"2348":3,"2349":3,"9848":3,"2351":3,"2352":3,"9834":3,"2354":3,"9846":3,"2358":3,"28974":3,"2360":3,"2361":3,"12836":3,"17392":3,"2366":3,"2367":3,"2870":4,"2875":4,"2869":4,"2872":4,"2871":4,"2867":4,"2868":4,"2876":4}};

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_KEY         = 'eve_suite_chains_roles';
const BASKET_KEY       = 'eve_suite_chains_basket';
const EXTRACT_RATE_KEY = 'eve_suite_chains_extract_rate';
const SKILL_CACHE_KEY  = 'eve_suite_chains_pi_skills';
const CAP_OVR_KEY      = 'eve_suite_chains_cap_ovr';

const ROLES = ['—', 'Extractor', 'Factory', 'Full chain'];
const PT_LONG = UNIVERSE.planetTypes || {};

const PI_VOL = {"44":0.75,"2073":0.005,"2267":0.005,"2268":0.005,"2270":0.005,"2272":0.005,"2286":0.005,"2287":0.005,"2288":0.005,"2305":0.005,"2306":0.005,"2307":0.005,"2308":0.005,"2309":0.005,"2310":0.005,"2311":0.005,"2312":0.75,"2317":0.75,"2319":0.75,"2321":0.75,"2327":0.75,"2328":0.75,"2329":0.75,"2344":3.0,"2345":3.0,"2346":3.0,"2348":3.0,"2349":3.0,"2351":3.0,"2352":3.0,"2354":3.0,"2358":3.0,"2360":3.0,"2361":3.0,"2366":3.0,"2367":3.0,"2389":0.19,"2390":0.19,"2392":0.19,"2393":0.19,"2395":0.19,"2396":0.19,"2397":0.19,"2398":0.19,"2399":0.19,"2400":0.19,"2401":0.19,"2463":0.75,"2867":50.0,"2868":50.0,"2869":50.0,"2870":50.0,"2871":50.0,"2872":50.0,"2875":50.0,"2876":50.0,"3645":0.19,"3683":0.19,"3689":0.75,"3691":0.75,"3693":0.75,"3695":0.75,"3697":0.75,"3725":0.75,"3775":0.75,"3779":0.19,"3828":0.75,"9828":0.19,"9830":0.75,"9832":0.75,"9834":3.0,"9836":0.75,"9838":0.75,"9840":0.75,"9842":0.75,"9846":3.0,"9848":3.0,"12836":3.0,"15317":0.75,"17136":3.0,"17392":3.0,"17898":3.0,"28974":3.0};
const REF_VOLUME_BY_TIER = {0:0.4,1:6,2:8,3:340,4:6000};

const HAUL_SHIPS = [
  {id:'epithal',  name:'Epithal (Gallente Industrial)',              hold:3_000},
  {id:'primae',   name:'Primae (CCP unique)',                        hold:10_000},
  {id:'squall',   name:'Squall (Upwell T1 Hauler)',                  hold:5_000},
  {id:'deluge',   name:'Deluge (Upwell T2 Blockade Runner)',         hold:5_000},
  {id:'torrent',  name:'Torrent (Upwell T2 Transport)',              hold:8_000},
  {id:'avalanche',name:'Avalanche (Upwell Freighter)',               hold:3_000_000},
  {id:'custom',   name:'Custom / other hauler…',                     hold:1_000},
];

const EXTRACTOR_P0_HR_DEFAULT = 12_000;
const SLOTS_BY_CCU = [3, 6, 9, 12, 15, 19];

const HUBS = [['Jita',60003760],['Amarr',60008494],['Dodixie',60011866],['Rens',60004588],['Hek',60005686]];
const PT_COLOR = {T:'#6fd06f',I:'#9fd4e0',G:'#c9a868',O:'#5aa0d0',L:'#d66a5a',B:'#b09060',S:'#b69adf',P:'#e0a040',H:'#888'};

// ── State ─────────────────────────────────────────────────────────────────────

let target = null, tierFilter = null;
let basket = {};  try { basket = JSON.parse(localStorage.getItem(BASKET_KEY) || '{}') || {}; } catch {}
let roles  = {};  try { roles  = JSON.parse(localStorage.getItem(ROLE_KEY)   || '{}') || {}; } catch {}
let piSkills = {}; try { piSkills = JSON.parse(localStorage.getItem(SKILL_CACHE_KEY) || '{}') || {}; } catch {}
let capOvr = {};  try { capOvr = JSON.parse(localStorage.getItem(CAP_OVR_KEY) || '{}') || {}; } catch {}

let haulShipId = 'epithal';
let haulCapacity = HAUL_SHIPS[0].hold;
try { haulShipId  = localStorage.getItem('pi_haul_ship') || haulShipId; } catch {}
try { const sc = localStorage.getItem('pi_haul_capacity'); if (sc) haulCapacity = +sc; } catch {}

let lastHunt = null;
let selectedSystemId = null;
let mapZoom = 1, mapPanX = 0, mapPanY = 0, _pts = [];

// What-to-make panel state
let mk_priceCache = {}, mk_pricesLoading = false;
let mk_buyHub    = +(localStorage.getItem('pi_hub') || 60003760);
let mk_buyP0     = localStorage.getItem('pi_bp0') === '1';
let mk_buyP1     = localStorage.getItem('pi_bp1') !== '0';
let mk_sellMode  = localStorage.getItem('pi_sellmode') || 'buy';
let mk_makeTier  = 4;
let mk_mkSort    = { key: 'perHrFac', dir: -1 };
let mk_mkPTFilter = new Set();
let mk_mkChain   = null;
let mk_cbPalette = localStorage.getItem('pi_cb') === '1';
let mk_panelVisible = false;

// Name cache direct access (for sysmeta pattern — same as moons.js)
const _nameCache = loadNameCache();
function _saveNameCache() { saveNameCache(_nameCache); }

// ── BOM / chain maths ─────────────────────────────────────────────────────────

function bomExpand(t, qty, acc) {
  acc = acc || { p0: {}, steps: {} };
  const r = PI.recipe[t];
  if (!r) { acc.p0[t] = (acc.p0[t] || 0) + qty; return acc; }
  acc.steps[t] = (acc.steps[t] || 0) + qty;
  r.in.forEach(([inp, q]) => bomExpand(inp, qty * q / r.out, acc));
  return acc;
}
function chainP0s(t) { return Object.keys(bomExpand(t, 1).p0).map(Number); }
function perHour(t) { const r = PI.recipe[t]; return r ? r.out * 3600 / r.ct : 0; }
function fmtQ(n) { return n >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toString(); }
function basketIds() { return Object.keys(basket); }
function basketP0() {
  const out = new Set();
  const src = basketIds().length ? basketIds() : (target ? [String(target)] : []);
  src.forEach(pid => chainP0s(+pid).forEach(p => out.add(String(p))));
  return [...out];
}

// ── Basket / product management ───────────────────────────────────────────────

function saveBasket() { try { localStorage.setItem(BASKET_KEY, JSON.stringify(basket)); } catch {} }

function setTarget(id) {
  basket[id] = basket[id] || 10;
  target = id; $('prodSearch').value = ''; $('suggBox').style.display = 'none';
  refreshDraft();
}
function removeProduct(id) {
  delete basket[id];
  if (String(target) === String(id)) target = basketIds().length ? +basketIds()[basketIds().length - 1] : null;
  refreshDraft();
}
function addProduct(id) {
  basket[id] = basket[id] || 10; target = id;
  refreshDraft();
}

function refreshDraft() {
  saveBasket(); renderBasket(); renderChain(); renderCoverage(); renderCapacity();
  $('huntOut').innerHTML = `<div class="empty" style="padding:12px">${basketIds().length ? 're-hunt for the new basket' : 'draft a product, set a home system, hunt'}</div>`;
  lastHunt = null; selectedSystemId = null; $('mapPanel').classList.remove('on'); $('logiDeck').classList.remove('on');
  const ids = basketIds();
  reportDashboard(MY_SECTION, ids.length ? ('drafting ' + ids.map(i => PI.recipe[i].name).join(' + ')) : 'drafting table clear', ids.length ? 'ok' : 'muted');
}

// ── Product search ────────────────────────────────────────────────────────────

const RECIPE_IDS = Object.keys(PI.recipe);

function renderTierChips() {
  $('tierChips').innerHTML = [null, 1, 2, 3, 4].map(t =>
    `<span class="tchip${tierFilter === t ? ' on' : ''}" data-t="${t === null ? '' : t}">${t === null ? 'All' : 'P' + t}</span>`
  ).join('');
  $('tierChips').querySelectorAll('.tchip').forEach(c => {
    c.onclick = () => { tierFilter = c.dataset.t === '' ? null : +c.dataset.t; renderTierChips(); renderSugg(); };
  });
}

function renderSugg() {
  const q = $('prodSearch').value.trim().toLowerCase();
  const box = $('suggBox');
  let ids = RECIPE_IDS.filter(id => PI.tier[id] >= 1);
  if (tierFilter != null) ids = ids.filter(id => PI.tier[id] === tierFilter);
  if (q) ids = ids.filter(id => PI.recipe[id].name.toLowerCase().includes(q));
  ids.sort((a, b) => PI.tier[a] - PI.tier[b] || PI.recipe[a].name.localeCompare(PI.recipe[b].name));
  if (!q && tierFilter == null) { box.style.display = 'none'; return; }
  box.innerHTML = ids.length
    ? ids.slice(0, 40).map(id => `<div class="s-row" data-id="${id}"><span>${esc(PI.recipe[id].name)}</span><span class="stier">P${PI.tier[id]}</span></div>`).join('')
    : '<div class="s-row"><span class="stier">no matching products</span></div>';
  box.style.display = 'block';
  box.querySelectorAll('.s-row[data-id]').forEach(r => { r.onclick = () => setTarget(+r.dataset.id); });
}

function renderBasket() {
  const wrap = $('prodChips'); if (!wrap) return;
  const ids = basketIds();
  wrap.innerHTML = ids.length
    ? ids.map(id =>
        `<span class="prodchip card">${esc(PI.recipe[id].name)} ×<input type="number" min="1" value="${basket[id] || 10}" data-id="${id}"><span class="chip-x" data-id="${id}">✕</span></span>`
      ).join('')
    : '<span class="chip-none">No products in the basket yet</span>';
  wrap.querySelectorAll('.chip-x').forEach(x => { x.onclick = () => removeProduct(x.dataset.id); });
  wrap.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      basket[inp.dataset.id] = Math.max(1, +inp.value || 10); saveBasket(); renderCapacity();
      if (selectedSystemId) renderLogistics();
    });
  });
}

// ── Chain tree ────────────────────────────────────────────────────────────────

function renderChain() {
  const wrap = $('chainTree');
  const ids = basketIds();
  if (!ids.length) { wrap.innerHTML = '<div class="empty" style="padding:14px">no product drafted</div>'; $('deskFoot').innerHTML = ''; return; }
  let html = '', footBits = [];
  ids.forEach((tid, pi_) => {
    const t = +tid, acc = bomExpand(t, 1), byTier = {};
    Object.keys(acc.steps).forEach(x => { (byTier[PI.tier[x]] = byTier[PI.tier[x]] || []).push(x); });
    if (ids.length > 1) html += `<div class="ct-prodhead">${esc(PI.recipe[t].name)} ×${basket[tid] || 10}</div>`;
    for (let tier = PI.tier[t]; tier >= 1; tier--) {
      const list = (byTier[tier] || []).sort((a, b) => acc.steps[b] - acc.steps[a]);
      if (!list.length) continue;
      html += `<div class="ct-tier"><div class="ct-tlabel">P${tier} — ${tier === PI.tier[t] ? 'TARGET' : 'INTERMEDIATE'}</div>` +
        list.map(x => `<div class="ct-node t${tier}"><span>${esc(PI.recipe[x].name)}</span><span class="q">${fmtQ(acc.steps[x])} / unit · ${fmtQ(acc.steps[x] * perHour(t))}/hr</span></div>`).join('') +
        `</div><div class="ct-conn"></div>`;
    }
    const p0list = Object.keys(acc.p0).sort((a, b) => acc.p0[b] - acc.p0[a]);
    html += `<div class="ct-tier"><div class="ct-tlabel">P0 — RAW EXTRACTION</div>` +
      p0list.map(x => `<div class="ct-node t0"><span>${esc(PI.names[x] || x)}</span><span class="q">${fmtQ(acc.p0[x])} / unit · ${fmtQ(acc.p0[x] * perHour(t))}/hr</span></div>`).join('') + `</div>`;
    if (pi_ < ids.length - 1) html += '<div class="ct-divider"></div>';
    const r = PI.recipe[t];
    footBits.push(`${esc(r.name)}: ${r.ct / 60} min cycle → ${r.out} units, <b>${fmtQ(perHour(t))}/hr</b> per factory line`);
  });
  wrap.innerHTML = html;
  $('deskFoot').innerHTML = footBits.join(' · ') + '. Quantities above are per factory line; basket × values are roster SHARES — supported lines are computed from chalked pilots below.';
}

// ── Planet coverage ───────────────────────────────────────────────────────────

function renderCoverage() {
  const wrap = $('covGrid');
  if (!basketIds().length) { wrap.innerHTML = '<div class="empty" style="padding:10px">draft a product first</div>'; return; }
  const p0s = basketP0();
  wrap.innerHTML = p0s.map(p => {
    const types = PI.p0pt[p] || [];
    return `<div class="cov card"><div class="pn">${esc(PI.names[p] || p)}</div><div class="pt">${types.map(t => `<i>${esc(PT_LONG[t] || t)}</i>`).join('')}</div></div>`;
  }).join('');
}

// ── Candidate system hunt (BFS over universe gate graph) ──────────────────────

let sysByName = null;
function buildNameIndex() {
  if (sysByName) return;
  sysByName = {};
  Object.keys(UNIVERSE.systems).forEach(id => { sysByName[UNIVERSE.systems[id][0].toLowerCase()] = id; });
}

function secBandOk(sec, band) {
  if (band === 'any') return true;
  if (band === 'hi')  return sec >= 0.45;
  if (band === 'lo')  return sec > 0.0 && sec < 0.45;
  return sec <= 0.0;
}
function coversP0(sysRow, p0) { const counts = sysRow[5] || {}; return (PI.p0pt[p0] || []).some(t => (counts[t] || 0) > 0); }
function matchingPlanets(sysRow, p0s) { const counts = sysRow[5] || {}, need = new Set(); p0s.forEach(p => (PI.p0pt[p] || []).forEach(t => need.add(t))); let n = 0; need.forEach(t => n += counts[t] || 0); return n; }

function hunt() {
  buildNameIndex();
  const out = $('huntOut');
  if (!basketIds().length) { out.innerHTML = '<div class="empty" style="padding:12px">draft a product first</div>'; return; }
  const homeName = $('homeSys').value.trim().toLowerCase();
  const homeId   = sysByName[homeName];
  if (!homeId) { out.innerHTML = '<div class="empty" style="padding:12px">home system not recognised — check the spelling</div>'; return; }
  const maxJ = Math.max(0, Math.min(12, +$('maxJumps').value || 5));
  const band  = $('secBand').value, whole = $('wholeChain').checked;
  const p0s   = basketP0().map(Number);
  const dist  = {}; dist[homeId] = 0; let frontier = [homeId];
  for (let d = 1; d <= maxJ; d++) {
    const next = [];
    frontier.forEach(id => (UNIVERSE.systems[id][6] || []).forEach(nb => {
      if (dist[String(nb)] === undefined && UNIVERSE.systems[String(nb)]) { dist[String(nb)] = d; next.push(String(nb)); }
    }));
    frontier = next; if (!next.length) break;
  }
  const rows = [];
  Object.keys(dist).forEach(id => {
    const s = UNIVERSE.systems[id]; if (!secBandOk(s[1], band)) return;
    const covered = p0s.filter(p => coversP0(s, p));
    if (whole && covered.length < p0s.length) return;
    if (!covered.length) return;
    rows.push({ id, name: s[0], sec: s[1], region: UNIVERSE.regions[s[2]] || '', jumps: dist[id], covered: covered.length, planets: matchingPlanets(s, p0s), counts: s[5] || {} });
  });
  rows.sort((a, b) => b.covered - a.covered || a.jumps - b.jumps || b.planets - a.planets);
  lastHunt = { rows, p0s, homeId, dist: bfsFull(homeId) };
  $('mapPanel').classList.add('on');
  mapZoom = 1; mapPanX = 0; mapPanY = 0;
  requestAnimationFrame(renderUniverseMap);
  if (!rows.length) {
    out.innerHTML = `<div class="empty" style="padding:12px">no systems within ${maxJ} jumps cover ${whole ? 'the whole basket' : 'any of the basket'} — widen the hunt, drop the whole-chain requirement, or plan a split</div>`;
    renderCandStrip([]); return;
  }
  out.innerHTML = `<div class="miss" style="padding:8px 2px">${rows.length} candidate system${rows.length === 1 ? '' : 's'} lit on the map — pick one to plan its colony logistics</div>`;
  renderCandStrip(rows);
}

function renderCandStrip(rows) {
  const strip = $('candStrip'); if (!strip) return;
  const p0n = lastHunt ? lastHunt.p0s.length : 0;
  if (!rows.length) { strip.innerHTML = '<div class="cs-h">CANDIDATES</div><div class="cm" style="font-size:9px;padding:4px 2px">none in range</div>'; return; }
  strip.innerHTML = `<div class="cs-h">CANDIDATES — TOP ${Math.min(rows.length, 25)}</div>` +
    rows.slice(0, 25).map(r => {
      const full = r.covered === p0n;
      const missing = full ? '' : lastHunt.p0s.filter(p => !coversP0(UNIVERSE.systems[r.id], +p)).map(p => PI.names[p] || p).join(', ');
      return `<div class="cand-row card${String(r.id) === String(selectedSystemId) ? ' on' : ''}" data-id="${r.id}">` +
        `<div class="cn"><span>${full ? '✓ ' : ''}${esc(r.name)}</span><span class="sec-${r.sec >= 0.45 ? 'hi' : r.sec > 0 ? 'lo' : 'nu'}">${r.sec.toFixed(1)}</span></div>` +
        `<div class="cm">${r.covered}/${p0n} · ${r.jumps}j · ${esc(r.region)}${missing ? '<br>missing: ' + esc(missing) : ''}</div></div>`;
    }).join('');
  strip.querySelectorAll('.cand-row').forEach(el => { el.onclick = ev => { ev.stopPropagation(); selectSystem(el.dataset.id); }; });
}

$('huntBtn').onclick = hunt;

// ── Universe map ──────────────────────────────────────────────────────────────

let _bounds = null;
function universeBounds() {
  if (_bounds) return _bounds;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id in UNIVERSE.systems) { const s = UNIVERSE.systems[id]; if (s[3] < minX) minX = s[3]; if (s[3] > maxX) maxX = s[3]; if (s[4] < minY) minY = s[4]; if (s[4] > maxY) maxY = s[4]; }
  _bounds = { minX, minY, spanX: maxX - minX || 1, spanY: maxY - minY || 1 }; return _bounds;
}
function themeCol(v, fb) { try { const c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return c || fb; } catch { return fb; } }

function renderUniverseMap() {
  const canvas = $('uniCanvas'); if (!canvas || !$('mapPanel').classList.contains('on')) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const INK = {
    gate: themeCol('--map-gate', 'rgba(184,216,106,.07)'), star: themeCol('--map-star', 'rgba(184,200,160,.35)'),
    full: themeCol('--map-full', '#e0f0c0'), part: themeCol('--map-part', '#d8a24a'),
    home: themeCol('--map-home', '#7ab8c8'), sel: themeCol('--map-sel', '#b8d86a'),
  };
  const b = universeBounds(), PAD = 0.06;
  const usableW = rect.width * (1 - 2 * PAD), usableH = rect.height * (1 - 2 * PAD);
  const ox = rect.width * PAD, oy = rect.height * PAD;
  const project = s => {
    const px = ox + ((s[3] - b.minX) / b.spanX) * usableW;
    const py = oy + (1 - (s[4] - b.minY) / b.spanY) * usableH;
    return [(px - rect.width / 2) * mapZoom + rect.width / 2 + mapPanX, (py - rect.height / 2) * mapZoom + rect.height / 2 + mapPanY];
  };
  const SYS = UNIVERSE.systems;
  ctx.strokeStyle = INK.gate; ctx.lineWidth = 0.5; ctx.beginPath();
  for (const id in SYS) { const s = SYS[id], gates = s[6]; if (!gates || !gates.length) continue; const [px, py] = project(s); for (const gid of gates) { if (gid <= +id) continue; const t = SYS[String(gid)]; if (!t) continue; const [tx, ty] = project(t); ctx.moveTo(px, py); ctx.lineTo(tx, ty); } }
  ctx.stroke();
  _pts = []; ctx.fillStyle = INK.star;
  for (const id in SYS) { const s = SYS[id], [px, py] = project(s); if (px < -20 || py < -20 || px > rect.width + 20 || py > rect.height + 20) continue; ctx.beginPath(); ctx.arc(px, py, 0.8, 0, 7); ctx.fill(); _pts.push({ x: px, y: py, id, sec: s[1], name: s[0] }); }
  if (lastHunt) {
    lastHunt.rows.slice(0, 60).forEach(r => { const s = SYS[r.id]; if (!s) return; const [px, py] = project(s); const full = r.covered === lastHunt.p0s.length, col = full ? INK.full : INK.part; ctx.beginPath(); ctx.arc(px, py, full ? 4.5 : 3, 0, 7); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; _pts.push({ x: px, y: py, id: r.id, sec: s[1], name: s[0], covered: r.covered, total: lastHunt.p0s.length, jumps: r.jumps, isResult: true }); });
    if (lastHunt.homeId && SYS[lastHunt.homeId]) { const [hx, hy] = project(SYS[lastHunt.homeId]); ctx.strokeStyle = INK.home; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.stroke(); }
  }
  if (selectedSystemId && SYS[selectedSystemId]) { const [sx, sy] = project(SYS[selectedSystemId]); ctx.strokeStyle = INK.sel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx - 13, sy); ctx.lineTo(sx - 7, sy); ctx.moveTo(sx + 7, sy); ctx.lineTo(sx + 13, sy); ctx.moveTo(sx, sy - 13); ctx.lineTo(sx, sy - 7); ctx.moveTo(sx, sy + 7); ctx.lineTo(sx, sy + 13); ctx.stroke(); }
}

// Map interaction
{
  const c = $('uniCanvas');
  c.addEventListener('mousemove', e => {
    const rect = c.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = 64;
    for (const p of _pts) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bestD) { bestD = d; best = p; } }
    const tip = $('uniTip');
    if (best) { tip.style.display = 'block'; tip.style.left = (mx + 16) + 'px'; tip.style.top = (my - 8) + 'px'; tip.innerHTML = esc(best.name) + '<br><span class="tipm">' + best.sec.toFixed(1) + ' sec' + (best.isResult ? ' · ' + best.covered + '/' + best.total + ' covered' + (best.jumps != null ? ' · ' + best.jumps + 'j' : '') : '') + '</span>'; }
    else tip.style.display = 'none';
  });
  c.addEventListener('mouseleave', () => { $('uniTip').style.display = 'none'; });
  window.addEventListener('resize', () => renderUniverseMap());
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = c.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2, factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.5, Math.min(30, mapZoom * factor));
    mapPanX = mx - cx - (newZoom / mapZoom) * (mx - cx - mapPanX);
    mapPanY = my - cy - (newZoom / mapZoom) * (my - cy - mapPanY);
    mapZoom = newZoom; renderUniverseMap();
  }, { passive: false });
  let dragging = false, lastX = 0, lastY = 0, dragMoved = 0;
  c.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; dragMoved = 0; c.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', e => { if (!dragging) return; mapPanX += e.clientX - lastX; mapPanY += e.clientY - lastY; dragMoved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; renderUniverseMap(); });
  window.addEventListener('mouseup', e => {
    if (!dragging) return; dragging = false; c.style.cursor = 'grab';
    if (dragMoved < 4) { const rect = c.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top; let best = null, bestD = 100; for (const p of _pts) { if (!p.isResult) continue; const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bestD) { bestD = d; best = p; } } if (best) selectSystem(String(best.id)); }
  });
}

// ── Chain trace / stage scoring ───────────────────────────────────────────────

function traceChain(t) { const stages = []; let cur = String(t); while (true) { stages.unshift(cur); const r = PI.recipe[cur]; if (!r || !r.in || !r.in.length) break; cur = String(r.in[0][0]); if (PI.p0pt[cur] && !PI.recipe[cur]) { stages.unshift(cur); break; } } return stages; }
function p0NeedsFor(prodId) { if (PI.p0pt[prodId] && !PI.recipe[prodId]) return [prodId]; return chainP0s(+prodId).map(String); }
function bfsFull(fromId) { const dist = {}; dist[fromId] = 0; let frontier = [fromId]; while (frontier.length) { const next = []; frontier.forEach(id => (UNIVERSE.systems[id][6] || []).forEach(nb => { const k = String(nb); if (dist[k] === undefined && UNIVERSE.systems[k]) { dist[k] = dist[id] + 1; next.push(k); } })); frontier = next; } return dist; }
function bestSystemFor(prodId, nearId, nearDist) { const need = p0NeedsFor(prodId); if (!need.length) return null; let best = null; for (const id in UNIVERSE.systems) { const have = UNIVERSE.systems[id][5]; if (!have) continue; const covered = need.filter(p => (PI.p0pt[p] || []).some(c => have[c])).length; if (covered === 0) continue; const jumps = nearDist ? (nearDist[id] === undefined ? Infinity : nearDist[id]) : null; if (!best || covered > best.covered || (covered === best.covered && (jumps ?? 1e9) < (best.jumps ?? 1e9))) best = { id, covered, total: need.length, jumps }; } return best; }

// ── Selection + logistics ─────────────────────────────────────────────────────

function selectSystem(id) {
  if (!basketIds().length) return;
  selectedSystemId = id;
  renderUniverseMap();
  if (lastHunt) renderCandStrip(lastHunt.rows);
  renderLogistics();
  $('logiDeck').classList.add('on');
  $('logiDeck').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

{
  const sel = $('haulShipSel'), cap = $('haulCapacityInput');
  sel.innerHTML = HAUL_SHIPS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = HAUL_SHIPS.some(s => s.id === haulShipId) ? haulShipId : 'epithal';
  cap.value = haulCapacity;
  sel.addEventListener('change', () => {
    haulShipId = sel.value; try { localStorage.setItem('pi_haul_ship', haulShipId); } catch {}
    const ship = HAUL_SHIPS.find(s => s.id === haulShipId);
    if (ship) { haulCapacity = ship.hold; cap.value = haulCapacity; try { localStorage.setItem('pi_haul_capacity', haulCapacity); } catch {} }
    renderLogistics();
  });
  cap.addEventListener('input', () => { haulCapacity = +cap.value || 1; try { localStorage.setItem('pi_haul_capacity', haulCapacity); } catch {} renderLogistics(); });
}

function renderLogistics() {
  if (!selectedSystemId || !basketIds().length) return;
  const SYS = UNIVERSE.systems, selSys = SYS[selectedSystemId];
  $('logiSysName').textContent = selSys[0];
  $('logiSysCard').innerHTML = esc(selSys[0]) + ' · ' + selSys[1].toFixed(1) + ' · ' + esc(UNIVERSE.regions[selSys[2]] || '');
  const nearDist = bfsFull(selectedSystemId), homeDist = lastHunt ? lastHunt.dist : null;
  const routeStops = new Map(); let totalTripsAll = 0;
  const unionP0 = basketP0(), targets = basketIds();
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  let flowHtml = '', haulHtml = '';
  targets.forEach(tid => {
    const t = +tid, qty = basket[tid] || 10, stages = traceChain(t);
    const picks = stages.map((s, i) => {
      if (i === stages.length - 1) { const have = selSys[5] || {}; let covered = 0; unionP0.forEach(p => { if ((PI.p0pt[p] || []).some(c => have[c])) covered++; }); return { id: selectedSystemId, covered, total: unionP0.length || 1, jumps: homeDist ? (homeDist[selectedSystemId] ?? null) : null, anchored: true }; }
      const pick = bestSystemFor(s, selectedSystemId, nearDist);
      if (pick && homeDist) pick.jumps = homeDist[pick.id] ?? pick.jumps;
      return pick;
    });
    if (targets.length > 1) flowHtml += `<div class="ct-prodhead" style="margin-top:8px">${esc(PI.recipe[t].name)} ×${qty}</div>`;
    flowHtml += '<div class="stageflow">' + stages.map((s, i) => {
      const pick = picks[i], label = PI.p0pt[s] && !PI.recipe[s] ? (PI.names[s] || s) + ' (raw)' : PI.recipe[s].name;
      const card = `<div class="stagecard card${pick && pick.anchored ? ' anchored' : ''}"><div class="roman">STAGE ${ROMAN[i] || i + 1}${pick && pick.anchored ? ' · SELECTED' : ''}</div><div class="st-prod">${esc(label)}</div><div class="st-sys">${pick ? esc(SYS[pick.id][0]) : 'no system found'}</div>${pick ? `<div class="st-meta">${pick.covered}/${pick.total} planet types${pick.jumps != null && pick.jumps !== Infinity ? ' · ' + pick.jumps + 'j from home' : ''}</div>` : ''}</div>`;
      if (pick) routeStops.set(pick.id, { sysName: SYS[pick.id][0], jumps: pick.jumps !== Infinity ? pick.jumps : null });
      return card + (i < stages.length - 1 ? '<div class="stagelink">→</div>' : '');
    }).join('') + '</div>';
    let rows = '';
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i], b = stages[i + 1], ra = PI.recipe[a], rb = PI.recipe[b];
      const ctA = ra ? ra.ct : 1800, ctB = rb ? rb.ct : 1800, cadence = Math.max(ctA, ctB);
      const qtyPerCadence = ra ? ra.out * Math.max(1, cadence / ctA) : 1;
      const tierForVol = PI.tier[a] != null ? PI.tier[a] : (PI.tier[b] != null ? PI.tier[b] : 1);
      const volPerUnit = PI_VOL[a] != null ? PI_VOL[a] : (REF_VOLUME_BY_TIER[tierForVol] != null ? REF_VOLUME_BY_TIER[tierForVol] : 6);
      const totalM3 = qtyPerCadence * volPerUnit, trips = Math.max(1, Math.ceil(totalM3 / haulCapacity));
      totalTripsAll += trips;
      rows += `<div class="buf-row card"><span>${ROMAN[i]} → ${ROMAN[i + 1]}</span><span><b>${fmtHrs(cadence)}</b> haul cadence · ${PI.p0pt[a] && !PI.recipe[a] ? 'raw' : esc(PI.recipe[a].name)} → ${esc(PI.recipe[b] ? PI.recipe[b].name : b)}, matched to the slower stage's cycle · ~${Math.round(totalM3).toLocaleString()} m³ ≈ <b>${trips}</b> trip${trips === 1 ? '' : 's'}</span></div>`;
    }
    haulHtml += (targets.length > 1 ? `<div class="ct-prodhead" style="margin:8px 0 2px">${esc(PI.recipe[t].name)}</div>` : '') + (rows || '<div class="buf-row card"><span>Single-stage chain — no hauls needed.</span></div>');
  });
  $('stageFlow').innerHTML = flowHtml;
  const capSt = capacityState();
  let expHtml = '';
  if (capSt) {
    const rowsE = capSt.prods.filter(p => isFinite(p.lines) && p.lines > 0).map(p => {
      const perDay = p.rate * 24, vol = PI_VOL[p.t] != null ? PI_VOL[p.t] : (REF_VOLUME_BY_TIER[PI.tier[p.t]] != null ? REF_VOLUME_BY_TIER[PI.tier[p.t]] : 6);
      const m3 = perDay * vol, trips = Math.max(1, Math.ceil(m3 / haulCapacity));
      return `<div class="buf-row card"><span>EXPORT</span><span><b>${esc(p.name)}</b> · ${fmtInt(Math.round(perDay))} units/day ≈ <b>${fmtInt(Math.round(m3))} m³/day</b> ≈ <b>${trips}</b> export trip${trips === 1 ? '' : 's'}/day to home station</span></div>`;
    }).join('');
    if (rowsE) expHtml = '<div class="ct-prodhead" style="margin:8px 0 2px">EXPORT VOLUME — from chalked roster</div>' + rowsE;
  }
  $('haulRows').innerHTML = haulHtml + expHtml;
  const shipObj = HAUL_SHIPS.find(s => s.id === haulShipId);
  $('haulShipLbl').textContent = 'ROUTE OPTIMISER — ' + (shipObj ? shipObj.name : 'custom hauler') + ', ' + haulCapacity.toLocaleString() + ' m³';
  const stops = [...routeStops.values()].sort((x, y) => (x.jumps ?? 1e9) - (y.jumps ?? 1e9));
  $('logiRoute').innerHTML = stops.map((s, i) =>
    `<div class="route-row"><span><span class="stop-idx">${i + 1}.</span><span class="stop-name">${esc(s.sysName)}</span></span><span>${s.jumps != null ? s.jumps + ' jumps from home' : 'jumps unknown'}</span></div>`
  ).join('') + `<div class="route-summary">Nearest-first route across ${stops.length} system${stops.length === 1 ? '' : 's'} · ~${totalTripsAll} total trip${totalTripsAll === 1 ? '' : 's'} to clear every haul stage across the whole basket at current cadence.</div>`;
  reportDashboard(MY_SECTION, targets.map(i => PI.recipe[i].name).join(' + ') + ' → ' + selSys[0] + ' · ' + stops.length + ' stops', 'ok');
}

// ── Pilot chalkboard ──────────────────────────────────────────────────────────

function renderRoles() {
  const row = $('roleRow'), ids = visibleIds(MY_SECTION);
  if (!ids.length) { row.innerHTML = '<div class="empty" style="padding:10px">no pilots on the roster — sign in via the Toolset menu</div>'; $('roleSum').textContent = ''; return; }
  row.innerHTML = ids.map(id => {
    const nm = (chars[id] && chars[id].charName) || ('Pilot ' + id), r = roles[id] || '—';
    return `<div class="rolepill card" data-id="${id}"><span>${esc(nm)}</span><span class="r r-${ROLES.indexOf(r)}">${esc(r)}</span></div>`;
  }).join('');
  const counts = {}; ids.forEach(id => { const r = roles[id] || '—'; counts[r] = (counts[r] || 0) + 1; });
  $('roleSum').textContent = 'Chalked: ' + ROLES.slice(1).map(r => (counts[r] || 0) + ' ' + r.toLowerCase()).join(' · ') + ((counts['—'] || 0) ? ' · ' + counts['—'] + ' unassigned' : '');
}

function closeRoleMenus() { document.querySelectorAll('.rolemenu').forEach(m => m.remove()); }
function openRoleMenu(pill, id) {
  closeRoleMenus();
  const rect = pill.getBoundingClientRect();
  const m = document.createElement('div'); m.className = 'rolemenu'; m.dataset.for = id;
  m.style.cssText = `position:fixed;z-index:9999;left:${Math.round(rect.left)}px;top:${Math.round(rect.bottom + 4)}px;min-width:${Math.max(130, Math.round(rect.width))}px`;
  m.innerHTML = ROLES.map(r => `<div class="ropt" data-r="${r}">${r}</div>`).join('');
  m.addEventListener('click', ev => {
    const opt = ev.target.closest('.ropt');
    if (opt) { roles[id] = opt.dataset.r; try { localStorage.setItem(ROLE_KEY, JSON.stringify(roles)); } catch {} closeRoleMenus(); renderRoles(); renderCapacity(); if (selectedSystemId) renderLogistics(); }
    ev.stopPropagation();
  });
  document.body.appendChild(m);
}

$('roleRow').addEventListener('click', ev => { const pill = ev.target.closest('.rolepill'); if (pill) { const open = document.querySelector(`.rolemenu[data-for="${pill.dataset.id}"]`); if (open) closeRoleMenus(); else openRoleMenu(pill, pill.dataset.id); ev.stopPropagation(); } });
document.addEventListener('click', closeRoleMenus);
window.addEventListener('scroll', closeRoleMenus, { passive: true });
window.addEventListener('resize', closeRoleMenus);

// ── Roster capacity engine ────────────────────────────────────────────────────

function extractRate() { const v = +(localStorage.getItem(EXTRACT_RATE_KEY) || ''); return v > 0 ? v : EXTRACTOR_P0_HR_DEFAULT; }
function saveCapOvr() { try { localStorage.setItem(CAP_OVR_KEY, JSON.stringify(capOvr)); } catch {} }

async function ensureSkillNames(ids) {
  const need = ids.filter(i => !_nameCache[i]);
  for (let i = 0; i < need.length; i += 900) {
    try { (await esiPost('/universe/names/', need.slice(i, i + 900).map(Number))).forEach(n => { _nameCache[n.id] = { n: n.name, c: 'inventoryType' }; }); } catch {}
  }
  _saveNameCache();
}

async function loadPiSkills() {
  const lim = pLimit(3); let changed = false;
  await Promise.all(visibleIds(MY_SECTION).map(id => lim(async () => {
    const c = piSkills[id];
    if (c && c.ts && Date.now() - c.ts < 43_200_000) return;
    const tok = await getTok(id);
    if (!tok) { piSkills[id] = { err: 'no token', ts: Date.now() }; changed = true; return; }
    try {
      const sk = await esiGet('/characters/' + id + '/skills/', tok.access);
      const list = (sk && sk.skills) || [];
      await ensureSkillNames(list.map(s => s.skill_id));
      const lvl = nm => { const f = list.find(s => _nameCache[s.skill_id] && _nameCache[s.skill_id].n === nm); return f ? (f.active_skill_level != null ? f.active_skill_level : f.trained_skill_level) || 0 : 0; };
      piSkills[id] = { ic: lvl('Interplanetary Consolidation'), ccu: lvl('Command Center Upgrades'), adv: lvl('Advanced Planetology'), ts: Date.now() };
    } catch (e) { piSkills[id] = { err: e.status === 403 ? 'no skills scope — remove & re-add pilot' : 'ESI ' + (e.status || 'error'), ts: Date.now() }; }
    changed = true;
  })));
  if (changed) { try { localStorage.setItem(SKILL_CACHE_KEY, JSON.stringify(piSkills)); } catch {} }
  return changed;
}

function pilotCap(id) {
  const s = piSkills[id] || {}, o = capOvr[id] || {}, known = s.ts && !s.err;
  const planets = o.planets != null ? o.planets : (known ? 1 + (s.ic || 0) : 6);
  const slots   = o.slots   != null ? o.slots   : SLOTS_BY_CCU[Math.min(5, known ? (s.ccu || 0) : 5)];
  return { planets, slots, known, err: s.err, adv: s.adv || 0 };
}

function chainNeeds(t) {
  const acc = bomExpand(t, 1), ph = perHour(t);
  let slots = 0; Object.keys(acc.steps).forEach(x => { const h = perHour(+x); if (h > 0) slots += acc.steps[x] * ph / h; });
  let p0 = 0; Object.keys(acc.p0).forEach(x => { p0 += acc.p0[x] * ph; });
  return { slots: Math.max(slots, 1), p0, ph };
}

function capacityState() {
  const ids = basketIds(); if (!ids.length) return null;
  const rate = extractRate();
  let fSlots = 0, ePlanets = 0, fullPlanets = 0; const pilots = [];
  visibleIds(MY_SECTION).forEach(id => {
    const r = roles[id], c = pilotCap(id);
    if (r === 'Factory') fSlots += c.planets * c.slots;
    else if (r === 'Extractor') ePlanets += c.planets;
    else if (r === 'Full chain') fullPlanets += c.planets;
    pilots.push({ id, nm: (chars[id] && chars[id].charName) || ('Pilot ' + id), r: r || '—', c });
  });
  const wSum = ids.reduce((a, i) => a + (+basket[i] || 1), 0) || 1;
  const prods = ids.map(tid => {
    const t = +tid, need = chainNeeds(t), share = (+basket[tid] || 1) / wSum;
    const fLines = need.slots > 0 ? share * fSlots / need.slots : 0;
    const eLines = need.p0 > 0 ? share * ePlanets * rate / need.p0 : Infinity;
    const ppl = need.slots / SLOTS_BY_CCU[5] + need.p0 / rate;
    const fullLines = ppl > 0 ? share * fullPlanets / ppl : 0;
    const lines = Math.min(fLines, eLines) + fullLines;
    const bound = fLines <= eLines ? 'factory' : 'extraction';
    const util = (fLines && eLines && isFinite(eLines)) ? Math.round(100 * Math.min(fLines, eLines) / Math.max(fLines, eLines)) : null;
    return { t, name: PI.recipe[t].name, share, lines, rate: lines * need.ph, bound, util, need };
  });
  return { prods, pilots, rate, fSlots, ePlanets, fullPlanets };
}

function renderCapacity() {
  const band = $('capBand'); if (!band) return;
  const st = capacityState(); if (!st) { band.style.display = 'none'; return; }
  band.style.display = '';
  const rows = st.prods.map(p =>
    `<div class="cb-row"><span class="cb-big">${esc(p.name)} ${p.lines > 0 && isFinite(p.lines) ? (Math.round(p.rate * 10) / 10) + ' / hr' : '—'}</span>` +
    (p.lines > 0 && isFinite(p.lines)
      ? `<span class="cb-sub">${fmtInt(Math.round(p.rate * 24))} / day · ${fmtInt(Math.round(p.rate * 168))} / week</span><span class="cb-chip">${p.bound}-bound${p.util != null ? ' · other side at ' + p.util + '%' : ''}</span><span class="cb-sub">${Math.round(p.lines * 10) / 10} lines · share ${Math.round(p.share * 100)}%</span>`
      : `<span class="cb-sub">chalk pilots below to compute throughput</span>`) + `</div>`
  ).join('');
  const pl = st.pilots.map(p => {
    const c = p.c; let contrib = '';
    if (p.r === 'Factory') contrib = '→ ' + (c.planets * c.slots) + ' slots';
    else if (p.r === 'Extractor') contrib = '→ ' + fmtInt(c.planets * st.rate) + ' P0/hr';
    else if (p.r === 'Full chain') contrib = '→ self-sufficient lines';
    return `<span class="cb-pline" data-id="${p.id}" style="cursor:pointer" title="click to override planets/slots">${esc(p.nm)} · ${esc(p.r)}` +
      (c.known ? ` · IC ${roman(Math.max(0, c.planets - 1))} → ${c.planets} planets · ${c.slots} slots/planet` : ` · ${c.err ? esc(c.err) + ' — using defaults' : 'skills loading…'}`) +
      (contrib ? ' ' + contrib : '') + `</span>`;
  }).join('<br>');
  band.innerHTML = `<div class="cb-rows">${rows}</div>` +
    `<div class="cb-note cb-rate">extractors at full heads, max output · avg <input type="number" min="1" id="extRate" value="${st.rate}"> P0/hr per extractor planet (reference — override to match your colonies)</div>` +
    `<div class="cb-pilots">${pl}</div>`;
  const inp = $('extRate');
  if (inp) inp.addEventListener('change', () => { try { localStorage.setItem(EXTRACT_RATE_KEY, String(Math.max(1, +inp.value || EXTRACTOR_P0_HR_DEFAULT))); } catch {} renderCapacity(); if (selectedSystemId) renderLogistics(); });
  band.querySelectorAll('.cb-pline').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id, c = pilotCap(id);
      const p = prompt('Planets committed to this draft for this pilot:', c.planets); if (p == null) return;
      const s = prompt('Factory slots per planet (reference — adjust to your builds):', c.slots); if (s == null) return;
      capOvr[id] = { planets: Math.max(0, +p || 0), slots: Math.max(1, +s || c.slots) }; saveCapOvr(); renderCapacity(); if (selectedSystemId) renderLogistics();
    };
  });
}

// ── What to make — profit ranking ─────────────────────────────────────────────

function fmtIsk(n) { if (n == null) return '—'; if (!n) return '0'; const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(2) + 'b'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'm'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return Math.round(n).toString(); }
function hubName(st) { const h = HUBS.find(h => h[1] === st); return h ? h[0] : 'hub'; }
function mk_px(st, t) { return mk_priceCache[st + ':' + t]; }
function mk_bom(targetId, units) { const consume = {}; (function req(t, qty) { consume[t] = (consume[t] || 0) + qty; const r = PI.recipe[t]; if (!r) return; const cycles = Math.ceil(qty / r.out); r.in.forEach(([x, q]) => req(String(x), cycles * q)); })(String(targetId), units); return consume; }
function mk_chainTypeIds(t) { return [...new Set(Object.keys(mk_bom(t, 1)))]; }
async function mk_fetchPrices(station, ids) {
  const miss = ids.filter(t => mk_priceCache[station + ':' + t] === undefined); if (!miss.length) return;
  try { const r = await fetch(`https://market.fuzzwork.co.uk/aggregates/?station=${station}&types=${miss.join(',')}`); if (!r.ok) throw 0; const j = await r.json(); miss.forEach(t => { const d = j[t] || {}; mk_priceCache[station + ':' + t] = { sell: d.sell ? +d.sell.min : 0, buy: d.buy ? +d.buy.max : 0 }; }); }
  catch { miss.forEach(t => { if (mk_priceCache[station + ':' + t] === undefined) mk_priceCache[station + ':' + t] = null; }); }
}
function mk_feeRates() { const salesTax = 0.075, broker = 0.03, total = salesTax + (mk_sellMode === 'sell' ? broker : 0); return { salesTax, broker, total }; }
function mk_prodPlanetTypes(o) { const c = mk_bom(o, 1), codes = new Set(); Object.keys(c).forEach(t => { const pt = PI.p0pt[t]; if (pt) pt.forEach(x => codes.add(x)); }); return codes; }
function mk_chainTreeHtml(o) { const tcol = ['#9fb0bc','#7ab8c8','#8cc86a','#d8a24a','#e8d296']; let h = ''; (function walk(t, qty, depth) { const r = PI.recipe[t], tier = PI.tier[t] || 0, nm = (r && r.name) || PI.names[t] || ('type ' + t); const q = Math.round(qty).toLocaleString(); h += `<div class="node" style="padding-left:${depth*18}px"><span style="color:${tcol[tier]||'#9fb0bc'};font-weight:600">P${tier}</span> ${depth ? '└ ' : ''}${nm} <span class="hint">×${q}${r ? '' : ' <span style="color:var(--muted2)">(raw)</span>'}</span></div>`; if (r) { const cyc = Math.ceil(qty / r.out); r.in.forEach(([x, qq]) => walk(String(x), cyc * qq, depth + 1)); } })(String(o), 1, 0); return h; }
function mk_unitEconomics(prod, st) { const r = PI.recipe[prod]; if (!r) return null; const p = mk_px(st, prod); if (!p) return null; const consume = mk_bom(prod, r.out); const p1 = Object.keys(consume).filter(t => PI.tier[t] === 1), p0k = Object.keys(consume).filter(t => PI.p0pt[t]); let costP1 = 0, okP1 = true; p1.forEach(t => { const q = Math.ceil(consume[t]); const pp = mk_px(st, t); if (pp) costP1 += q * pp.sell; else okP1 = false; }); let costP0 = 0, okP0 = true; p0k.forEach(t => { const q = Math.ceil(consume[t]); const pp = mk_px(st, t); if (pp) costP0 += q * pp.sell; else okP0 = false; }); return { rev: r.out * p.buy, costP1: okP1 ? costP1 : null, costP0: okP0 ? costP0 : null, out: r.out, ct: r.ct }; }

async function renderMake() {
  const panel = $('makePanel'); if (!panel) return;
  if (!mk_panelVisible) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const tog = $('makeToggle'); if (tog) { tog.style.borderColor = mk_panelVisible ? 'var(--gold-dim)' : 'var(--line2)'; tog.style.color = mk_panelVisible ? 'var(--gold-bright)' : 'var(--muted)'; tog.style.background = mk_panelVisible ? 'rgba(201,168,104,.12)' : 'transparent'; }
  const prods = Object.keys(PI.recipe).filter(o => PI.tier[o] === mk_makeTier);
  const idset = new Set(); prods.forEach(o => mk_chainTypeIds(o).forEach(t => idset.add(t)));
  const basis = mk_buyP1 ? 'P1' : (mk_buyP0 ? 'P0' : 'extract');
  const basisLbl = basis === 'P1' ? 'Buy P1 inputs' : basis === 'P0' ? 'Buy raw P0' : 'Self-extract (no input cost)';
  const inHdr = basis === 'P1' ? 'P1 cost/u' : basis === 'P0' ? 'P0 cost/u' : 'inputs/u';
  const fees = mk_feeRates(), feeMul = 1 - fees.total;
  const tierSel = `<select id="mkTier" style="font-size:11px;padding:2px 4px">${[1,2,3,4].map(t=>`<option value="${t}" ${t===mk_makeTier?'selected':''}>P${t}</option>`).join('')}</select>`;
  const hubSel = `<select id="mkHub" style="font-size:11px;padding:2px 4px">${HUBS.map(([nm,st])=>`<option value="${st}" ${st===mk_buyHub?'selected':''}>${nm}</option>`).join('')}</select>`;
  const modeSel = `<select id="mkSellMode" style="font-size:11px;padding:2px 4px"><option value="buy" ${mk_sellMode==='buy'?'selected':''}>sell to buy orders</option><option value="sell" ${mk_sellMode==='sell'?'selected':''}>list on sell orders</option></select>`;
  $('mkControls').innerHTML = `Tier ${tierSel} &nbsp; Hub ${hubSel} &nbsp; ${modeSel} &nbsp;<label style="cursor:pointer;font-size:11px"><input type="checkbox" id="mkP0" ${mk_buyP0?'checked':''}> Buy P0</label><label style="cursor:pointer;font-size:11px"><input type="checkbox" id="mkP1" ${mk_buyP1?'checked':''}> Buy P1</label><span id="mkReload" style="cursor:pointer;color:var(--cyan);font-size:11px">↻ load prices</span>${mk_pricesLoading?'<span class="hint">loading…</span>':''}`;
  const chips = Object.keys(UNIVERSE.planetTypes).map(c=>`<span class="ptchip ${mk_mkPTFilter.has(c)?'on':''}" data-pt="${c}" title="${UNIVERSE.planetTypes[c]}" style="cursor:pointer;padding:2px 7px;border:1px solid ${mk_mkPTFilter.has(c)?'var(--gold-dim)':'var(--line2)'};border-radius:3px;font-size:9.5px;background:${mk_mkPTFilter.has(c)?'rgba(201,168,104,.12)':'transparent'}"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PT_COLOR[c]||'#888'};vertical-align:middle;margin-right:3px"></i>${c}</span>`).join('');
  const clr = mk_mkPTFilter.size ? `<span id="mkPTclear" style="cursor:pointer;color:var(--cyan);font-size:10px">✕ clear</span>` : '';
  $('mkChipRow').innerHTML = `<span class="hint" style="font-size:10px;color:var(--muted2)">Planet filter:</span>${chips}${clr}<label style="cursor:pointer;font-size:10px;margin-left:auto"><input type="checkbox" id="mkCB" ${mk_cbPalette?'checked':''}> Color-blind</label>`;
  $('mkBasisNote').innerHTML = `Cost basis: <b style="color:var(--gold-bright)">${basisLbl}</b> · revenue net of fees (<b style="color:var(--amber)">${(fees.total*100).toFixed(1)}%</b>) via ${mk_sellMode==='sell'?'sell orders':'buy orders'} at ${hubName(mk_buyHub)}. Ranked by profit per facility-hour.`;
  $('mkTier').onchange = e => { mk_makeTier = +e.target.value; renderMake(); };
  $('mkHub').onchange  = e => { mk_buyHub   = +e.target.value; localStorage.setItem('pi_hub', mk_buyHub); renderMake(); };
  $('mkSellMode').onchange = e => { mk_sellMode = e.target.value; localStorage.setItem('pi_sellmode', mk_sellMode); renderMake(); };
  $('mkP0').onchange = e => { mk_buyP0 = e.target.checked; localStorage.setItem('pi_bp0', mk_buyP0?'1':'0'); renderMake(); };
  $('mkP1').onchange = e => { mk_buyP1 = e.target.checked; localStorage.setItem('pi_bp1', mk_buyP1?'1':'0'); renderMake(); };
  $('mkReload').onclick = async () => { mk_pricesLoading = true; renderMake(); await mk_fetchPrices(mk_buyHub, [...idset]); mk_pricesLoading = false; renderMake(); };
  { const el = $('mkPTclear'); if (el) el.onclick = () => { mk_mkPTFilter.clear(); renderMake(); }; }
  $('mkChipRow').querySelectorAll('.ptchip[data-pt]').forEach(ch => ch.onclick = () => { const c = ch.dataset.pt; mk_mkPTFilter.has(c) ? mk_mkPTFilter.delete(c) : mk_mkPTFilter.add(c); renderMake(); });
  { const el = $('mkCB'); if (el) el.onchange = e => { mk_cbPalette = e.target.checked; localStorage.setItem('pi_cb', mk_cbPalette?'1':'0'); document.body.classList.toggle('cb', mk_cbPalette); renderMake(); }; }
  let rows = prods.map(o => { const e = mk_unitEconomics(o, mk_buyHub); if (!e) return { o, na: true }; const rev = e.rev * feeMul; const inCost = basis === 'P1' ? e.costP1 : basis === 'P0' ? e.costP0 : 0; const profitRun = inCost != null ? rev - inCost : null; const perHrFac = profitRun != null ? profitRun * (3600 / e.ct) : null; const margin = (inCost != null && rev > 0) ? (rev - inCost) / rev : null; const outN = PI.recipe[o].out; return { o, profitRun, perHrFac, margin, rev, inCost, revU: rev ? rev / outN : null, inU: inCost != null ? inCost / outN : null }; }).filter(r => !r.na);
  if (mk_mkPTFilter.size) rows = rows.filter(r => { const c = mk_bom(r.o, 1); return Object.keys(c).filter(t => PI.p0pt[t]).every(t => PI.p0pt[t].some(code => mk_mkPTFilter.has(code))); });
  const kf = { name: r => PI.recipe[r.o].name, rev: r => r.revU ?? -1e30, inCost: r => r.inU ?? 1e30, perHrFac: r => r.perHrFac ?? -1e30, margin: r => r.margin ?? -1e30 }[mk_mkSort.key] || (r => r.perHrFac ?? -1e30);
  rows.sort((a, b) => { const va = kf(a), vb = kf(b); if (typeof va === 'string') return mk_mkSort.dir * va.localeCompare(vb); return mk_mkSort.dir * ((va > vb) ? 1 : (va < vb) ? -1 : 0); });
  const maxHeat = Math.max(1, ...rows.map(r => Math.abs(r.perHrFac) || 0));
  const body = rows.map(r => {
    const pf = r.perHrFac, col = pf == null ? 'var(--muted2)' : (pf >= 0 ? 'var(--green)' : 'var(--red)');
    const need = [...mk_prodPlanetTypes(r.o)].sort().map(c => `<span title="${UNIVERSE.planetTypes[c]}" style="display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:2px;font-size:8.5px;font-weight:700;color:#0a0d10;background:${PT_COLOR[c]||'#888'}">${c}</span>`).join(' ');
    const w = pf != null ? Math.round(Math.abs(pf) / maxHeat * 100) : 0, heat = pf != null ? `<span class="heatfill" style="width:${w}%;background:${pf>=0?'var(--green)':'var(--red)'}"></span>` : '';
    const open = mk_mkChain === r.o;
    const exp = `<span class="expander" data-x="${r.o}" title="show recipe chain">${open ? '▾' : '▸'}</span> `;
    let tr = `<tr class="row" data-o="${r.o}"><td>${exp}${PI.recipe[r.o].name}</td><td style="text-align:left">${need}</td><td class="mono" style="color:var(--cyan)">${r.rev ? fmtIsk(r.revU) : '—'}</td><td class="mono" style="color:var(--muted)">${r.inCost != null ? fmtIsk(r.inU) : (basis === 'extract' ? '0' : '—')}</td><td class="mono heat" style="color:${col};font-weight:600">${heat}<span style="position:relative">${pf != null ? fmtIsk(pf) : '—'}</span></td><td class="mono" style="color:${r.margin != null?(r.margin>=0?'var(--green)':'var(--red)'):'var(--muted2)'};">${r.margin != null ? (r.margin * 100).toFixed(0) + '%' : '—'}</td></tr>`;
    if (open) tr += `<tr><td colspan="6" style="padding:0"><div class="chaintree" style="padding:8px 14px">${mk_chainTreeHtml(r.o)}</div></td></tr>`;
    return tr;
  }).join('');
  const arrow = k => mk_mkSort.key === k ? (mk_mkSort.dir < 0 ? ' ▾' : ' ▴') : '';
  const th = (k, lbl, left) => `<th data-sort="${k}" style="${left?'text-align:left':'text-align:right'}">${lbl}${arrow(k)}</th>`;
  $('mkBody').innerHTML = `<table><thead><tr class="hint">${th('name','product',1)}${th('cover','planets',1)}${th('rev','sell/u')}${th('inCost',inHdr)}${th('perHrFac','ISK/fac·hr')}${th('margin','margin')}</tr></thead><tbody>${body || `<tr><td class="hint" colspan="6" style="padding:10px 14px">Click "↻ load prices" to rank ${prods.length} P${mk_makeTier} products.</td></tr>`}</tbody></table>`;
  $('mkBody').querySelectorAll('thead th').forEach(h => h.onclick = () => { const k = h.dataset.sort; if (mk_mkSort.key === k) mk_mkSort.dir *= -1; else mk_mkSort = { key: k, dir: k === 'name' ? 1 : -1 }; renderMake(); });
  $('mkBody').querySelectorAll('.expander').forEach(x => x.onclick = e => { e.stopPropagation(); mk_mkChain = mk_mkChain === x.dataset.x ? null : x.dataset.x; renderMake(); });
  $('mkBody').querySelectorAll('.row').forEach(tr => tr.onclick = () => addProduct(+tr.dataset.o));
  const haveAll = [...idset].every(t => mk_px(mk_buyHub, t) != null);
  if (!haveAll && !mk_pricesLoading) { mk_pricesLoading = true; renderMake(); await mk_fetchPrices(mk_buyHub, [...idset]); mk_pricesLoading = false; renderMake(); }
}

{ const tog = $('makeToggle'); if (tog) tog.onclick = () => { mk_panelVisible = !mk_panelVisible; renderMake(); }; }

// ── Live refresh (cross-tab + 60s timer) ──────────────────────────────────────

function liveRefresh() {
  chars = loadChars();
  try { roles = JSON.parse(localStorage.getItem(ROLE_KEY) || '{}') || {}; } catch {}
  try { piSkills = JSON.parse(localStorage.getItem(SKILL_CACHE_KEY) || '{}') || {}; } catch {}
  renderRoles(); renderCapacity();
  if (selectedSystemId) renderLogistics();
}

setInterval(() => { if (document.hidden) return; loadPiSkills().finally(liveRefresh); }, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) liveRefresh(); });

// ── Boot ──────────────────────────────────────────────────────────────────────

$('prodSearch').addEventListener('input', renderSugg);
$('prodSearch').addEventListener('focus', renderSugg);
window.onRosterChange = renderRoles;

$('homeSys').addEventListener('focus', () => {
  const dl = $('sysDatalist'); if (dl.dataset.full) return;
  buildNameIndex();
  dl.innerHTML = Object.keys(UNIVERSE.systems).map(id => `<option value="${esc(UNIVERSE.systems[id][0])}">`).join('');
  dl.dataset.full = '1';
});

renderPilots();
renderTierChips();
renderRoles();
renderBasket();
renderChain();
renderCoverage();
renderCapacity();
loadPiSkills().then(ch => { if (ch) renderCapacity(); });
reportDashboard(MY_SECTION, 'drafting table clear', 'muted');
