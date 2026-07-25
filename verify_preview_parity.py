#!/usr/bin/env python3
"""verify_preview_parity.py — proves the FACTION THEMES layer of themes.css is an
exact transcription of faction-themes-preview.html.

Usage:  python3 verify_preview_parity.py [preview.html] [themes.css]

Re-extracts every themable token from the preview (hook structure, reduced-
motion kill, all five faction sections, swatch identities), applies the same
selector mapping as the builder, whitespace-normalizes, and asserts each one
appears in themes.css. Declaration bodies must match byte-for-byte after
whitespace collapse — a changed value, dropped rule, or edited keyframe fails
the check. Exit code 0 = full parity.
"""
import re, sys
import build_faction_layer as B

PREVIEW = sys.argv[1] if len(sys.argv) > 1 else 'faction-themes-preview.html'
THEMES = sys.argv[2] if len(sys.argv) > 2 else 'themes.css'

def norm(s):
    return ' '.join(s.split())

def expected():
    pv, _ = B.preview_css(PREVIEW)
    base, secs, swatch = B.slice_sections(pv)
    exp = []
    for sel, body in B.base_hooks(base):
        if sel.startswith('/*'):
            exp.append(('reduced-motion', body))
        else:
            exp.append(('hook ' + sel, sel + '{' + body + '}'))
    for f in B.FACTIONS:
        for t in B.tokens(secs[f]):
            if t[0] == 'at':
                exp.append((f + ' ' + t[1].split('{')[0].strip()[:60], t[1]))
            elif t[0] == 'rule':
                ms = B.map_sel(t[1])
                exp.append((f + ' ' + ms[:70], ms + '{' + t[2] + '}'))
    for t in B.tokens(swatch):
        if t[0] == 'at':
            exp.append(('swatch ' + t[1][:50], t[1]))
        elif t[0] == 'rule':
            ms = B.map_sel(t[1], swatch=True)
            exp.append(('swatch ' + ms[:70], ms + '{' + t[2] + '}'))
    return exp

def main():
    themes = norm(open(THEMES, encoding='utf-8').read())
    exp = expected()
    missing = [(label, text) for label, text in exp if norm(text) not in themes]
    print('preview tokens expected: %d   found: %d   missing: %d'
          % (len(exp), len(exp) - len(missing), len(missing)))
    for label, text in missing[:20]:
        print('  MISSING:', label)
    if missing:
        sys.exit(1)
    print('EXACT PARITY: every preview declaration is present in themes.css')

if __name__ == '__main__':
    main()
