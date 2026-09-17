#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REL-11 SPIKE — fixture collection script
 *
 * Hits the three candidate Travelpayouts Data API endpoints for a handful of
 * routes and saves the raw JSON responses next to this file, so the rest of
 * Epic 2 can be designed against observed responses instead of documentation
 * assumptions. Not part of the test suite — run manually:
 *
 *   node api/test/fixtures/collect-fixtures.mjs
 *
 * Reads TRAVELPAYOUTS_TOKEN out of api/.dev.vars (gitignored, never printed
 * or embedded in output). No new dependency: .dev.vars is parsed by hand
 * since neither `dotenv` nor anything similar is already a dependency
 * anywhere in this repo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devVarsPath = path.join(__dirname, '..', '..', '.dev.vars')

function parseDevVars(text) {
  const vars = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return vars
}

const vars = parseDevVars(readFileSync(devVarsPath, 'utf8'))
const TOKEN = vars.TRAVELPAYOUTS_TOKEN
if (!TOKEN) {
  throw new Error('TRAVELPAYOUTS_TOKEN not found in api/.dev.vars')
}

const BASE = 'https://api.travelpayouts.com'
const OUT_DIR = __dirname

async function callAndSave(filename, urlPath, params) {
  const url = new URL(BASE + urlPath)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const requestUrl = url.toString()
  let status
  let body
  try {
    const res = await fetch(requestUrl, { headers: { 'X-Access-Token': TOKEN, Accept: 'application/json' } })
    status = res.status
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  } catch (err) {
    status = null
    body = { fetchError: String(err) }
  }

  const record = {
    requestUrl,
    status,
    fetchedAt: new Date().toISOString(),
    body,
  }
  const outPath = path.join(OUT_DIR, filename)
  writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8')
  console.log(`${status}  ${filename}  <-  ${requestUrl.replace(/X-Access-Token=[^&]+/, 'X-Access-Token=<redacted>')}`)
  return record
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const calls = [
    // ── /v1/prices/calendar — cheapest per day for a month ──────────────────
    ['calendar-tlv-bcn-2026-10.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'BCN', depart_date: '2026-10' }],
    ['calendar-tlv-bcn-2026-11.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'BCN', depart_date: '2026-11' }],
    ['calendar-tlv-bcn-2026-12.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'BCN', depart_date: '2026-12' }],
    ['calendar-tlv-bcn-2026-11-length7.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'BCN', depart_date: '2026-11', length: '7' }],
    ['calendar-tlv-tyo-2026-11.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'TYO', depart_date: '2026-11' }],
    ['calendar-tlv-lca-2026-11.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'LCA', depart_date: '2026-11' }],
    ['calendar-tlv-uln-2026-11.json', '/v1/prices/calendar', { origin: 'TLV', destination: 'ULN', depart_date: '2026-11' }],

    // ── /v2/prices/latest — up to 1000 rows in one call ──────────────────────
    ['latest-tlv-bcn.json', '/v2/prices/latest', { origin: 'TLV', destination: 'BCN', currency: 'usd', limit: '30' }],
    ['latest-tlv-bcn-tripduration7.json', '/v2/prices/latest', { origin: 'TLV', destination: 'BCN', currency: 'usd', trip_duration: '7', limit: '30' }],
    ['latest-tlv-tyo.json', '/v2/prices/latest', { origin: 'TLV', destination: 'TYO', currency: 'usd', limit: '30' }],
    ['latest-tlv-lca.json', '/v2/prices/latest', { origin: 'TLV', destination: 'LCA', currency: 'usd', limit: '30' }],
    ['latest-tlv-uln.json', '/v2/prices/latest', { origin: 'TLV', destination: 'ULN', currency: 'usd', limit: '30' }],

    // ── /v2/prices/week-matrix — prices around a target date pair ───────────
    ['week-matrix-tlv-bcn.json', '/v2/prices/week-matrix', { origin: 'TLV', destination: 'BCN', depart_date: '2026-11-15', currency: 'usd' }],
    ['week-matrix-tlv-tyo.json', '/v2/prices/week-matrix', { origin: 'TLV', destination: 'TYO', depart_date: '2026-11-15', currency: 'usd' }],
    ['week-matrix-tlv-lca.json', '/v2/prices/week-matrix', { origin: 'TLV', destination: 'LCA', depart_date: '2026-11-15', currency: 'usd' }],
  ]

  for (const [filename, urlPath, params] of calls) {
    await callAndSave(filename, urlPath, params)
    await sleep(300) // be polite — this is a spike, not a load test
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
