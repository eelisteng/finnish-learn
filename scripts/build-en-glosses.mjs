/**
 * Build the Chinese -> English gloss cache used by scripts/import-a1-b1.mjs.
 *
 *   node scripts/build-en-glosses.mjs            # fill missing entries
 *   node scripts/build-en-glosses.mjs --report  # coverage only, no network
 *
 * The workbook supplies Chinese glosses only. English is required by the app's
 * meaning-language switch, so it is machine-assisted here and written to a
 * reviewable CSV cache. Every generated gloss is tagged "auto-derived" in the
 * content pack; data/import/en-overrides.tsv holds hand-checked replacements.
 *
 * The cache is committed to the repo, so normal builds need NO network access.
 * Re-running only translates strings that are not cached yet.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCSV, serializeCSV } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const importDir = join(root, 'data', 'import')
const CACHE = join(importDir, 'en-glosses.csv')
const OVERRIDES = join(importDir, 'en-overrides.tsv')
const ENDPOINT = 'https://api.mymemory.translated.net/get'
const DELIM = ' ||| '
const MAX_Q_BYTES = 420

const read = (file) => parseCSV(readFileSync(join(importDir, file), 'utf8')).rows
const words = read('words.csv')
const expressions = read('expressions.csv')
const sentences = read('sentences.csv')
const dialogues = read('dialogues.csv')

/** Every distinct Chinese string that needs an English counterpart. */
function collectTargets() {
  const out = new Set()
  for (const r of words) {
    out.add(r['中文释义'])
    if (r['例句中文']) out.add(r['例句中文'])
  }
  for (const r of expressions) out.add(r['中文释义'])
  for (const r of sentences) out.add(r['中文翻译'])
  for (const r of dialogues) {
    for (const line of r['中文翻译'].split('\n')) out.add(line.replace(/^[AB]:\s*/, ''))
  }
  out.delete('')
  return [...out]
}

function loadCache() {
  if (!existsSync(CACHE)) return new Map()
  return new Map(parseCSV(readFileSync(CACHE, 'utf8')).rows.map((r) => [r.zh, r.en]))
}
function loadOverrides() {
  if (!existsSync(OVERRIDES)) return new Map()
  const map = new Map()
  for (const line of readFileSync(OVERRIDES, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('zh\t')) continue
    const [zh, en] = line.split('\t')
    if (zh && en) map.set(zh, en)
  }
  return map
}
const save = (map) => writeFileSync(
  CACHE,
  serializeCSV(['zh', 'en'], [...map].map(([zh, en]) => [zh, en])),
  'utf8',
)

/** Split into requests that stay inside the free endpoint's query limit. */
function batches(items) {
  const out = []
  let cur = []
  let bytes = 0
  for (const item of items) {
    const cost = Buffer.byteLength(item) + Buffer.byteLength(DELIM)
    if (cur.length && bytes + cost > MAX_Q_BYTES) { out.push(cur); cur = []; bytes = 0 }
    cur.push(item)
    bytes += cost
  }
  if (cur.length) out.push(cur)
  return out
}

async function translateBatch(items) {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', items.join(DELIM))
  url.searchParams.set('langpair', 'zh|en')
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.responseStatus !== 200) throw new Error(json.responseDetails || 'translation API error')
  const text = json.responseData?.translatedText ?? ''
  const parts = text.split(/\s*\|\|\|\s*/).map((s) => s.trim())
  if (parts.length !== items.length) {
    throw new Error(`delimiter drift: sent ${items.length}, received ${parts.length} :: ${text.slice(0, 160)}`)
  }
  return parts
}

function tidy(text, isWord) {
  let out = String(text).replace(/\s+/g, ' ').trim().replace(/[。！？!?]+$/, '')
  // Single-word glosses read better lower-case; sentence translations keep case.
  if (isWord && out && !out.includes(' ')) out = out[0].toLowerCase() + out.slice(1)
  return out
}

async function main() {
  const targets = collectTargets()
  const cache = loadCache()
  const overrides = loadOverrides()
  for (const [zh, en] of overrides) cache.set(zh, en)
  const missing = targets.filter((zh) => !cache.has(zh))
  const isWord = new Set(words.map((r) => r['中文释义']))
  console.log(`Chinese strings: ${targets.length} | cached: ${targets.length - missing.length} | missing: ${missing.length}`)
  if (process.argv.includes('--report')) return
  if (!missing.length) { save(cache); return }

  const groups = batches(missing)
  console.log(`Fetching ${groups.length} batches (max ${MAX_Q_BYTES} bytes of source text each)…`)
  let done = 0
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    try {
      const parts = await translateBatch(group)
      group.forEach((zh, k) => cache.set(zh, tidy(parts[k], isWord.has(zh) && !expressions.some((r) => r['中文释义'] === zh))))
      done += group.length
      if ((i + 1) % 10 === 0 || i === groups.length - 1) console.log(`  ${i + 1}/${groups.length} batches | ${done} strings cached`)
    } catch (err) {
      console.error(`  batch ${i + 1} failed: ${err.message}`)
      // Persist everything translated so far; a later run resumes from here.
      save(cache)
      process.exitCode = 1
      return
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  save(cache)
  console.log(`Cached ${cache.size} translations -> ${CACHE}`)
  const stillMissing = targets.filter((zh) => !cache.has(zh))
  if (stillMissing.length) {
    console.error(`  ${stillMissing.length} string(s) still missing; add them to en-overrides.tsv`)
    process.exitCode = 1
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
