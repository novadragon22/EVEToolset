# EVE Suite — Wireframe Logic Bundle (v3 · exact preview transcription)

Every app in this folder is a **structural wireframe**: its own `<style>` blocks contain
layout, sizing, spacing, positioning, transitions, and `@keyframes` motion only. All of
its JavaScript logic (ESI OAuth, SDE data, rendering, localStorage roster/theme sync) is
intact. **No colors, backgrounds, borders, shadows, fonts, radii, or clip shapes live in
the app files.**

Every app links the skin layer in its `<head>`:

    <link rel="stylesheet" href="themes.css">
    <script src="themes.js" defer></script>

Keep `themes.css` and `themes.js` in the same folder as the HTML files — both
references are relative.

## themes.css — the single visual authority

Four layers, in cascade order:

1. **Fonts** — `@import` for all faction typefaces (Cinzel, Marcellus, Saira,
   Saira Stencil One, Comfortaa, Quicksand, Teko, Michroma, IBM Plex Mono).
2. **DEFAULT LOOKS** — each app's default variable palette on `html[data-app="…"]`.
   Every app's `<html>` tag carries its identity (e.g. `data-app="pi"`). Edit values
   here to restyle a tool's default appearance.
3. **APP LOOKS** — one section per app (`APP LOOK · wallet.html`, …) holding every
   look declaration moved out of that app, scoped under `html[data-app="…"]`, in
   original source order so the cascade resolves identically to the pre-split suite.
4. **FACTION THEMES · v3 EXACT TRANSCRIPTION** — generated, not hand-written.
   `build_faction_layer.py` reads `faction-themes-preview.html` (kept in this
   folder as the authoritative reference) and transcribes its five faction
   sections, hook structure, reduced-motion kill, and swatch identities into
   themes.css **verbatim** — every declaration byte-identical, only selectors
   mapped to suite vocabulary:

   | preview                      | suite                                   |
   |------------------------------|-----------------------------------------|
   | `.masthead`                  | `header` (same element in the preview)  |
   | `.rail`                      | `.thm-rail` (injected)                  |
   | `.emblem`                    | `.thm-halo` (injected, holds `.em-gal`) |
   | `.creed`                     | `.thm-creed` (injected motto spans)     |
   | `.hd-aux` / `.lamp`          | `.thm-lamps` / `.thm-lamp` (injected)   |
   | `.dec` / `.d1` / `.d2`       | `.thm-dec` / `.thm-d1` / `.thm-d2`      |
   | `body::before` / `::after`   | `.thm-overlay::before` / `::after`      |
   | `.sw` / `.sw-<f>` / `.sw .tag` | `html .theme-swatch` / `[data-theme="<f>"]` / `.thm-tag` |

   Around the transcription the builder emits three clearly-marked non-preview
   sections: **SUITE GLUE** (visibility gate under the default theme, header
   `position:relative` anchoring, the zero-size overlay host — the mapped body
   pseudos are `position:fixed` so placement is equivalent — the CSS
   equivalent of the preview's inline em-trig toggle, and a default-swatch
   fill), **DERIVED EXTRAS** per faction (the preview has one card class and
   one panel-header class; the suite has `.kcard`/`.card`/`.tile` and
   `.panel-hd`/`.panel-head`, plus textareas — rules are duplicated with
   values kept preview-exact), and a **SUITE PALETTE BRIDGE** per faction
   (the `--gold`/`--cyan`/`--hdr-*`/`--radius-*` variables the APP LOOKS
   consume, which the preview does not define).

   To change a theme: edit the preview, re-run
   `python3 build_faction_layer.py`, then `python3 verify_preview_parity.py`
   — it re-extracts all 402 preview tokens and fails if any declaration in
   themes.css differs. **Never hand-edit transcribed blocks.**

