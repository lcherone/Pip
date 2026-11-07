import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main.ts'),
      },
      rollupOptions: {
        output: { entryFileNames: 'index.js' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload.ts'),
      },
      rollupOptions: {
        output: { entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          pet: resolve('src/renderer/pet/index.html'),
          settings: resolve('src/renderer/settings/index.html'),
          playground: resolve('src/renderer/playground/index.html'),
          conversation: resolve('src/renderer/conversation/index.html'),
        },
      },
    },
  },
})
