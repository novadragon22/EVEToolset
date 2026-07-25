#!/usr/bin/env python3
"""build_faction_layer.py — generates the FACTION THEMES layer of themes.css as an
EXACT transcription of faction-themes-preview.html.

Usage:  python3 build_faction_layer.py [preview.html] [themes.css]

What it does
  1. Extracts the preview's CSS and slices it into: BASE (hook structure),
     the five faction sections, and the swatch-identity section. The preview's
     design-notes drawer styles are excluded (demo chrome).
  2. Applies a documented selector mapping from preview vocabulary to the
     suite's injected .thm-* hooks (see MAP below). Declaration bodies are
     copied verbatim — the builder never rewrites a value.
  3. Emits derived extras (suite has three card classes and two panel-header
     classes; the preview has one of each) by duplicating transcribed rules
     for .card/.tile/.panel-head/textarea. Values stay preview-exact.
  4. Preserves the suite palette bridge: every declaration in the current
     themes.css top-level html[data-theme="X"]{...} blocks whose property the
     preview does not itself define (the --gold/--cyan/… families the APP
     LOOKS consume). Idempotent across re-runs.
  5. Merges the fonts @import (union of families/weights).
  6. Splices the generated layer into themes.css, replacing everything from
     the FACTION THEMES marker to EOF.

Run verify_preview_parity.py afterwards to prove every preview declaration
landed unchanged.
"""
import re, sys

PREVIEW = sys.argv[1] if len(sys.argv) > 1 else 'faction-themes-preview.html'
THEMES = sys.argv[2] if len(sys.argv) > 2 else 'themes.css'

FACTIONS = ['amarr', 'caldari', 'gallente', 'minmatar', 'triglavian']
MARKERS = {
    'amarr': 'AMARR — baroque', 'caldari': 'CALDARI — brutalist',
    'gallente': 'GALLENTE — techno', 'minmatar': 'MINMATAR — makeshift',
    'triglavian': 'TRIGLAVIAN — bio-mechanical'}
SW_MARK = 'swatch identities'
NOTES_MARK = 'design-notes drawer'
LAYER_MARK = '/* ============ FACTION THEMES'

# ---------------------------------------------------------------- extraction
def preview_css(path):
    html = open(path, encoding='utf-8').read()
    blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html)
    return blocks[0], html

def slice_sections(css):
    starts = {}
    for k, m in MARKERS.items():
        i = css.find(m)
        if i < 0:
            raise SystemExit('marker not found: ' + m)
        starts[k] = css.rfind('/*', 0, i)
    sw = css.rfind('/*', 0, css.find(SW_MARK))
    notes = css.rfind('/*', 0, css.find(NOTES_MARK))
    base = css[:starts['amarr']]
    secs = {}
    for i, k in enumerate(FACTIONS):
        end = starts[FACTIONS[i + 1]] if i + 1 < len(FACTIONS) else sw
        secs[k] = css[starts[k]:end]
    return base, secs, css[sw:notes]

# ---------------------------------------------------------------- tokenizer
def tokens(css):
    """Yields ('comment', text) | ('at', whole) | ('rule', selector, body)."""
    i, n = 0, len(css)
    while i < n:
        c = css[i]
        if c.isspace():
            i += 1
            continue
        if css.startswith('/*', i):
            j = css.find('*/', i) + 2
            yield ('comment', css[i:j])
            i = j
            continue
        if c == '@':
            jb, js = css.find('{', i), css.find(';', i)
            if js > -1 and (jb == -1 or js < jb):
                yield ('at', css[i:js + 1])
                i = js + 1
                continue
            depth, j = 0, jb
            while True:
                if css[j] == '{':
                    depth += 1
                elif css[j] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            yield ('at', css[i:j + 1])
            i = j + 1
            continue
        jb = css.find('{', i)
        jk = css.find('}', jb)
        yield ('rule', css[i:jb].strip(), css[jb + 1:jk])
        i = jk + 1

def split_decls(body):
    out, depth, cur = [], 0, ''
    for ch in body:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ';' and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return [d.strip() for d in out if d.strip() and not d.strip().startswith('/*')]

def prop_of(decl):
    return decl.split(':', 1)[0].strip().lower()

