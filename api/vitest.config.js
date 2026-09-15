import { defineConfig } from 'vitest/config'

// Explicit config so Vitest doesn't walk up to the repo-root vite.config.js
// (a React/Tailwind config for the front end, whose plugins aren't installed
// here in api/node_modules).
export default defineConfig({
  test: {
    environment: 'node',
  },
})
