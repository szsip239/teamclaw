#!/usr/bin/env node
/**
 * Sync pdfjs-dist library assets (build, cmaps, standard_fonts) from
 * node_modules into public/pdfjs/. The generic-viewer files
 * (viewer.html / viewer.mjs / viewer.css / locale / images / debugger.*)
 * stay vendored in public/pdfjs/web/ — npm does not ship them.
 *
 * Runs automatically on `postinstall` and `prebuild`.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const src = resolve(repoRoot, 'node_modules/pdfjs-dist')
const dst = resolve(repoRoot, 'public/pdfjs')

if (!existsSync(src)) {
  console.warn('[sync-pdfjs] pdfjs-dist not installed; skipping.')
  process.exit(0)
}

// Only the build artifacts referenced by the vendored generic viewer.
const buildFiles = ['pdf.mjs', 'pdf.mjs.map', 'pdf.worker.mjs', 'pdf.worker.mjs.map']

const buildDst = resolve(dst, 'build')
await rm(buildDst, { recursive: true, force: true })
await mkdir(buildDst, { recursive: true })
for (const f of buildFiles) {
  const s = resolve(src, 'build', f)
  if (!existsSync(s)) {
    console.warn(`[sync-pdfjs] missing build file: ${f}`)
    continue
  }
  await cp(s, resolve(buildDst, f))
}
console.log(`[sync-pdfjs] build → public/pdfjs/build (${buildFiles.length} files)`)

// Whole-directory copies for cmaps and standard_fonts.
for (const name of ['cmaps', 'standard_fonts']) {
  const s = resolve(src, name)
  const d = resolve(dst, 'web', name)
  if (!existsSync(s)) {
    console.warn(`[sync-pdfjs] missing source dir: ${name}`)
    continue
  }
  await rm(d, { recursive: true, force: true })
  await cp(s, d, { recursive: true })
  console.log(`[sync-pdfjs] ${name} → public/pdfjs/web/${name}`)
}

console.log('[sync-pdfjs] done.')
