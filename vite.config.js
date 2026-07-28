import { defineConfig } from 'vite';
import { resolve }      from 'path';

/**
 * EVE Suite — Vite configuration
 *
 * Multi-page app: one entry point per tool HTML file.
 * The shared core modules (src/core/*.js) are auto-split into a vendor chunk
 * by Rollup's manualChunks so every tool page loads one shared bundle rather
 * than re-bundling the same code.
 *
 * Path alias
 * ──────────
 * Import from '@core/...' anywhere in src/ instead of relative ../../:
 *   import { fmtISK } from '@core/format.js';
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
    },
  },

  build: {
    outDir:   'dist',
    emptyOutDir: true,

    rollupOptions: {
      // ── Entry points — one per tool page ────────────────────────────────
      input: {
        index:    resolve(__dirname, 'src/tools/index/index.html'),
        colonies: resolve(__dirname, 'src/tools/colonies/index.html'),
        briefing: resolve(__dirname, 'src/tools/briefing/index.html'),
        academy:  resolve(__dirname, 'src/tools/academy/index.html'),
        clones:   resolve(__dirname, 'src/tools/clones/index.html'),
        contracts:resolve(__dirname, 'src/tools/contracts/index.html'),
        treasury: resolve(__dirname, 'src/tools/treasury/index.html'),
        mining:   resolve(__dirname, 'src/tools/mining/index.html'),
        holdings: resolve(__dirname, 'src/tools/holdings/index.html'),
        exchange: resolve(__dirname, 'src/tools/exchange/index.html'),
        citadel:  resolve(__dirname, 'src/tools/citadel/index.html'),
        moons:    resolve(__dirname, 'src/tools/moons/index.html'),
        hangar:   resolve(__dirname, 'src/tools/hangar/index.html'),
        lanes:    resolve(__dirname, 'src/tools/lanes/index.html'),
        chains:   resolve(__dirname, 'src/tools/chains/index.html'),
        industry: resolve(__dirname, 'src/tools/industry/index.html'),
      },

      output: {
        // ── Chunk strategy ──────────────────────────────────────────────
        manualChunks(id) {
          // All src/core/ modules → one shared 'core' chunk
          if (id.includes('/src/core/')) return 'core';

          // Large static data files → separate chunks so tools that don't
          // need them don't pay the parse cost
          if (id.includes('universe_coords')) return 'universe-coords';
          if (id.includes('universe.js'))     return 'universe';
        },

        // Human-readable chunk names in dist/assets/
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      },
    },
  },

  // ── Dev server ─────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    open: '/src/tools/index/index.html',
  },
});