# ---------------------------------------------------------------- mapping
# preview vocabulary            → suite vocabulary
#   .masthead                   → header            (same element type in preview)
#   .rail                       → .thm-rail         (injected by themes.js)
#   .emblem                     → .thm-halo         (injected; carries .em-gal)
#   .creed                      → .thm-creed        (injected; .cr-* spans kept)
#   .hd-aux                     → .thm-lamps        (injected lamp container)
#   .lamp                       → .thm-lamp         (injected ×3)
#   .dec / .d1 / .d2            → .thm-dec/.thm-d1/.thm-d2 (injected)
#   body::before / body::after  → .thm-overlay::before/::after (APP LOOKS own
#                                 the body pseudos; pseudos are position:fixed
#                                 so the zero-size overlay host is equivalent)
#   .sw / .sw-<f> / .sw .tag    → .theme-swatch [data-theme="<f>"] / .thm-tag
#                                 (.tag collides with app classes)
def map_sel(sel, swatch=False):
    s = sel
    s = re.sub(r'\.masthead(?![\w-])', 'header', s)
    s = re.sub(r'\.rail(?![\w-])', '.thm-rail', s)
    s = re.sub(r'\.emblem(?![\w-])', '.thm-halo', s)
    s = re.sub(r'\.creed(?![\w-])', '.thm-creed', s)
    s = re.sub(r'\.hd-aux(?![\w-])', '.thm-lamps', s)
    s = re.sub(r'\.lamp(?![\w-])', '.thm-lamp', s)
    s = re.sub(r'\.dec(?![\w-])', '.thm-dec', s)
    s = re.sub(r'\.d1(?![\w-])', '.thm-d1', s)
    s = re.sub(r'\.d2(?![\w-])', '.thm-d2', s)
    s = re.sub(r'\bbody::before', '.thm-overlay::before', s)
    s = re.sub(r'\bbody::after', '.thm-overlay::after', s)
    s = re.sub(r'\.sw-(amarr|caldari|gallente|minmatar|triglavian)(?![\w-])',
               r'.theme-swatch[data-theme="\1"]', s)
    s = re.sub(r'\.sw(?![\w-])', '.theme-swatch', s)
    s = re.sub(r'\.tag(?![\w-])', '.thm-tag', s)
    if swatch:
        parts = [p.strip() for p in s.split(',')]
        s = ','.join(p if p.startswith('html') else 'html ' + p for p in parts)
    return s

HOOK_BASE = re.compile(r'^\.(rail|creed|emblem|dec|lamp|hd-aux|sw)(?![\w-])')

def base_hooks(base):
    """Transcribe hook structure + the reduced-motion kill from the BASE part."""
    out = []
    for t in tokens(base):
        if t[0] == 'at' and 'prefers-reduced-motion' in t[1]:
            out.append(('/* reduced-motion kill (verbatim from preview) */', t[1]))
        elif t[0] == 'rule':
            parts = [p.strip() for p in t[1].split(',')]
            if parts and all(HOOK_BASE.match(p) for p in parts):
                out.append((map_sel(t[1]), t[2]))
    return out

# ---------------------------------------------------------------- assembly
def transcribe(sec):
    """Faction section → (list of emit-strings, list of (mapped_sel, body))."""
    emitted, rules = [], []
    for t in tokens(sec):
        if t[0] == 'comment':
            emitted.append(t[1])
        elif t[0] == 'at':
            emitted.append(t[1])
        else:
            ms = map_sel(t[1])
            emitted.append(ms + '{' + t[2] + '}')
            rules.append((ms, t[2]))
    return emitted, rules

def derived_extras(rules):
    """Suite-vocabulary duplicates of transcribed rules (values preview-exact)."""
    out = []
    for sel, body in rules:
        if '.kcard' in sel:
            # .card:not(.bp-card): the industry Blueprint Library renders up to
            # ~5k .bp-card.card nodes — the full kcard treatment (gradients,
            # shadows, animated pseudos) on that many cards is a perf killer.
            # Library cards stay palette-themed via variables only.
            out.append(sel.replace('.kcard', '.card:not(.bp-card)') + '{' + body + '}')
            out.append(sel.replace('.kcard', '.tile') + '{' + body + '}')
        if '.panel-hd' in sel and '.panel-head' not in sel:
            out.append(sel.replace('.panel-hd', '.panel-head') + '{' + body + '}')
        if re.search(r'\binput\b', sel):
            out.append(re.sub(r'\binput\b', 'textarea', sel) + '{' + body + '}')
    return out

def palette_bridge(themes_css, preview_secs):
    """Current top-level html[data-theme=X]{...} declarations whose property
    the preview does not define → carried over so APP LOOKS keep working."""
    layer = themes_css[themes_css.find(LAYER_MARK):] if LAYER_MARK in themes_css else themes_css
    bridge = {}
    for f in FACTIONS:
        current = {}
        for m in re.finditer(r'html\[data-theme="%s"\]\s*\{([^{}]*)\}' % f, layer):
            for d in split_decls(m.group(1)):
                current.setdefault(prop_of(d), d)
        pv = set()
        for m in re.finditer(r'html\[data-theme="%s"\]\s*\{([^{}]*)\}' % f, preview_secs[f]):
            for d in split_decls(m.group(1)):
                pv.add(prop_of(d))
        bridge[f] = [d for p, d in current.items() if p not in pv]
    return bridge

