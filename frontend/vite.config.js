import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Z: drive / network filesystems can break native fs.watch (EISDIR/EPERM).
    // Polling is slower but stable on Windows shares and mapped drives.
    watch: {
      usePolling: true,
      interval: 250,
    },
  },
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
      // Do NOT mangle top-level names. The project has many `let` declarations
      // for shared module-level state (e.g. _fundRates, _oiDelta, _rt) that
      // are accessed from functions defined elsewhere in the same module.
      // Mangling those names with toplevel:true previously caused
      // "Cannot access 'k1' before initialization" ReferenceErrors in the
      // production build, because terser can hoist/rewrite code in a way
      // that places a reference before its `let` declaration.
      mangle: { toplevel: false, reserved: ['S','_lastDrawSym','_undoSymOrder','_redoSymOrder','_anyChartPanning','_panEndTimer','_deferredRenderNeeded','_panOverlayRaf'] },
    }
  }
})
