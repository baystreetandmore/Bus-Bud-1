import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // *** CHANGE TO 'public' ***
    outDir: 'public', // Tells Vite to output files to a 'public' folder
  },
})