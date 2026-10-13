import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // chemins relatifs : le site fonctionne depuis n'importe quel dossier d'hébergement
  base: './',
})
