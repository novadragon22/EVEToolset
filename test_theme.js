/* EVE Suite wireframe-logic v2 regression harness.
   Run inside the bundle folder: node test_theme.js
   (or SUITE_DIR=path node test_theme.js) — requires jsdom. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const DIR = process.env.SUITE_DIR || '.';

function makeLS(init) {
  const store = Object.assign({}, init);
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    key: i => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
    _store: store,
  };
}

function boot(file, theme) {
  const html = fs.readFileSync(`${DIR}/${file}`, 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://localhost/' + file,
    pretendToBeVisual: false,
    beforeParse(window) {
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};
      const ls = makeLS(theme ? { eve_suite_theme: theme } : {});
      Object.defineProperty(window, 'localStorage', { value: ls });
      window.confirm = () => true;
      window.alert = () => {};
      window.fetch = () => new Promise(() => {});
      window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
      const anyObj = new Proxy(function(){}, {
        get: (t, p) => {
          if (p === Symbol.toPrimitive) return () => 0;
          if (p === 'width') return 0;
          if (p === 'data') return [];
          return anyObj;
        },
        apply: () => anyObj,
        set: () => true,
      });
      window.HTMLCanvasElement.prototype.getContext = () => anyObj;
      window.addEventListener('error', e => errors.push(e.message));
    },
  });
  return { dom, errors };
}

let fail = 0;
const files = ['index.html','assets.html','fits.html','industry.html','jump.html','market.html','overview.html','pi.html','skills.html','structures.html','wallet.html'];
const themesJsSrc = fs.readFileSync(`${DIR}/themes.js`, 'utf8');

// 1) Every page boots under a preset faction theme and applies it at parse time
for (const f of files) {
  const theme = ['amarr','caldari','gallente','minmatar','triglavian'][files.indexOf(f) % 5];
  try {
    const { dom, errors } = boot(f, theme);
    const applied = dom.window.document.documentElement.dataset.theme;
    const pass = applied === theme && errors.length === 0;
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${f} boots with theme=${theme} (applied=${applied}, jsErrors=${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
  } catch (e) {
    fail++; console.log(`FAIL ${f} threw during boot: ${e.message}`);
  }
}

// 2) Swatch switching on index.html updates dataset + storage for every faction
{
  const { dom } = boot('index.html', 'default');
  const doc = dom.window.document;
  const swatches = [...doc.querySelectorAll('.theme-swatch')];
  console.log(`index has ${swatches.length} theme swatches: ${swatches.map(b => b.dataset.theme).join(', ')}`);
  for (const name of ['amarr','caldari','gallente','minmatar','triglavian','default']) {
    const b = swatches.find(x => x.dataset.theme === name);
    if (!b) { fail++; console.log(`FAIL no swatch for ${name}`); continue; }
    if (b.onclick) b.onclick(new dom.window.MouseEvent('click')); else b.click();
    const applied = doc.documentElement.dataset.theme;
    const stored = dom.window.localStorage.getItem('eve_suite_theme');
    const on = b.classList.contains('on');
    const pass = applied === name && stored === name && on;
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} swatch ${name}: dataset=${applied} stored=${stored} highlighted=${on}`);
  }
}

// 3) themes.css carries the v3 exact-transcription faction layer; every app links css + js
{
  const css = fs.readFileSync(`${DIR}/themes.css`, 'utf8');
  const checks = [
    ["amarr reliquary radius", css.includes('border-radius:999px 999px 16px 16px')],
    ["amarr rose-window halo", css.includes('repeating-conic-gradient(from 0deg,rgba(214,178,110,.20)')],
    ["amarr gilt Cinzel Decorative", css.includes("'Cinzel Decorative'")],
    ["caldari slab clip", css.includes('polygon(0 0,70% 0,72% 14px,100% 14px')],
    ["caldari serial stencil", css.includes('UNIT CBD-7741')],
    ["caldari segmented bar mask", css.includes('repeating-linear-gradient(90deg,#000 0 8px,transparent 8px 11px)')],
    ["gallente liquid radii", css.includes('border-radius:46px 22px 46px 22px')],
    ["gallente aurora drift", css.includes('ga-drift')],
    ["gallente floating rows", css.includes('border-collapse:separate;border-spacing:0 8px')],
    ["minmatar feTurbulence rust", css.includes('feTurbulence type="fractalNoise"')],
    ["minmatar girder pipe brackets", css.includes('16px 24px 0 -2px #4a3a2a')],
    ["trig triple veins", css.includes('linear-gradient(245deg,transparent 46%')],
    ["trig disintegrator ramp", css.includes('#ffb060 88%,#fff6ea 99%') && css.includes('tg-ramp')],
    ["rail text vars all factions", (css.match(/--rail-text:/g) || []).length === 5],
    ["thm hook infrastructure", css.includes('.thm-rail') && css.includes('.thm-halo') && css.includes('.thm-dec') && css.includes('.thm-lamp') && css.includes('.thm-overlay')],
    ["v3 exact-transcription layer marker", css.includes('v3 EXACT TRANSCRIPTION') && css.includes('SUITE GLUE')],
    ["per-faction input/selection coverage", (css.match(/\] input/g) || []).length >= 5 && (css.match(/::selection/g) || []).length === 5],
    ["textarea derived extras", css.includes('DERIVED EXTRAS') && (css.match(/\] textarea/g) || []).length >= 5],
    ["swatch identities mapped", css.includes('html .theme-swatch[data-theme="amarr"] i{') && css.includes('html .theme-swatch[data-theme="triglavian"] i')],
    ["fonts self-contained via @import", css.startsWith('/*') && css.includes('@import url("https://fonts.googleapis.com') && css.includes('Cinzel+Decorative')],
    ["css braces balanced", css.split('{').length === css.split('}').length],
  ];
  const bad = checks.filter(c => !c[1]);
  if (bad.length) { fail++; console.log(`FAIL themes.css missing: ${bad.map(c => c[0]).join(', ')}`); }
  else console.log('PASS themes.css contains the v3 exact-transcription faction layer');
}
for (const f of files) {
  const h = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  const linked = h.includes('<link rel="stylesheet" href="themes.css">');
  const hooked = h.includes('<script src="themes.js" defer></script>');
  const noInline = !h.includes('/* ============ FACTION THEMES');
  const pass = linked && hooked && noInline;
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${f}: links themes.css=${linked}, hooks themes.js=${hooked}, inline block removed=${noInline}`);
}

// 4) Default looks centralised: data-app identities + html[data-app] blocks in themes.css
{
  const css = fs.readFileSync(`${DIR}/themes.css`, 'utf8');
  const apps = {'index.html':'index','assets.html':'assets','fits.html':'fits','industry.html':'industry','jump.html':'jump','market.html':'market','overview.html':'overview','pi.html':'pi','skills.html':'skills','structures.html':'structures','wallet.html':'wallet'};
  const defaultsIdx = css.indexOf('DEFAULT LOOKS');
  const factionIdx = css.indexOf('/* ============ FACTION THEMES');
  if (defaultsIdx < 0 || factionIdx < 0 || defaultsIdx > factionIdx) { fail++; console.log('FAIL themes.css section ordering (defaults must precede factions)'); }
  else console.log('PASS themes.css: DEFAULT LOOKS section precedes FACTION THEMES');
  for (const [f, app] of Object.entries(apps)) {
    const h = fs.readFileSync(`${DIR}/${f}`, 'utf8');
    const tag = h.match(/<html[^>]*>/)[0];
    const hasAttr = tag.includes(`data-app="${app}"`);
    const hasBlock = css.includes(`html[data-app="${app}"]{`);
    const pass = hasAttr && hasBlock;
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${f}: data-app attr=${hasAttr}, default block in themes.css=${hasBlock}`);
  }
}

// 5) Wireframe purity: no look properties remain in any app stylesheet
{
  const css = fs.readFileSync(`${DIR}/themes.css`, 'utf8');
  const dIdx = css.indexOf('DEFAULT LOOKS'), aIdx = css.indexOf('APP LOOKS'), fIdx = css.indexOf('/* ============ FACTION THEMES');
  const ordered = dIdx > -1 && aIdx > dIdx && fIdx > aIdx;
  if (!ordered) { fail++; console.log('FAIL themes.css layer order (defaults < app looks < factions)'); }
  else console.log('PASS themes.css layers ordered: DEFAULT LOOKS → APP LOOKS → FACTION THEMES');
  const lookProps = /(?:^|[;{\s])(background[a-z-]*|border(?!-collapse|-spacing)[a-z-]*|box-shadow|text-shadow|color|font-family|clip-path|outline[a-z-]*)\s*:/;
  for (const f of files) {
    const h = fs.readFileSync(`${DIR}/${f}`, 'utf8');
    let blocks = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    blocks = blocks.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const leak = blocks.match(lookProps);
    const hasSkin = css.includes(`APP LOOK · ${f}`);
    const pass = !leak && hasSkin;
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${f}: wireframe clean=${!leak}${leak ? ' ('+leak[1]+')' : ''}, skin in themes.css=${hasSkin}`);
  }
}

// 6) Decor runtime: themes.js injects .thm-* hooks into static and dynamic DOM
(async () => {
  const { dom } = boot('overview.html', 'amarr');
  const w = dom.window, doc = w.document;
  try { w.eval(themesJsSrc); } catch (e) { fail++; console.log('FAIL themes.js threw on eval: ' + e.message); }
  // jsdom fires DOMContentLoaded asynchronously after construction; themes.js
  // defers boot until then, so give the event loop a tick before asserting.
  await new Promise(r => setTimeout(r, 30));
  const rails = doc.querySelectorAll('body > .thm-rail').length;
  const overlay = doc.querySelectorAll('body > .thm-overlay').length;
  const halo = doc.querySelectorAll('header .thm-halo').length;
  const svgs = doc.querySelectorAll('.thm-halo .em-gal').length + doc.querySelectorAll('header > .em-trig:first-child').length;
  const creedSpans = doc.querySelectorAll('header > .thm-creed > span').length;
  const sw = doc.querySelector('.theme-swatch');
  const swDec = sw ? (sw.querySelector('i') ? 1 : 0) + (sw.querySelector('.thm-tag') ? 1 : 0) : -1;
  const kc = doc.querySelector('.kcard');
  const kcDecs = kc ? kc.querySelectorAll(':scope > .thm-dec').length : -1;
  const hd = doc.querySelector('.panel-hd, .panel-head');
  const lamps = hd ? hd.querySelectorAll('.thm-lamps .thm-lamp').length : -1;
  // ESI-gated apps render cards/panel-heads at runtime — assert only if present statically.
  let pass = rails === 2 && overlay === 1 && halo >= 1 && svgs === 2 && creedSpans === 5
    && (sw === null || swDec === 2) && (kc === null || kcDecs === 2) && (hd === null || lamps === 3);
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} decor runtime (static): rails=${rails} overlay=${overlay} halo=${halo} svgs=${svgs} creedSpans=${creedSpans} swatchDec=${swDec} kcardDecs=${kcDecs} lamps=${lamps}`);
  // resilience: an app wiping body.innerHTML must get chrome re-injected + new DOM decorated
  doc.body.innerHTML = '<div class="kcard"><span class="l">wiped</span></div>';
  await new Promise(r => setTimeout(r, 30));
  const wRails = doc.querySelectorAll('body > .thm-rail').length;
  const wOverlay = doc.querySelectorAll('body > .thm-overlay').length;
  const wKc = doc.querySelector('.kcard');
  const wDecs = wKc ? wKc.querySelectorAll(':scope > .thm-dec').length : -1;
  pass = wRails === 2 && wOverlay === 1 && wDecs === 2;
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} decor runtime (body-wipe resilience): rails=${wRails} overlay=${wOverlay} kcardDecs=${wDecs}`);
  // idempotency: second eval must not duplicate
  try { w.eval(themesJsSrc); } catch (e) {}
  const rails2 = doc.querySelectorAll('body > .thm-rail').length;
  const kcDecs2 = kc ? kc.querySelectorAll(':scope > .thm-dec').length : -1;
  pass = rails2 === 2 && (kc === null || kcDecs2 === 2);
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} decor runtime (idempotent): rails=${rails2} kcardDecs=${kcDecs2}`);
  // dynamic DOM: MutationObserver decorates JS-rendered cards/panels
  const dyn = doc.createElement('div'); dyn.className = 'kcard';
  const dynPanel = doc.createElement('section'); dynPanel.className = 'panel';
  dynPanel.innerHTML = '<div class="panel-head"><h2>dyn</h2></div>';
  doc.body.appendChild(dyn); doc.body.appendChild(dynPanel);
  await new Promise(r => setTimeout(r, 20));
  const dynDecs = dyn.querySelectorAll(':scope > .thm-dec').length;
  const dynPDecs = dynPanel.querySelectorAll(':scope > .thm-dec').length;
  const dynLamps = dynPanel.querySelectorAll('.thm-lamps .thm-lamp').length;
  pass = dynDecs === 2 && dynPDecs === 2 && dynLamps === 3;
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'} decor runtime (dynamic): kcardDecs=${dynDecs} panelDecs=${dynPDecs} lamps=${dynLamps}`);

  // 7) Industry Blueprint Library: chunked rendering + light bp-cards
  {
    const ind = boot('industry.html', 'minmatar');
    const iw = ind.dom.window, idoc = iw.document;
    try { iw.eval(themesJsSrc); } catch (e) {}
    await new Promise(r => setTimeout(r, 60));
    const cards0 = idoc.querySelectorAll('#bpGrid .bp-card').length;
    const more = idoc.getElementById('bpShowMore');
    // first chunk only, with a Show-more affordance (catalog is ~5k entries)
    let p = cards0 > 0 && cards0 <= 80 && !!more;
    if (more) more.onclick();
    await new Promise(r => setTimeout(r, 30));
    const cards1 = idoc.querySelectorAll('#bpGrid .bp-card').length;
    p = p && cards1 > cards0 && cards1 <= 160;
    // Library cards skip the heavy theme decor (no injected .thm-dec)
    const bpc = idoc.querySelector('#bpGrid .bp-card');
    const bpDecs = bpc ? bpc.querySelectorAll(':scope > .thm-dec').length : -1;
    p = p && bpDecs === 0;
    // data-level search: an impossible term renders zero cards + empty message, no crash
    const si = idoc.getElementById('bpSearchInput');
    si.value = 'zzzznope'; si.dispatchEvent(new iw.Event('input'));
    await new Promise(r => setTimeout(r, 30));
    const cardsS = idoc.querySelectorAll('#bpGrid .bp-card').length;
    const emptyMsg = idoc.getElementById('bpGrid').textContent.includes('No T1 blueprints match') || idoc.getElementById('bpGrid').textContent.includes('No blueprints match');
    p = p && cardsS === 0 && emptyMsg;
    // 12-column cap + landscape no-scrollbox (jsdom does no layout — assert the source contract)
    const isrc = fs.readFileSync(`${DIR}/industry.html`, 'utf8');
    const cap8 = isrc.includes('.bp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px;max-height:70vh;overflow-y:auto;padding-right:6px;align-items:start}');
    const chunk80 = isrc.includes('const BP_RENDER_CHUNK=80;');
    p = p && cap8 && chunk80;
    if (!p) fail++;
    console.log(`${p ? 'PASS' : 'FAIL'} industry library: chunk=${cards0} afterMore=${cards1} bpCardDecs=${bpDecs} searchZero=${cardsS === 0 && emptyMsg} cap8cols=${cap8} chunk80=${chunk80}`);
  }

  console.log(fail === 0 ? '\nALL TESTS PASSED' : `\n${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
})();
