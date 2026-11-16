/**
 * Snapshot the source workbook into reviewable, diffable CSV files.
 *
 *   node scripts/export-sheets.mjs [path/to/workbook.xlsx]
 *
 * The binary workbook is deliberately kept in data/import/ as the provenance
 * original, but the build pipeline only ever reads the six UTF-8 CSV snapshots.
 * That keeps git diffs readable and means editors never have to open Excel.
 *
 * SOURCE.txt is intentionally deterministic: it records a content hash instead
 * of a wall-clock timestamp, so `regenerate -> git diff` is a real check that
 * nothing drifted, not a guaranteed one-line change.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readWorkbook } from './xlsx-read.mjs'
import { serializeCSV } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const importDir = join(root, 'data', 'import')
const source = process.argv[2] ?? join(importDir, 'finnish_A1-B1_vocabulary_database.xlsx')

const FILES = {
  'A1-B1词汇总库': 'words.csv',
  '固定表达': 'expressions.csv',
  '句子库': 'sentences.csv',
  '情景对话': 'dialogues.csv',
  '语法目录': 'grammar.csv',
  '使用说明': 'notes.csv',
}
const EXPECTED = {
  'A1-B1词汇总库': 960, '固定表达': 44, '句子库': 30,
  '情景对话': 6, '语法目录': 29, '使用说明': 9,
}

if (!existsSync(source)) {
  console.error(`Workbook not found: ${source}`)
  process.exitCode = 1
} else {
  const sheets = readWorkbook(source)
  const seen = new Set()
  for (const sheet of sheets) {
    const file = FILES[sheet.name]
    if (!file) { console.error(`  ! unexpected sheet "${sheet.name}" - skipped`); continue }
    seen.add(sheet.name)
    const expected = EXPECTED[sheet.name]
    if (sheet.rows.length !== expected) {
      throw new Error(`${sheet.name}: expected ${expected} data rows, got ${sheet.rows.length}`)
    }
    const width = sheet.header.length
    const rows = sheet.rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill('')].slice(0, width))
    writeFileSync(join(importDir, file), serializeCSV(sheet.header, rows), 'utf8')
    const nonEmpty = sheet.rows.filter((r) => r.some((c) => c !== '')).length
    console.log(`  ${file.padEnd(18)} ${String(nonEmpty).padStart(4)} rows x ${width} cols  <- ${sheet.name}`)
  }
  for (const name of Object.keys(FILES)) {
    if (!seen.has(name)) throw new Error(`workbook is missing sheet "${name}"`)
  }
  writeFileSync(
    join(importDir, 'SOURCE.txt'),
    `Source workbook: finnish_A1-B1_vocabulary_database.xlsx\n` +
    `Source SHA-256: ${createHash('sha256').update(readFileSync(source)).digest('hex')}\n` +
    `Sheets: ${Object.entries(EXPECTED).map(([k, v]) => `${k} (${v})`).join(', ')}\n` +
    `CEFR note: the workbook's 等级核验 column says 建议等级，非官方逐词CEFR定级.\n` +
    `  Neither CEFR nor YKI publishes an official per-word word list; levels here are in-house suggestions.\n` +
    `Third-party data: data/import/kotus-sanalista-2024.tsv and yle-frequency-2011-2024.tsv\n` +
    `  are redistributed under CC BY 4.0. Required attribution is in data/import/KOTUS-NOTICE.txt\n` +
    `  and data/sources.json. Do not remove that notice from a public deployment.\n` +
    `Regenerate with: node scripts/export-sheets.mjs\n` +
    `Then: node scripts/build-en-glosses.mjs && node scripts/import-a1-b1.mjs\n`,
    'utf8',
  )
  console.log(`Snapshots written to ${importDir}`)
}
