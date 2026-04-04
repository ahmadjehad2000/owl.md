#!/usr/bin/env node
// Strips ELECTRON_RUN_AS_NODE from the process environment before electron-vite
// starts so that Electron's renderer/preload child processes never inherit it.
// (Claude Code sets this flag globally; without stripping it here, the preload's
//  require("electron") resolves to the npm path-string shim instead of the real
//  Electron API, leaving window.owl undefined in the renderer.)
delete process.env.ELECTRON_RUN_AS_NODE

import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bin = resolve(__dirname, '../node_modules/.bin/electron-vite')

const result = spawnSync(bin, ['dev'], { stdio: 'inherit', env: process.env })
process.exit(result.status ?? 0)
