#!/usr/bin/env python3
"""Partition each app's CSS into STRUCT (wireframe, stays in app) and LOOK
(moves to themes.css under html[data-app="X"] scope). Preserves cascade order."""
import re, sys

LOOK_EXACT = {
    'color','clip-path','filter','backdrop-filter','-webkit-backdrop-filter','mix-blend-mode',
    'box-shadow','text-shadow','letter-spacing','text-transform','fill','stroke',
    'scrollbar-color','accent-color','caret-color','image-rendering','font',
    'font-family','font-style','font-weight','font-stretch','box-decoration-break',
    'background-clip','appearance','-webkit-appearance','-moz-appearance',
    '-webkit-tap-highlight-color','-webkit-font-smoothing','-moz-osx-font-smoothing',
}
LOOK_PREFIX = ('background','border','outline','text-decoration','font-variant',
               '-webkit-text','-webkit-background')
STRUCT_EXCEPT = {'border-collapse','border-spacing'}  # layout-affecting despite prefix

def is_look(prop):
    p = prop.strip().lower()
    if p.startswith('--'): return False
    if p in STRUCT_EXCEPT: return False
    if p in LOOK_EXACT: return True
    return any(p.startswith(x) for x in LOOK_PREFIX)

def split_top(css):
    """Yield ('rule', selector, body) or ('at', header, inner_or_None, raw)."""
    i, n = 0, len(css); out = []
    while i < n:
        # skip whitespace/comments
        m = re.match(r'\s+', css[i:])
        if m: i += m.end(); continue
        if css.startswith('/*', i):
            j = css.find('*/', i+2); i = (j+2) if j != -1 else n; continue
        # find next '{' or ';' at top level
        j = i; depth = 0; instr = None
        while j < n:
            c = css[j]
            if instr:
                if c == instr and css[j-1] != '\\': instr = None
            elif c in '"\'': instr = c
            elif c == '{': break
            elif c == ';' and depth == 0:
                # at-rule like @import ...;
                out.append(('flat', css[i:j+1])); i = j+1; break
            elif c == '(': depth += 1
            elif c == ')': depth -= 1
            j += 1
        else:
            if css[i:].strip(): out.append(('flat', css[i:]))
            break
        if j < n and css[j] == ';': continue
        if j >= n: break
        header = css[i:j].strip()
        # find matching close brace
        k = j+1; depth = 1; instr = None
        while k < n and depth:
            c = css[k]
            if instr:
                if c == instr and css[k-1] != '\\': instr = None
            elif c in '"\'': instr = c
            elif c == '{': depth += 1
            elif c == '}': depth -= 1
            k += 1
        body = css[j+1:k-1]
        if header.startswith('@'):
            out.append(('at', header, body))
        else:
            out.append(('rule', header, body))
        i = k
    return out

def split_decls(body):
    decls = []; cur = ''; depth = 0; instr = None; i = 0
    while i < len(body):
        c = body[i]
        if instr:
            cur += c
            if c == instr and body[i-1] != '\\': instr = None
        elif c in '"\'': instr = c; cur += c
        elif c == '(': depth += 1; cur += c
        elif c == ')': depth -= 1; cur += c
        elif c == ';' and depth == 0:
            if cur.strip(): decls.append(cur.strip())
            cur = ''
        else: cur += c
        i += 1
    if cur.strip(): decls.append(cur.strip())
    return decls

def split_selectors(sel):
    parts = []; cur = ''; depth = 0
    for c in sel:
        if c == '(': depth += 1
        elif c == ')': depth -= 1
        if c == ',' and depth == 0:
            parts.append(cur.strip()); cur = ''
        else: cur += c
    if cur.strip(): parts.append(cur.strip())
    return parts

def prefix_sel(sel, app):
    s = sel.strip()
    scope = f'html[data-app="{app}"]'
    if s.startswith(':root'): return scope + s[len(':root'):]
    if s == 'html': return scope
    if s.startswith('html') and (len(s) == 4 or s[4] in ' .:[>~+'):
        return scope + s[4:]
    return scope + ' ' + s

def partition(css, app, root_vars_in_defaults):
    struct_out, look_out = [], []
    stats = {'struct':0,'look':0,'dropped_root_vars':0}
    for node in split_top(css):
        if node[0] == 'flat':
            struct_out.append(node[1]); continue
        if node[0] == 'at':
            header, body = node[1], node[2]
            name = header.split('(')[0].split()[0].lower()
            if name in ('@media','@supports'):
                s_in, l_in, st = partition(body, app, root_vars_in_defaults)
                for k in stats:
                    if k in st: stats[k] += st[k]
                if s_in.strip(): struct_out.append(f'{header}{{\n{s_in}\n}}')
                if l_in.strip(): look_out.append(f'{header}{{\n{l_in}\n}}')
            else:  # @keyframes, @font-face, others → struct wholesale
                struct_out.append(f'{header}{{{body}}}')
                stats['struct'] += len(split_decls(body))
            continue
        sel, body = node[1], node[2]
        decls = split_decls(body)
        s_d, l_d = [], []
        is_root = any(p.strip() == ':root' for p in split_selectors(sel))
        for d in decls:
            prop = d.split(':',1)[0].strip()
            if is_root and prop.startswith('--') and prop in root_vars_in_defaults:
                stats['dropped_root_vars'] += 1; continue
            (l_d if is_look(prop) else s_d).append(d)
        if s_d:
            struct_out.append(f'{sel}{{{";".join(s_d)}}}'); stats['struct'] += len(s_d)
        if l_d:
            psel = ','.join(prefix_sel(p, app) for p in split_selectors(sel))
            look_out.append(f'{psel}{{{";".join(l_d)}}}'); stats['look'] += len(l_d)
    return '\n'.join(struct_out), '\n'.join(look_out), stats

if __name__ == '__main__':
    print('module ok')