SUITE_GLUE = """/* ---------------------------------------------------------------------------
   SUITE GLUE — not from the preview. Visibility gating for injected hooks
   (hidden until a faction is active), header anchoring for masthead decor,
   the overlay host for the mapped body pseudos, the CSS equivalent of the
   preview's inline em-trig toggle, and a fill for the default swatch (the
   preview has no default theme). Everything else in this layer is transcribed.
   --------------------------------------------------------------------------- */
html:not([data-theme]) .thm-rail,html:not([data-theme]) .thm-overlay,html:not([data-theme]) .thm-halo,html:not([data-theme]) .thm-creed,html:not([data-theme]) .thm-dec,html:not([data-theme]) .thm-lamps,html:not([data-theme]) header > .em-trig,
html[data-theme="default"] .thm-rail,html[data-theme="default"] .thm-overlay,html[data-theme="default"] .thm-halo,html[data-theme="default"] .thm-creed,html[data-theme="default"] .thm-dec,html[data-theme="default"] .thm-lamps,html[data-theme="default"] header > .em-trig{display:none!important}
html[data-theme] header{position:relative}
html[data-theme] header > .em-trig{display:none}
html[data-theme] .thm-overlay{display:block;position:fixed;top:0;left:0;width:0;height:0;pointer-events:none}
html .theme-swatch[data-theme="default"] i{background:var(--sw,#8a94a0);border-radius:6px;opacity:.9}
"""

def merge_fonts(themes_css, pv_css):
    def parse(line):
        fams = {}
        for m in re.finditer(r'family=([A-Za-z+]+)(?::wght@([\d;]+))?', line):
            name = m.group(1)
            w = set((m.group(2) or '').split(';')) - {''}
            fams.setdefault(name, set()).update(w)
        return fams
    imp = r'@import\s+url\(\s*["\'][^"\')]*["\']\s*\)\s*;'
    cur = re.search(imp, themes_css).group(0)
    pv = re.search(imp, pv_css).group(0)
    fams = parse(cur)
    for name, w in parse(pv).items():
        fams.setdefault(name, set()).update(w)
    parts = []
    for name, w in fams.items():
        parts.append('family=' + name + (':wght@' + ';'.join(sorted(w, key=int)) if w else ''))
    tail = '&display=swap' if 'display=swap' in cur + pv else ''
    new = '@import url("https://fonts.googleapis.com/css2?' + '&'.join(parts) + tail + '");'
    return themes_css.replace(cur, new, 1), new

# ---------------------------------------------------------------- main
def build():
    pv, _html = preview_css(PREVIEW)
    base, secs, swatch = slice_sections(pv)
    themes = open(THEMES, encoding='utf-8').read()
    bridge = palette_bridge(themes, secs)

    out = []
    out.append(LAYER_MARK + ''' · v3 EXACT TRANSCRIPTION ============
   Generated by build_faction_layer.py from faction-themes-preview.html.
   Every faction block below is a verbatim transcription of the preview
   (selector-mapped to the suite's injected .thm-* hooks — see the builder
   for the mapping table). Do not hand-edit transcribed rules; edit the
   preview and re-run the builder. verify_preview_parity.py proves parity.
   ============================================================ */''')

    hooks = base_hooks(base)
    out.append('/* ------------------- HOOK STRUCTURE (preview base, mapped) ------------------- */')
    for sel, body in hooks:
        out.append(sel + '{' + body + '}' if not sel.startswith('/*') else sel + '\n' + body)
    out.append(SUITE_GLUE)

    n_rules = 0
    for f in FACTIONS:
        emitted, rules = transcribe(secs[f])
        n_rules += len(rules)
        out.extend(emitted)
        extras = derived_extras(rules)
        if extras:
            out.append('/* DERIVED EXTRAS · %s — suite card/panel-head/textarea duplicates, values preview-exact */' % f)
            out.extend(extras)
        if bridge[f]:
            out.append('/* SUITE PALETTE BRIDGE · %s — variables the APP LOOKS consume; not defined by the preview */' % f)
            out.append('html[data-theme="%s"]{%s}' % (f, ';\n  '.join(bridge[f])))

    sw_emitted, sw_rules = [], []
    for t in tokens(swatch):
        if t[0] == 'comment':
            sw_emitted.append(t[1])
        elif t[0] == 'at':
            sw_emitted.append(t[1])
        else:
            sw_emitted.append(map_sel(t[1], swatch=True) + '{' + t[2] + '}')
            sw_rules.append(1)
    out.append('/* ------------- SWATCH IDENTITIES (preview, mapped to .theme-swatch) ------------- */')
    out.extend(sw_emitted)

    layer = '\n'.join(out) + '\n'
    i = themes.find(LAYER_MARK)
    if i < 0:
        raise SystemExit('FACTION THEMES marker not found in ' + THEMES)
    themes = themes[:i] + layer
    themes, font_line = merge_fonts(themes, pv)
    open(THEMES, 'w', encoding='utf-8').write(themes)

    bal = themes.count('{') - themes.count('}')
    print('faction rules transcribed: %d  | hook-structure rules: %d  | swatch rules: %d'
          % (n_rules, len(hooks), len(sw_rules)))
    print('bridge decls:', {f: len(bridge[f]) for f in FACTIONS})
    print('fonts:', font_line[:110] + '…')
    print('themes.css: %d bytes, brace balance %d' % (len(themes), bal))
    if bal != 0:
        raise SystemExit('BRACE IMBALANCE')

if __name__ == '__main__':
    build()
