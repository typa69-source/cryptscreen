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
      mangle: { toplevel: true },
    }
  }
})
