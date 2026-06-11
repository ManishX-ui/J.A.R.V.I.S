import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'transform-jsx-in-js',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.match(/src[\\/].*\.js$/)) return null

        return transformWithOxc(code, id, {
          lang: 'jsx',
        })
      },
    },
    react(),
  ],
})
