import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

let commit = 'dev'
let commitFull = 'dev'
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
  commitFull = execSync('git rev-parse HEAD').toString().trim()
} catch {}

const buildDate = new Date().toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__:  JSON.stringify(commit),
    __APP_COMMIT_FULL__: JSON.stringify(commitFull),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
  },
})
