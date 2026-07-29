#!/usr/bin/env node
// zeus build scans every .js file under the project root, including test/ and
// vitest.config.js. Top-level await in the tests and vite's bundled output both
// crash zeus's internal bundler, which then reports a useless "package name is
// undefined" error. Move the test tooling out of the way for the duration of
// the build, then always put it back.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const moves = [
  { from: path.join(projectRoot, 'test'), to: null },
  { from: path.join(projectRoot, 'vitest.config.js'), to: null },
]

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-build-'))

function moveAside() {
  for (const entry of moves) {
    if (!fs.existsSync(entry.from)) continue
    entry.to = path.join(stagingDir, path.basename(entry.from))
    fs.renameSync(entry.from, entry.to)
  }
}

function restore() {
  for (const entry of moves) {
    if (!entry.to) continue
    fs.renameSync(entry.to, entry.from)
    entry.to = null
  }
  fs.rmSync(stagingDir, { recursive: true, force: true })
}

moveAside()
let result
try {
  result = spawnSync('zeus', ['build', ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  })
} finally {
  restore()
}

process.exit(result.status === null ? 1 : result.status)
