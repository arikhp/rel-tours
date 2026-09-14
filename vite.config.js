import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The site is served from https://arikhp.github.io/rel-tours/, so every asset URL
// needs that prefix. Override with BASE_PATH=/ when serving from a domain root
// (a custom domain, or local `vite preview`).
const base = process.env.BASE_PATH ?? '/rel-tours/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
