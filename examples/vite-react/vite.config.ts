import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __CLICK_TO_CODE_PROJECT_ROOT__: JSON.stringify(
      command === 'serve' ? process.cwd() : '',
    ),
  },
}))
