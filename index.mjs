/**
 * @todie/uri-snapshot
 * Playwright-based URI preview screenshot library for CI/CD pipelines.
 *
 * Usage:
 *   import { snapshot } from '@todie/uri-snapshot'
 *   await snapshot({ targets, outDir, ... })
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

/**
 * @typedef {Object} SnapshotTarget
 * @property {string} id        - Filename stem (e.g. "nahbro" → "nahbro.png")
 * @property {string} url       - URL to screenshot
 * @property {Object} [clip]    - Optional {x,y,width,height} clip region
 * @property {number} [timeout] - Per-target timeout override (ms)
 */

/**
 * @typedef {Object} SnapshotOptions
 * @property {SnapshotTarget[]} targets         - List of targets to capture
 * @property {string}           outDir          - Output directory path
 * @property {{ width: number, height: number }} [viewport]  - Default: 1200x630
 * @property {'png'|'webp'|'jpeg'} [format]    - Default: 'png'
 * @property {number}           [quality]       - JPEG/WebP quality 0-100. Default: 90
 * @property {number}           [timeout]       - Global timeout per page ms. Default: 15000
 * @property {'networkidle'|'load'|'domcontentloaded'} [waitUntil] - Default: 'load'
 * @property {boolean}          [fullPage]      - Capture full page height. Default: false
 * @property {(result: SnapshotResult) => void} [onProgress] - Progress callback
 */

/**
 * @typedef {Object} SnapshotResult
 * @property {string}  id
 * @property {string}  url
 * @property {'ok'|'error'} status
 * @property {string}  [outPath]
 * @property {string}  [error]
 * @property {number}  durationMs
 */

const DEFAULTS = {
  viewport: { width: 1200, height: 630 },
  format: 'png',
  quality: 90,
  timeout: 15000,
  waitUntil: 'load',
  fullPage: false,
}

/**
 * Capture screenshots for a list of URL targets.
 *
 * @param {SnapshotOptions} options
 * @returns {Promise<SnapshotResult[]>}
 */
export async function snapshot(options) {
  const opts = { ...DEFAULTS, ...options }
  const outDir = resolve(opts.outDir)

  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const results = []

  for (const target of opts.targets) {
    const start = Date.now()
    const outPath = join(outDir, `${target.id}.${opts.format}`)
    const timeout = target.timeout ?? opts.timeout

    try {
      const page = await browser.newPage()
      await page.setViewportSize(opts.viewport)

      await page.goto(target.url, {
        waitUntil: opts.waitUntil,
        timeout,
      })

      const screenshotOpts = {
        path: outPath,
        type: opts.format,
        fullPage: opts.fullPage,
        ...(opts.format !== 'png' ? { quality: opts.quality } : {}),
        ...(target.clip ? { clip: target.clip } : {}),
      }

      await page.screenshot(screenshotOpts)
      await page.close()

      const result = { id: target.id, url: target.url, status: 'ok', outPath, durationMs: Date.now() - start }
      results.push(result)
      opts.onProgress?.(result)
    } catch (err) {
      const result = { id: target.id, url: target.url, status: 'error', error: err.message, durationMs: Date.now() - start }
      results.push(result)
      opts.onProgress?.(result)
    }
  }

  await browser.close()
  return results
}

/**
 * Load targets from a JSON file.
 * Expected format: [{ "id": "...", "url": "..." }, ...]
 *
 * @param {string} filePath
 * @returns {Promise<SnapshotTarget[]>}
 */
export async function loadTargets(filePath) {
  const { readFile } = await import('fs/promises')
  const raw = await readFile(resolve(filePath), 'utf-8')
  return JSON.parse(raw)
}

/**
 * Write a results summary JSON file.
 *
 * @param {SnapshotResult[]} results
 * @param {string} outPath
 */
export async function writeResults(results, outPath) {
  await writeFile(resolve(outPath), JSON.stringify(results, null, 2))
}
