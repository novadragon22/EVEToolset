/* ============================================================================
   EVE SUITE — THEME DECOR RUNTIME (themes.js) · wireframe logic v3
   Companion to themes.css, whose FACTION THEMES layer is an exact transcription
   of faction-themes-preview.html (see build_faction_layer.py). This file
   injects the inert, namespaced hook elements that transcription styles. Apps
   stay pure structural wireframes: no styles here, no app-state reads, every
   element display-gated by the theme CSS, every path try/catch-guarded.

   Injected vocabulary (mirrors the preview's DOM contract)
     body         → .thm-rail ×2 (first + last children; scripture/stencil rails)
                    .thm-overlay (zero-size host for the mapped body pseudos)
     header       → .em-trig  (first child — trinary emblem, CSS-gated)
                    .thm-creed (faction motto spans, verbatim from the preview)
                    .thm-halo  (mapped .emblem; carries the .em-gal filament)
     .kcard/.card/.tile/.panel → .thm-dec.thm-d1 + .thm-dec.thm-d2
     .panel-hd/.panel-head     → .thm-lamps > .thm-lamp ×3 (mapped .hd-aux)
     .theme-swatch             → <i> + .thm-tag (mapped .sw identity slots)

   A MutationObserver decorates JS-rendered DOM; a debounced ensureChrome()
   re-injects body chrome and header decor if an app wipes innerHTML.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__thmDecor) return; // idempotent across double includes
  window.__thmDecor = 1;

  /* ---- UI SCALE: apply immediately so layout never flashes at wrong size ---- */
  var SCALE_KEY = 'eve_suite_ui_scale';
  var SCALE_MIN = 50, SCALE_MAX = 200, SCALE_DEF = 100;
  function clampScale(v) { v = parseInt(v, 10); return isNaN(v) ? SCALE_DEF : Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)); }
  function readScale() { try { return clampScale(localStorage.getItem(SCALE_KEY)); } catch(e) { return SCALE_DEF; } }
  function applyScale(v) {
    var f = v / 100;
    /* zoom scales everything — including px font-sizes, paddings, SVGs — uniformly.
       fontSize on <html> only affects em/rem units and was silently ignored by all
       the suite's px-based layouts. We clear the old fontSize override too so it
       doesn't fight the zoom. */
    try { document.documentElement.style.fontSize = ''; } catch(e) {}
    try {
      if (document.body) {
        document.body.style.zoom = f;
      } else {
        /* body not ready yet — defer until DOMContentLoaded */
        document.addEventListener('DOMContentLoaded', function() {
          document.body.style.zoom = f;
        }, { once: true });
      }
    } catch(e) {}
  }
  applyScale(readScale());

  function injectScaleSlider(container, inline) {
    if (!container || container.__scaleSlider) return;
    container.__scaleSlider = 1;
    var wrap = document.createElement('div');
    wrap.className = 'scale-ctl';
    if (inline) wrap.style.cssText = 'margin-left:auto';
    var lbl = document.createElement('span');
    lbl.className = 'scale-lbl';
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = SCALE_MIN; slider.max = SCALE_MAX; slider.step = 10;
    var cur = readScale();
    slider.value = cur;
    lbl.textContent = cur + '%';
    lbl.title = 'Click to reset to 100%';
    lbl.onclick = function() { slider.value = SCALE_DEF; update(SCALE_DEF); };
    function update(v) {
      v = clampScale(v);
      lbl.textContent = v + '%';
      applyScale(v);
      try { localStorage.setItem(SCALE_KEY, v); } catch(e) {}
    }
    slider.oninput = function() { update(+slider.value); };
    wrap.appendChild(lbl);
    wrap.appendChild(slider);
    container.appendChild(wrap);
  }

  function injectSliders() {
    try {
      var tbRights = document.querySelectorAll('.tb-right');
      for (var i = 0; i < tbRights.length; i++) injectScaleSlider(tbRights[i], false);
      var themes = document.querySelectorAll('.topbar .themes');
      for (var j = 0; j < themes.length; j++) injectScaleSlider(themes[j], false);
    } catch(e) {}
  }

  var CARD_SEL = '.kcard,.card,.tile';
  var PANEL_SEL = '.panel';
  var HD_SEL = '.panel-hd,.panel-head';
  var SW_SEL = '.theme-swatch';

  /* Verbatim from faction-themes-preview.html (inline display toggle replaced
     by the CSS gate in themes.css SUITE GLUE). */
  var EM_TRIG =
    '<svg class="em-trig" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">' +
    '<polygon points="54,10 98,88 10,88" fill="none" stroke="#b08a5a" stroke-width="1.2" opacity=".7"/>' +
    '<polygon points="54,26 86,82 22,82" fill="none" stroke="#c8283a" stroke-width="1"/>' +
    '<polygon points="54,42 74,76 34,76" fill="none" stroke="#ffb060" stroke-width=".8" opacity=".8"/></svg>';

  var EM_GAL =
    '<svg class="em-gal" viewBox="0 0 760 56" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<path class="fil" d="M0,28 C70,6 110,50 190,28 S330,6 380,28 470,50 550,28 690,6 760,28" fill="none" stroke="#c87a3a" stroke-width="1.6"/>' +
    '<path class="fil2" d="M0,34 C80,54 130,10 210,30 S350,52 400,32 500,8 580,30 700,50 760,32" fill="none" stroke="#c87a3a" stroke-width="1.1"/>' +
    '<circle class="node" cx="190" cy="28" r="3.4" fill="#f0c060"/>' +
    '<circle class="node" cx="380" cy="28" r="3.4" fill="#f0c060"/>' +
    '<circle class="node" cx="550" cy="28" r="3.4" fill="#f0c060"/>' +
    '<circle class="node" cx="700" cy="21" r="2.6" fill="#f0c060"/></svg>';

  var CREED =
    '<span class="cr-amarr">Baroque divine-imperialism — cathedral arches, gilt and alabaster, crimson judgment.</span>' +
    '<span class="cr-caldari">// brutalist corporate-functionalism — slab armor, rivets, stencils, sensor light</span>' +
    '<span class="cr-gallente">techno-progressive organic-futurism — sinuous hulls, copper filaments, amber windows</span>' +
    '<span class="cr-minmatar">// makeshift tribal-industrialism — salvage, welds, rust, white-hot flare //</span>' +
    '<span class="cr-triglavian">⟁ SVAROG CLADE — THE FORGE DOES NOT STOP · THREE HAMMER-BLOWS · METAMATERIA PROVEN ⟁</span>' +
