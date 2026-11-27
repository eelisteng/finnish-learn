/**
 * Fill one example sentence per word in data/words.csv.
 *
 * Sources are tried in this order, so the least edited layer wins:
 *   1. the 20 sentences that come with the source workbook
 *   2. a sentence from the existing sentence bank that contains this word
 *   3. a deterministic template built from the word's own paradigm
 *
 * A row already marked `example_source=manual` is never overwritten: this
 * keeps words.csv usable as the human proofreading layer.
 *
 *   node scripts/build-examples.mjs
 *   node scripts/build-examples.mjs --check   # fail if the CSV would drift
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { WORD_COLS, parseCSV, serializeCSV } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORDS_CSV = join(root, 'data', 'words.csv')
const SENTENCES_CSV = join(root, 'data', 'sentences.csv')
const WORKBOOK_WORDS = join(root, 'data', 'import', 'words.csv')
const check = process.argv.includes('--check')

/* English for the 20 workbook examples. The workbook only supplies Chinese,
   so these are authored once here and then travel deterministically. */
const WORKBOOK_EN = {
  'Tapaan ystäväni huomenna.': 'I will meet my friend tomorrow.',
  'Voinko saada lasin vettä?': 'Can I have a glass of water?',
  'Minulla on aika lääkärille.': 'I have an appointment with the doctor.',
  'Minä olen opiskelija.': 'I am a student.',
  'Menen tänään kouluun.': "I'm going to school today.",
  'Haluaisin vettä, kiitos.': 'I would like some water, thank you.',
  'Tarvitsen uuden kirjan.': 'I need a new book.',
  'Voitko auttaa minua?': 'Can you help me?',
  'Pidän suomalaisesta ruoasta.': 'I like Finnish food.',
  'Opiskelen suomea joka päivä.': 'I study Finnish every day.',
  'Ostan leipää ja maitoa.': 'I buy bread and milk.',
  'Paljonko tämä maksaa?': 'How much does this cost?',
  'En ymmärrä tätä sanaa.': "I don't understand this word.",
  'Missä bussipysäkki on?': 'Where is the bus stop?',
  'Juna lähtee kello kahdeksan.': 'The train leaves at eight.',
  'Tämä on hyvä mahdollisuus.': 'This is a good opportunity.',
  'Meillä on pieni ongelma.': 'We have a small problem.',
  'Löysimme ongelmaan ratkaisun.': 'We found a solution to the problem.',
  'En tule, koska olen sairas.': "I'm not coming because I'm sick.",
  'Lähden ulos, vaikka sataa.': "I'm going out even though it's raining.",
}

const norm = (v) => String(v ?? '').normalize('NFC').trim()
const lower = (v) => norm(v).toLocaleLowerCase('fi')
const firstZh = (v) => norm(v).split(/[；;]/)[0].trim()
const firstEn = (v) => norm(v).split(/[,，]/)[0].trim()
const verbEn = (v) => {
  const base = firstEn(v).replace(/^to\s+/i, '').trim()
  return lower(base) === 'be' ? 'am' : base
}
const tokensOf = (text) => norm(text).match(/[a-zäöåA-ZÄÖÅ]+/g) ?? []

function formsOf(row) {
  const out = []
  const push = (v) => { if (v) out.push(norm(v)) }
  push(row.lemma); push(row.singular); push(row.plural)
  for (const c of ['nom', 'gen', 'par', 'ine', 'ela', 'ill']) push(row[c])
  for (const k of ['presentStem', 'present1sg', 'past3sg', 'nutParticiple']) push(row[k])
  // A few lemmas are compounds; a compound token still contains the word.
  return [...new Set(out)]
}

function pickToken(row, text, loose = false) {
  const tokens = tokensOf(text)
  const forms = formsOf(row).sort((a, b) => b.length - a.length)
  for (const f of forms) {
    const hit = tokens.find((t) => lower(t) === lower(f))
    if (hit) return hit
  }
  // e.g. bussi -> bussipysäkki in the workbook example
  for (const f of forms) {
    const hit = tokens.find((t) => lower(t).includes(lower(f)))
    if (hit) return hit
  }
  if (loose) {
    // Workbook examples may use a tense the paradigm table does not list
    // (haluta -> Haluaisin, pitää -> Pidän). Match on a 3-4 letter stem.
    for (const f of forms) {
      const stem = lower(f).slice(0, 4)
      if (stem.length < 3) continue
      const hit = tokens.find((t) => lower(t).startsWith(stem))
      if (hit) return hit
    }
  }
  return null
}

