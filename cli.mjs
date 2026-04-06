#!/usr/bin/env node
/**
 * uri-snapshot CLI
 *
 * Usage:
 *   uri-snapshot --config snapshot.config.mjs
 *   uri-snapshot --targets targets.json --out ./public/previews [options]
 *
 * Options:
 *   --config <file>       JS/MJS config file exporting a default SnapshotOptions object
 *   --targets <file>      JSON file: [{ id, url }]
 *   --out <dir>           Output directory (default: ./previews)
 *   --format <fmt>        png|webp|jpeg (default: png)
 *   --viewport <WxH>      e.g. 1200x630 (default: 1200x630)
 *   --timeout <ms>        Per-page timeout (default: 15000)
 *   --wait-until <event>  load|networkidle|domcontentloaded (default: load)
 *   --full-page           Capture full page height
 *   --results <file>      Write JSON results to file
 *   --help                Show this help
 */

import { parseArgs } from 'util'
import { resolve } from 'path'
import { snapshot, loadTargets, writeResults } from './index.mjs'

const { values: args } = parseArgs({
  options: {
    config:     { type: 'string' },
    targets:    { type: 'string' },
    out:        { type: 'string',  default: './previews' },
    format:     { type: 'string',  default: 'png' },
    viewport:   { type: 'string',  default: '1200x630' },
    timeout:    { type: 'string',  default: '15000' },
    'wait-until': { type: 'string', default: 'load' },
    'full-page':  { type: 'boolean', default: false },
    results:    { type: 'string' },
    help:       { type: 'boolean', default: false },
  },
  strict: false,
})

if (args.help) {
  console.log((await import('fs')).readFileSync(new URL(import.meta.url), 'utf-8').match(/\/\*\*([\s\S]*?)\*\//)[0])
  process.exit(0)
}

// Config file takes full precedence
let opts = {}
if (args.config) {
  const configPath = resolve(args.config)
  const mod = await import(configPath)
  opts = mod.default ?? mod
} else {
  if (!args.targets) {
    console.error('Error: --config or --targets is required')
    process.exit(1)
  }

  const [w, h] = args.viewport.split('x').map(Number)

  opts = {
    targets:   await loadTargets(args.targets),
    outDir:    args.out,
    format:    args.format,
    viewport:  { width: w, height: h },
    timeout:   Number(args.timeout),
    waitUntil: args['wait-until'],
    fullPage:  args['full-page'],
  }
}

opts.onProgress = (r) => {
  const icon = r.status === 'ok' ? '\u2713' : '\u2717'
  const detail = r.status === 'ok' ? r.outPath : r.error
  console.log(`${icon} [${r.id}] ${detail} (${r.durationMs}ms)`)
}

console.log(`\nuri-snapshot: capturing ${opts.targets.length} target(s) \u2192 ${opts.outDir}\n`)

const results = await snapshot(opts)

const ok = results.filter(r => r.status === 'ok').length
const fail = results.filter(r => r.status === 'error').length
console.log(`\nDone: ${ok} ok, ${fail} failed`)

if (args.results) {
  await writeResults(results, args.results)
  console.log(`Results written to ${args.results}`)
}

if (fail > 0) process.exit(1)