'';

  function make(tag, cls, html) {
    var e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function isThm(node) {
    return node.className && typeof node.className === 'string' && node.className.indexOf('thm-') > -1;
  }

  function decCards(el) {
    if (el.__thmC) return;
    el.__thmC = 1;
    // Library grids render thousands of .bp-card.card nodes — two injected
    // decor elements each is pure overhead there (the theme layer also
    // excludes them via .card:not(.bp-card)).
    if (el.classList && el.classList.contains('bp-card')) return;
    el.appendChild(make('i', 'thm-dec thm-d1'));
    el.appendChild(make('i', 'thm-dec thm-d2'));
  }
  function decPanel(el) {
    if (el.__thmP) return;
    el.__thmP = 1;
    el.appendChild(make('i', 'thm-dec thm-d1'));
    el.appendChild(make('i', 'thm-dec thm-d2'));
  }
  function decHd(el) {
    if (el.__thmH) return;
    el.__thmH = 1;
    el.appendChild(make('span', 'thm-lamps',
      '<i class="thm-lamp"></i><i class="thm-lamp"></i><i class="thm-lamp"></i>'));
  }
  function decSwatch(el) {
    if (el.__thmS) return;
    el.__thmS = 1;
    if (!el.querySelector('i')) el.appendChild(document.createElement('i'));
    if (!el.querySelector('.thm-tag')) {
      var tag = make('span', 'thm-tag');
      tag.textContent = (el.getAttribute('title') || el.getAttribute('data-theme') || '').toUpperCase();
      el.appendChild(tag);
    }
  }
  function decHeader(el) {
    /* existence-checked, not flagged: survives header innerHTML wipes */
    try {
      if (!el.querySelector(':scope > .em-trig')) {
        var t = make('span', '', EM_TRIG);
        el.insertBefore(t.firstChild, el.firstChild);
      }
      if (!el.querySelector(':scope > .thm-creed')) el.appendChild(make('div', 'thm-creed', CREED));
      if (!el.querySelector(':scope > .thm-halo')) el.appendChild(make('div', 'thm-halo', EM_GAL));
    } catch (e) { /* ignore */ }
  }

  function sweep(root) {
    try {
      if (root.nodeType !== 1 || isThm(root)) return;
      var m = root.matches || root.msMatchesSelector;
      if (m) {
        if (m.call(root, CARD_SEL)) decCards(root);
        if (m.call(root, PANEL_SEL)) decPanel(root);
        if (m.call(root, HD_SEL)) decHd(root);
        if (m.call(root, SW_SEL)) decSwatch(root);
        if (root.tagName === 'HEADER') decHeader(root);
      }
      if (!root.querySelectorAll) return;
      var i, list;
      list = root.querySelectorAll(CARD_SEL);
      for (i = 0; i < list.length; i++) decCards(list[i]);
      list = root.querySelectorAll(PANEL_SEL);
      for (i = 0; i < list.length; i++) decPanel(list[i]);
      list = root.querySelectorAll(HD_SEL);
      for (i = 0; i < list.length; i++) decHd(list[i]);
      list = root.querySelectorAll(SW_SEL);
      for (i = 0; i < list.length; i++) decSwatch(list[i]);
      list = root.querySelectorAll('header');
      for (i = 0; i < list.length; i++) decHeader(list[i]);
    } catch (e) { /* decor must never break an app */ }
  }

  function ensureChrome() {
    /* Existence-checked (not flagged): apps that re-render via body.innerHTML
       wipe injected chrome, so we re-insert whenever it goes missing. */
    try {
      var b = document.body;
      if (!b) return;
      var rails = b.querySelectorAll(':scope > .thm-rail');
      if (rails.length !== 2 || rails[0] !== b.firstElementChild || rails[1] !== b.lastElementChild) {
        for (var i = 0; i < rails.length; i++) b.removeChild(rails[i]);
        b.insertBefore(make('div', 'thm-rail'), b.firstChild);
        b.appendChild(make('div', 'thm-rail'));
      }
      if (!b.querySelector(':scope > .thm-overlay')) b.appendChild(make('div', 'thm-overlay'));
      var hs = document.querySelectorAll('header');
      for (var j = 0; j < hs.length; j++) decHeader(hs[j]);
    } catch (e) { /* ignore */ }
  }

  function boot() {
    ensureChrome();
    sweep(document.body || document.documentElement);
    injectSliders();
    try {
      var pending = false;
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) sweep(added[j]);
        }
        if (!pending) { // debounced chrome re-check per batch
          pending = true;
          setTimeout(function () { pending = false; ensureChrome(); }, 0);
        }
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* older engines: initial sweep already ran */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