function templateExample(row) {
  const lemma = norm(row.lemma)
  const zh = firstZh(row.sense_zh)
  const en = firstEn(row.sense_en)
  if (row.pos === 'verb') {
    if (/\s/.test(lemma)) {
      return { fi: `Minä haluan ${lemma}.`, zh: `我想${zh}。`, en: `I want to ${verbEn(en)}.`, token: lemma }
    }
    const form = norm(row.present1sg) || lemma
    return { fi: `Minä ${form}.`, zh: `我${zh}。`, en: `I ${verbEn(en)}.`, token: form }
  }
  if (row.pos === 'noun') {
    return { fi: `Tämä on ${lemma}.`, zh: `这是「${zh}」。`, en: `This is “${en}”.`, token: lemma }
  }
  if (row.pos === 'adjective') {
    return { fi: `Tämä on ${lemma}.`, zh: `这是${zh}的。`, en: `This is ${en}.`, token: lemma }
  }
  // Adverbs, pronouns and particles: a word-spotlight sentence is always
  // grammatical, unlike forcing them into an arbitrary subject/object frame.
  return {
    fi: `Sana “${lemma}” on tärkeä.`,
    zh: `「${lemma}」这个词很重要。`,
    en: `The word “${lemma}” is important.`,
    token: lemma,
  }
}

const words = parseCSV(readFileSync(WORDS_CSV, 'utf8'))
const sentences = parseCSV(readFileSync(SENTENCES_CSV, 'utf8')).rows
const workbook = parseCSV(readFileSync(WORKBOOK_WORDS, 'utf8')).rows
const workbookByLemma = new Map()
for (const r of workbook) {
  const fi = norm(r['芬兰语例句'])
  if (!fi) continue
  workbookByLemma.set(lower(r['芬兰语词条']), {
    fi,
    zh: norm(r['例句中文']),
    en: WORKBOOK_EN[fi] ?? '',
  })
}

const tally = { workbook: 0, sentence: 0, template: 0, manual: 0 }
const rows = words.rows.map((row) => {
  if (row.example_fi && row.example_source === 'manual') {
    tally.manual++
    return row
  }
  let example = null
  const wb = workbookByLemma.get(lower(row.lemma))
  if (wb && wb.zh && wb.en) {
    const token = pickToken(row, wb.fi, true) ?? norm(row.lemma)
    example = { ...wb, token, source: 'workbook', reviewStatus: 'human-reviewed' }
  } else {
    let best = null
    for (const s of sentences) {
      const token = pickToken(row, s.fiText)
      if (!token) continue
      const whole = formsOf(row).some((f) => lower(f) === lower(token))
      const score = (lower(token) === lower(row.lemma) ? 0 : whole ? 2 : 6) + s.fiText.length / 1000
      if (!best || score < best.score) best = { score, token, s }
    }
    if (best) {
      example = {
        fi: norm(best.s.fiText), zh: norm(best.s.zhText), en: norm(best.s.enText),
        token: best.token, source: 'sentence', reviewStatus: 'human-reviewed',
      }
    } else {
      example = { ...templateExample(row), source: 'template', reviewStatus: 'auto-derived' }
    }
  }
  tally[example.source]++
  return {
    ...row,
    example_fi: example.fi,
    example_zh: example.zh,
    example_en: example.en,
    example_token: example.token,
    example_source: example.source,
    example_reviewStatus: example.reviewStatus,
  }
})

for (const row of rows) {
  if (!lower(row.example_fi).includes(lower(row.example_token))) {
    throw new Error(`${row.id}: example token "${row.example_token}" is not in "${row.example_fi}"`)
  }
}

const text = serializeCSV(WORD_COLS, rows.map((r) => WORD_COLS.map((c) => String(r[c] ?? ''))))
if (check) {
  const current = readFileSync(WORDS_CSV, 'utf8')
  if (current !== text) {
    console.error('FAIL examples drift: run node scripts/build-examples.mjs')
    process.exitCode = 1
  } else {
    console.log('Examples up to date')
  }
} else {
  writeFileSync(WORDS_CSV, text, 'utf8')
  console.log(`Wrote ${rows.length} word examples: ${JSON.stringify(tally)}`)
}
