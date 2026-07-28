# EVE Suite

Browser-based tool suite for EVE Online, built with vanilla JS ES modules and [Vite](https://vitejs.dev).

## Project layout

```
eve-suite/
├── src/
│   ├── core/               ← shared runtime (auth, ESI client, formatting…)
│   │   ├── index.js        ← barrel re-export of the whole core
│   │   ├── constants.js    ← all localStorage keys, URLs, scope catalogue
│   │   ├── format.js       ← fmtISK, fmtDur, fmtInt, esc, $ …
│   │   ├── storage.js      ← roster load/save, section visibility, dashboard
│   │   ├── esi-client.js   ← esiFetch / esiGet / esiPost / getTok / resolveNames
│   │   ├── auth.js         ← PKCE login flow, JWT decode, scope audit
│   │   └── roster.js       ← pilot-strip and roster panel rendering
│   ├── assets/
│   │   ├── themes.css      ← faction theme stylesheet
│   │   ├── themes.js       ← theme decorator (MutationObserver injector)
│   │   ├── universe.js     ← static universe graph data
│   │   └── universe_coords.js
│   └── tools/
│       ├── index/          ← hub / roster / OAuth callback
│       ├── industry/       ← Industry Foundry
│       ├── colonies/       ← Colony Orbit (PI)
│       ├── briefing/       ← Command Briefing
│       └── …               ← one folder per tool
├── vite.config.js
└── package.json
```

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production output → dist/
npm run preview    # serve dist/ locally
```

## EVE SSO configuration

1. Register **one** EVE Developer application at <https://developers.eveonline.com>  
   - Callback URL: `https://<your-github-username>.github.io/<repo-name>/` (or `http://localhost:5173/` for dev)  
   - Scopes: the active ones listed in `src/core/constants.js → SCOPE_INFO`

2. Set `SUITE_CLIENT_ID` in `src/tools/index/index.html` (or via a `.env` file — see `src/core/auth.js`).

Sign-in happens **only** in `index.html`. Every other tool reads the pre-authenticated characters from `localStorage` (`eve_suite_chars`) and refreshes tokens as needed via `src/core/esi-client.js`.

## Importing shared code

```js
// Granular — preferred for tree-shaking
import { fmtISK, fmtDur }   from '@core/format.js';
import { esiGet, getTok }    from '@core/esi-client.js';
import { loadChars }         from '@core/storage.js';

// Or the barrel export
import { fmtISK, esiGet, loadChars } from '@core';
```

## Migration status

| Module | Status |
|---|---|
| `src/core/constants.js` | ✅ done |
| `src/core/format.js`    | ✅ done |
| `src/core/storage.js`   | ✅ done |
| `src/core/esi-client.js`| ✅ done |
| `src/core/auth.js`      | ✅ done |
| `src/core/roster.js`    | ✅ done |
| `src/tools/index/`      | ✅ done |
| `src/tools/colonies/`   | ✅ done |
| `src/tools/industry/`   | 🔲 next |
| *(other tools)*         | 🔲 pending |
| *(other tools)*         | 🔲 pending |