5. **DECOR RUNTIME — `themes.js`** — the elaborate themes need more decoration slots
   than two pseudo-elements per node can carry, and four apps (fits, industry, jump,
   pi) render most of their DOM at runtime. `themes.js` (linked with `defer` after
   `themes.css` in every app) injects inert, namespaced hook elements and nothing
   else — no styles, no app-state reads, everything `display:none` until a faction
   theme opts it in, and every code path try/catch-guarded so decor can never break
   an app:

   | Target                     | Injected hooks (mirrors the preview's DOM contract) |
   |----------------------------|--------------------------------------------------|
   | `body`                     | `.thm-rail` ×2 (first + last children), `.thm-overlay` (host for scanlines/aurora pseudos) |
   | `header`                   | `.em-trig` first child (trinary emblem, CSS-gated), then appended `.thm-creed` (five verbatim faction-motto spans) and `.thm-halo` (the mapped `.emblem`, carrying the `.em-gal` filament) |
   | `.kcard` / `.card` / `.tile` / `.panel` | `.thm-dec.thm-d1` + `.thm-dec.thm-d2` |
   | `.panel-hd` / `.panel-head`| `.thm-lamps` > `.thm-lamp` ×3 (the preview's `.hd-aux` container, so `:nth-child` lamp rules apply unchanged) |
   | `.theme-swatch`            | `<i>` + `.thm-tag` (the preview's swatch identity slots; label from the button's `title`) |

   A MutationObserver decorates JS-rendered DOM as it appears, and a debounced
   `ensureChrome()` re-injects body chrome **and header decor** if an app wipes
   `body.innerHTML` or a header's children (existence-checked, not flagged —
   verified by the harness's body-wipe resilience test). Double inclusion is a
   no-op (`window.__thmDecor`).

Deliberate scope notes:
- `@keyframes` stay in the apps (motion behavior; centralising them risks cross-app
  name collisions). Faction keyframes live in themes.css under collision-proof
  `am-`/`cd-`/`ga-`/`mn-`/`tg-` prefixes.
- Inline `style=` attributes in JS-generated markup stay in the apps (dynamic
  behavior). pi.html is the main case — its palette was hardcoded historically; its
  DEFAULT LOOKS block documents the sampled values. Body rails + overlay still
  inject there; the `.thm-halo` appears only if a `<header>` element exists at
  runtime.
- `.bar-fill.amber` / `.bar-fill.red` warning states keep semantic colors under every
  faction via `:not()` exclusions (incl. the Triglavian disintegrator ramp).
- Gallente sets `border-collapse:separate` / `border-spacing:0 8px` for its floating
  table rows. Those properties are "structural" under partition_css.py's rules, but
  the purity check only polices app files — the faction layer owning them is
  deliberate and safe.
- The preview's swatch identities are now IN scope: every app's `.theme-swatch`
  buttons take the preview's always-self-colored look (selectors are prefixed
  with `html ` so the transcription outranks the apps' structural swatch CSS,
  which loads after themes.css). The default swatch has no preview identity and
  gets a neutral `--sw` fill from SUITE GLUE.
- The Triglavian singularity + em-trig are header-centered (`left:50%`), exactly
  as in the preview — v2's right-aligned placement was an adaptation and is gone.
- **Industry Blueprint Library exception**: the Library renders up to ~5,000
  `.bp-card.card` entries from the SDE. It renders in chunks of 120 with a
  "Show more" button, filters/search apply at the data level before rendering,
  and both the theme layer (`.card:not(.bp-card)` in DERIVED EXTRAS) and
  themes.js skip the heavy per-card treatment there — Library cards stay
  palette-themed via variables only. Harness section 7 locks this in.
- Body pseudo-elements stay untouched (several APP LOOKS already claim them); all
  faction atmosphere rides the injected `.thm-overlay` instead. Masthead decor rides
  the injected `.thm-halo` rather than header pseudos for the same reason.

## Tooling

- `partition_css.py` — the splitter that produced this architecture. Classifies every
  CSS declaration as STRUCT (stays in app) or LOOK (moves to themes.css, selector
  prefixed with `html[data-app="…"]`), preserving cascade order, with declaration
  accounting so nothing is lost. Reusable if you add a new app: partition its CSS and
  append the LOOK output as a new APP LOOK section (before FACTION THEMES).
- `build_faction_layer.py` — generates the FACTION THEMES layer from
  `faction-themes-preview.html` (see layer 4 above). Idempotent; run it after
  any preview edit.
- `verify_preview_parity.py` — proves the transcription: re-extracts every
  preview token, applies the same selector mapping, and asserts each appears
  in themes.css with byte-identical declarations (402/402 at build time).
- `test_theme.js` — jsdom regression harness v3. Run it **inside this folder**:
  `node test_theme.js` (or `SUITE_DIR=path node test_theme.js`), jsdom required.
  Sections: (1) boots every app under a preset faction, zero JS errors tolerated;
  (2) exercises the index swatch switcher incl. localStorage round-trip;
  (3) themes.css v3 signature checks (per-faction elaborate markers, `--rail-text`
  ×5, `.thm-*` styling, the v3 transcription marker + SUITE GLUE, per-faction
  input/selection coverage, textarea DERIVED EXTRAS, mapped swatch identities,
  Cinzel Decorative in the fonts import, brace balance) plus per-app link/hook
  checks; (4) data-app identities;
  (5) wireframe purity (no look properties outside keyframes in any app);
  (6) decor runtime — static injection after DOMContentLoaded (rails, overlay,
  halo + em-gal, em-trig first header child, five creed spans, swatch i/tag),
  idempotency across double inclusion, **body-wipe resilience** (chrome
  re-injection after an app clears `body.innerHTML`), and MutationObserver
  decoration of dynamically rendered cards/panels/headers.
