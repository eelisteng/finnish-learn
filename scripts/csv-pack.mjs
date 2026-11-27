/**
 * CSV <-> JSON bridge for the content pack.
 *
 * The JSON pack is the only runtime format (nested senses / case tables / gloss
 * alignment cannot be expressed in a browser-loadable flat file). CSV is an
 * EDITING layer: open it in Excel/Numbers, proofread Finnish forms and Chinese
 * glosses, then feed it back into the build.
 *
 *   node scripts/csv-pack.mjs export       # JSON pack -> data/words.csv + data/sentences.csv (UTF-8 BOM)
 *   node scripts/csv-pack.mjs check        # validate CSV only, write nothing
 *   node scripts/csv-pack.mjs import       # CSV -> data/packs/a1-core.json
 *   node scripts/csv-pack.mjs --self-test  # in-memory round-trip + negative cases
 *
 * After editing CSV, always run:
 *   node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test
 *
 * One CSV row is one production unit: gloss, morphology, illustration and
 * audio clip are all declared here. The new image_* and audio_* columns
 * carry the asset path, provenance (source + license) and human-review state;
 * a declared file must physically exist, otherwise the build refuses to write.
 * An empty audio_file means "no clip yet" and the app falls back to browser TTS.
 *
 * build-content.mjs also applies the CSV automatically, so the CSV stays the
 * authoritative editing layer even when the seed file is rebuilt from scratch.
 * Adding rows in CSV appends words; removing rows does NOT delete them (delete
 * from data/content-source.mjs instead, then re-export).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PACK_PATH = join(root, 'data', 'packs', 'a1-core.json')
export const WORDS_CSV = join(root, 'data', 'words.csv')
export const SENTENCES_CSV = join(root, 'data', 'sentences.csv')

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const POS = ['noun', 'verb', 'adjective', 'pronoun', 'numeral', 'adverb', 'particle']
const POS_ZH = { noun: '名词', verb: '动词', adjective: '形容词', pronoun: '代词', numeral: '数词', adverb: '副词', particle: '小品词' }
const BASIC_CASES = ['nom', 'gen', 'par', 'ine', 'ela', 'ill']
const CASE_CEFR = {
  nom: 'A1', gen: 'A1', par: 'A1', ine: 'A1', ela: 'A1', ill: 'A1',
  ade: 'A2', abl: 'A2', all: 'A2', ess: 'A2', tra: 'A2', acc: 'A2',
  ins: 'B1', abe: 'B1', com: 'B1',
}
const CASE_LABEL = {
  nom: '主格 nominatiivi', gen: '属格 genetiivi', par: '部分格 partitiivi',
  ine: '内格 inessiivi', ela: '出格 elatiivi', ill: '入格 illatiivi',
  ade: '接格 adessiivi', abl: '离格 ablatiivi', all: '向格 allatiivi',
  ess: '样格 essiivi', tra: '转格 translatiivi', acc: '宾格 akkusatiivi',
  ins: '具格 instruktiivi', abe: '欠格 abessiivi', com: '共格 komitatiivi',
}
const REVIEW_STATES = ['auto-derived', 'human-reviewed', 'csv-authored']
/** Shared by illustrations and audio clips: a produced asset stays pending
    until a human has actually looked at / listened to it. */
export const ASSET_REVIEW_STATES = ['pending', 'human-verified']
export const AUDIO_SOURCES = ['tts', 'human', 'other']
export const AUDIO_DIR = 'assets/audio/'
export const AUDIO_EXTS = ['mp3', 'ogg', 'm4a', 'wav', 'webm']
export const AUDIO_COLS = ['audio_file', 'audio_source', 'audio_license', 'audio_duration', 'audio_reviewStatus']

/* One CSV row is one complete production unit: gloss + morphology + image
   + audio + review state. Files are declared here, never inside app/*.js. */
export const WORD_COLS = [
  'id', 'lemma', 'pos', 'cefr', 'topicId', 'ipa',
  'sense_zh', 'sense_en',
  'image_path', 'image_status', 'image_source', 'image_license', 'image_reviewStatus', 'motif',
  'singular', 'plural',
  'nom', 'gen', 'par', 'ine', 'ela', 'ill',
  'suffix_gen', 'suffix_par', 'suffix_ine', 'suffix_ela', 'suffix_ill',
  'stem_strong', 'stem_weak', 'gradation', 'harmony', 'kotusType', 'declensionClass',
  'verbType', 'infinitiveEnding', 'presentStem', 'present1sg', 'past3sg', 'nutParticiple', 'irregular',
  'reviewStatus',
  'example_fi', 'example_zh', 'example_en', 'example_token', 'example_source', 'example_reviewStatus',
  ...AUDIO_COLS,
]
export const SENTENCE_COLS = ['id', 'fiText', 'zhText', 'enText', 'cefr', 'grammarPoints', 'gloss', ...AUDIO_COLS]

/** Build the audio object shared by words and sentences. Absence of a file
    means no audio entry at all, so the app falls back to browser TTS. */
export function audioFromRow(row) {
  if (!row.audio_file) return null
  return {
    path: row.audio_file,
    source: row.audio_source,
    license: row.audio_license,
    durationSec: row.audio_duration === '' || row.audio_duration == null ? null : Number(row.audio_duration),
    reviewStatus: row.audio_reviewStatus || 'pending',
  }
}
export function audioToRow(audio) {
  return {
    audio_file: audio?.path ?? '',
    audio_source: audio?.source ?? '',
    audio_license: audio?.license ?? '',
    audio_duration: audio?.durationSec ?? '',
    audio_reviewStatus: audio?.reviewStatus ?? '',
  }
}

/* ── RFC 4180-ish CSV (quotes, embedded commas, CRLF, UTF-8 BOM) ───────── */
export function parseCSV(text) {
  const s = String(text).replace(/^\uFEFF/, '')
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\r') { /* CRLF: wait for \n */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ''))
  if (!nonEmpty.length) return { header: [], rows: [] }
  const header = nonEmpty[0].map((h) => h.trim())
  const objects = nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
  return { header, rows: objects }
}

export function serializeCSV(header, rows) {
  const q = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'
}

const str = (v) => (v === null || v === undefined ? '' : String(v))
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const bool = (v) => (v === 'true' ? true : v === 'false' ? false : null)

/* ── JSON pack -> flat CSV row ─────────────────────────────────────────── */
export function wordToRow(w) {
  const sense = w.senses?.[0] ?? {}
  const image = sense.image ?? {}
  const n = w.nominal ?? {}
  const v = w.verb ?? {}
  const byCase = Object.fromEntries((n.caseForms ?? []).map((f) => [f.case, f]))
  const row = {
    id: w.id, lemma: w.lemma, pos: w.pos, cefr: w.cefr, topicId: w.topicId, ipa: w.ipa,
    sense_zh: sense.zh, sense_en: sense.en,
    image_path: image.path, image_status: image.status,
    image_source: image.source, image_license: image.license,
    image_reviewStatus: image.reviewStatus, motif: image.motif,
    singular: w.number?.singular, plural: w.number?.plural,
    stem_strong: n.stems?.strong, stem_weak: n.stems?.weak,
    gradation: n.gradation, harmony: n.harmony,
    kotusType: n.kotusType ?? v.kotusType ?? '',
    declensionClass: n.declensionClass,
    verbType: v.verbType, infinitiveEnding: v.infinitiveEnding,
    presentStem: v.presentStem, present1sg: v.present1sg,
    past3sg: v.past3sg, nutParticiple: v.nutParticiple,
    irregular: v.irregular === undefined ? '' : str(v.irregular),
    reviewStatus: w.provenance?.reviewStatus,
    example_fi: w.example?.fi, example_zh: w.example?.zh, example_en: w.example?.en,
    example_token: w.example?.token, example_source: w.example?.source,
    example_reviewStatus: w.example?.reviewStatus,
    ...audioToRow(w.audio),
  }
  for (const c of BASIC_CASES) row[c] = byCase[c]?.form ?? ''
  for (const c of BASIC_CASES.slice(1)) row[`suffix_${c}`] = byCase[c]?.suffix ?? ''
  return row
}

export function sentenceToRow(s) {
  return {
    id: s.id, fiText: s.fiText, zhText: s.zhText, enText: s.enText, cefr: s.cefr,
    grammarPoints: (s.grammarPoints ?? []).join('|'),
    // token~senseId~caseForm | token~senseId  (empty senseId => null)
    gloss: (s.gloss ?? []).map((t) => [t.token, t.senseId ?? '', t.caseForm ?? ''].join('~')).join('|'),
    ...audioToRow(s.audio),
  }
}

/* ── flat CSV row -> JSON pack entry ──────────────────────────────────── */
function caseFormFor(base, caseId, form, suffix) {
  return {
    case: caseId,
    form,
    suffix,
    stemUsed: ['gen', 'ine', 'ela'].includes(caseId) ? 'weak' : 'strong',
    cefr: CASE_CEFR[caseId],
    label: CASE_LABEL[caseId],
    ...(base?.label ? { label: base.label } : {}),
  }
}

function blankWord(row, template) {
  const w = JSON.parse(JSON.stringify(template))
  w.id = row.id
  w.lemma = row.lemma
  w.pos = row.pos
  w.posZh = POS_ZH[row.pos] ?? row.pos
  w.cefr = row.cefr
  w.topicId = row.topicId || 'general'
  w.ipa = row.ipa
  w.senses = [{
    ...(w.senses[0] ?? {}),
    id: `${row.id}-1`,
    cefr: row.cefr,
    image: {
      ...(w.senses[0]?.image ?? {}),
      id: `img-${row.id}-1`,
      path: null, status: 'pending', motif: row.motif || 'idea',
      source: 'hand-drawn', license: 'own', reviewStatus: 'pending',
      note: '几何占位图，正式插画待生成',
    },
  }]
  w.provenance = { ...(w.provenance ?? {}), lemmaSource: 'csv', glossSource: 'csv', frequencyBand: LEVELS.indexOf(row.cefr) + 1, gradingSignals: ['frequency'], reviewStatus: 'csv-authored' }
  w.nominal = undefined
  w.verb = undefined
  w.number = undefined
  return w
}

export function applyWordRow(base, row) {
  const template = base ?? blankWord(row, {
    id: row.id, lemma: row.lemma, pos: row.pos, posZh: POS_ZH[row.pos], cefr: row.cefr,
    ipa: row.ipa, senses: [{ id: `${row.id}-1`, cefr: row.cefr, image: {} }], provenance: {},
  })
  const w = JSON.parse(JSON.stringify(template))
  w.id = row.id; w.lemma = row.lemma; w.pos = row.pos
  w.posZh = POS_ZH[row.pos] ?? row.pos
  w.cefr = row.cefr; w.topicId = row.topicId || w.topicId; w.ipa = row.ipa

  const sense = w.senses[0]
  sense.id = sense.id ?? `${row.id}-1`
  sense.cefr = row.cefr
  sense.zh = row.sense_zh
  sense.en = row.sense_en
  sense.posZh = POS_ZH[row.pos] ?? row.pos
  const image = sense.image ?? (sense.image = {})
  image.id = image.id ?? `img-${row.id}-1`
  image.path = row.image_path || null
  image.status = row.image_status || 'pending'
  image.motif = row.motif || image.motif || 'idea'
  image.altZh = `${row.sense_zh}的情境示意图`
  image.altEn = `Illustration for ${row.sense_en}`
  image.source = row.image_source || image.source || (image.status === 'ready' ? 'generated' : 'hand-drawn')
  image.license = row.image_license || image.license || 'own'
  image.reviewStatus = row.image_reviewStatus || image.reviewStatus || 'pending'
  w.provenance = { ...(w.provenance ?? {}), reviewStatus: row.reviewStatus || 'auto-derived' }
  if (row.example_fi) {
    w.example = {
      fi: row.example_fi,
      zh: row.example_zh,
      en: row.example_en,
      token: row.example_token || row.lemma,
      source: row.example_source || 'template',
      reviewStatus: row.example_reviewStatus || 'auto-derived',
    }
  } else delete w.example
  const audio = audioFromRow(row)
  if (audio) w.audio = audio
  else delete w.audio

  if (row.pos === 'verb') {
    delete w.nominal
    w.number = null
    const v = { ...(w.verb ?? {}) }
    v.verbType = Number(row.verbType)
    const kt = num(row.kotusType)
    if (kt !== null && Number.isFinite(kt)) v.kotusType = kt
    else if ('kotusType' in v) v.kotusType = null // irregular verb: keep explicit null
    else delete v.kotusType
    for (const key of ['infinitiveEnding', 'presentStem', 'present1sg', 'past3sg', 'nutParticiple']) {
      if (row[key]) v[key] = row[key]
    }
    const irregular = bool(row.irregular)
    if (irregular === null) delete v.irregular
    else v.irregular = irregular
    w.verb = v
  } else {
    delete w.verb
    w.number = { ...(w.number ?? {}), singular: row.singular, plural: row.plural, note: '主格单复数；其他格另有复数形式，见完整变格表' }
    const n = { ...(w.nominal ?? {}) }
    n.stems = { strong: row.stem_strong, weak: row.stem_weak }
    n.gradation = row.gradation || null
    n.harmony = row.harmony
    const kt = num(row.kotusType)
    n.kotusType = kt !== null && Number.isFinite(kt) ? kt : null
    n.declensionClass = row.declensionClass || n.declensionClass || ''
    const prev = Object.fromEntries((n.caseForms ?? []).map((f) => [f.case, f]))
    n.caseForms = BASIC_CASES.map((c) => caseFormFor(prev[c], c, row[c], c === 'nom' ? '—' : (row[`suffix_${c}`] || prev[c]?.suffix || '—')))
    w.nominal = n
  }
  return w
}

export function applySentenceRow(base, row) {
  const s = base ? JSON.parse(JSON.stringify(base)) : {}
  s.id = row.id; s.fiText = row.fiText; s.zhText = row.zhText; s.enText = row.enText; s.cefr = row.cefr
  s.grammarPoints = row.grammarPoints ? row.grammarPoints.split('|').filter(Boolean) : []
  s.gloss = row.gloss ? row.gloss.split('|').filter(Boolean).map((part) => {
    const [token, senseId, caseForm] = part.split('~')
    return { token, senseId: senseId || null, ...(caseForm ? { caseForm } : {}) }
  }) : []
  const audio = audioFromRow(row)
  if (audio) s.audio = audio
  else delete s.audio
  return s
}

/* ── validation ───────────────────────────────────────────────────────── */

/** An audio clip must be fully declared or fully absent. A half-filled row
    would silently ship an unplayable word and hide the missing production
    step, so both directions are rejected here. */
function validateAudioRow(row, tag) {
  const errors = []
  const filled = AUDIO_COLS.filter((c) => String(row[c] ?? '') !== '')
  if (!row.audio_file) {
    if (filled.length) errors.push(`${tag}: audio_file missing but ${filled.join(', ')} set`)
    return errors
  }
  if (!row.audio_file.startsWith(AUDIO_DIR)) {
    errors.push(`${tag}: audio_file must live under ${AUDIO_DIR}`)
  }
  if (!new RegExp(`\\.(${AUDIO_EXTS.join('|')})$`, 'i').test(row.audio_file)) {
    errors.push(`${tag}: audio_file must end with ${AUDIO_EXTS.join(' / ')}`)
  }
  if (!existsSync(join(root, row.audio_file))) {
    errors.push(`${tag}: audio file not found: ${row.audio_file}`)
  }
  if (!AUDIO_SOURCES.includes(row.audio_source)) {
    errors.push(`${tag}: audio_source must be ${AUDIO_SOURCES.join(' / ')}`)
  }
  if (!row.audio_license) errors.push(`${tag}: audio_license missing`)
  if (!ASSET_REVIEW_STATES.includes(row.audio_reviewStatus)) {
    errors.push(`${tag}: audio_reviewStatus must be ${ASSET_REVIEW_STATES.join(' / ')}`)
  }
  if (row.audio_duration !== '' && !(Number(row.audio_duration) > 0)) {
    errors.push(`${tag}: audio_duration must be a positive number of seconds`)
  }
  return errors
}

export function validateCsv(wordRows, sentenceRows, wordHeader, sentenceHeader) {
  const errors = []
  const missing = (cols, header, file) => {
    for (const c of cols) if (!header.includes(c)) errors.push(`${file}: missing column "${c}"`)
  }
  missing(WORD_COLS, wordHeader, 'words.csv')
  missing(SENTENCE_COLS, sentenceHeader, 'sentences.csv')
  if (errors.length) return errors

  const ids = new Set()
  const senseIds = new Set()
  for (const r of wordRows) {
    const tag = `words.csv/${r.id || '(empty id)'}`
    if (!r.id) errors.push(`${tag}: empty id`)
    else if (!/^[a-z0-9-]+$/.test(r.id)) errors.push(`${tag}: id must be lowercase letters/digits/hyphen`)
    else if (ids.has(r.id)) errors.push(`${tag}: duplicate id`)
    ids.add(r.id)
    senseIds.add(`${r.id}-1`)
    if (!LEVELS.includes(r.cefr)) errors.push(`${tag}: invalid cefr "${r.cefr}"`)
    if (!POS.includes(r.pos)) errors.push(`${tag}: invalid pos "${r.pos}"`)
    if (!r.ipa) errors.push(`${tag}: ipa missing`)
    if (!r.sense_zh || !r.sense_en) errors.push(`${tag}: Chinese/English gloss missing`)
    if (!REVIEW_STATES.includes(r.reviewStatus)) errors.push(`${tag}: reviewStatus must be ${REVIEW_STATES.join(' / ')}`)
    if (r.example_fi) {
      if (!r.example_zh || !r.example_en) errors.push(`${tag}: example needs zh + en translation`)
      if (!r.example_token) errors.push(`${tag}: example token missing`)
      if (!['workbook', 'sentence', 'template', 'manual'].includes(r.example_source)) {
        errors.push(`${tag}: example_source must be workbook / sentence / template / manual`)
      }
    }
    if (!['ready', 'pending'].includes(r.image_status)) errors.push(`${tag}: image_status must be ready/pending`)
    if (r.image_status === 'ready') {
      if (!r.image_path) errors.push(`${tag}: ready image needs image_path`)
      else if (!existsSync(join(root, r.image_path))) errors.push(`${tag}: image file not found: ${r.image_path}`)
    } else if (!r.motif) errors.push(`${tag}: pending image needs a motif`)
    if (!r.image_source) errors.push(`${tag}: image_source missing`)
    if (!r.image_license) errors.push(`${tag}: image_license missing`)
    if (!ASSET_REVIEW_STATES.includes(r.image_reviewStatus)) {
      errors.push(`${tag}: image_reviewStatus must be ${ASSET_REVIEW_STATES.join(' / ')}`)
    }
    errors.push(...validateAudioRow(r, tag))

    if (r.pos === 'verb') {
      if (!(Number(r.verbType) >= 1 && Number(r.verbType) <= 6)) errors.push(`${tag}: verbType must be 1-6`)
      for (const k of ['infinitiveEnding', 'presentStem', 'present1sg', 'past3sg', 'nutParticiple']) {
        if (!r[k]) errors.push(`${tag}: verb.${k} missing`)
      }
      const kt = num(r.kotusType)
      if (r.irregular !== 'true' && !(kt >= 52 && kt <= 78)) errors.push(`${tag}: regular verb needs kotusType 52-78`)
    } else {
      for (const c of BASIC_CASES) if (!r[c]) errors.push(`${tag}: basic case ${c} missing`)
      for (const c of BASIC_CASES.slice(1)) if (!r[`suffix_${c}`]) errors.push(`${tag}: suffix_${c} missing`)
      if (!r.stem_strong || !r.stem_weak) errors.push(`${tag}: strong/weak stems missing`)
      if (!['back', 'front', 'neutral'].includes(r.harmony)) errors.push(`${tag}: invalid harmony`)
      if (!r.singular || !r.plural) errors.push(`${tag}: singular/plural missing`)
      const kt = num(r.kotusType)
      if (kt !== null && !(kt >= 1 && kt <= 51)) errors.push(`${tag}: kotusType must be 1-51 for a nominal`)
    }
  }

  const sids = new Set()
  for (const r of sentenceRows) {
    const tag = `sentences.csv/${r.id || '(empty id)'}`
    if (!r.id || sids.has(r.id)) errors.push(`${tag}: empty or duplicate id`)
    sids.add(r.id)
    if (!LEVELS.includes(r.cefr)) errors.push(`${tag}: invalid cefr`)
    if (!r.fiText || !r.zhText || !r.enText) errors.push(`${tag}: fi/zh/en text missing`)
    for (const p of (r.grammarPoints ?? '').split('|').filter(Boolean)) {
      if (!(p in CASE_CEFR)) errors.push(`${tag}: unknown grammar point "${p}"`)
    }
    for (const part of (r.gloss ?? '').split('|').filter(Boolean)) {
      const bits = part.split('~')
      const [token, senseId, caseForm] = bits
      // An empty senseId is legal: punctuation and function words have no
      // dictionary entry (matches validate-content.mjs: token.senseId === null).
      if (!token || bits.length < 2) errors.push(`${tag}: malformed gloss item "${part}"`)
      if (senseId && !senseIds.has(senseId)) errors.push(`${tag}: dangling senseId "${senseId}"`)
      if (caseForm && !(caseForm in CASE_CEFR)) errors.push(`${tag}: unknown caseForm "${caseForm}"`)
    }
    errors.push(...validateAudioRow(r, tag))
  }
  return errors
}

/* ── CSV -> pack (merge, never drop seed entries) ─────────────────────── */
export function applyCsvToPack(pack, wordRows, sentenceRows) {
  const out = JSON.parse(JSON.stringify(pack))
  const byId = new Map(out.words.map((w) => [w.id, w]))
  for (const row of wordRows) {
    const w = applyWordRow(byId.get(row.id), row)
    byId.set(row.id, w)
  }
  out.words = [...byId.values()]
  const sById = new Map(out.sentences.map((s) => [s.id, s]))
  for (const row of sentenceRows) sById.set(row.id, applySentenceRow(sById.get(row.id), row))
  out.sentences = [...sById.values()]
  return out
}

export function readCsvFiles() {
  if (!existsSync(WORDS_CSV) || !existsSync(SENTENCES_CSV)) return null
  const w = parseCSV(readFileSync(WORDS_CSV, 'utf8'))
  const s = parseCSV(readFileSync(SENTENCES_CSV, 'utf8'))
  return { wordRows: w.rows, sentenceRows: s.rows, wordHeader: w.header, sentenceHeader: s.header }
}

export function csvOverride(pack, { silent = false } = {}) {
  const csv = readCsvFiles()
  if (!csv) return pack
  const errors = validateCsv(csv.wordRows, csv.sentenceRows, csv.wordHeader, csv.sentenceHeader)
  if (errors.length) {
    console.error('CSV validation failed:')
    for (const e of errors.slice(0, 20)) console.error('  ERROR ' + e)
    throw new Error(`${errors.length} CSV error(s); pack not written`)
  }
  if (!silent) console.log(`  CSV override: ${csv.wordRows.length} words / ${csv.sentenceRows.length} sentences`)
  return applyCsvToPack(pack, csv.wordRows, csv.sentenceRows)
}

/* ── CLI ──────────────────────────────────────────────────────────────── */
function selfTest() {
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'))
  const wRows = pack.words.map(wordToRow)
  const sRows = pack.sentences.map(sentenceToRow)
  const csvW = parseCSV(serializeCSV(WORD_COLS, wRows.map((r) => WORD_COLS.map((c) => str(r[c])))))
  const csvS = parseCSV(serializeCSV(SENTENCE_COLS, sRows.map((r) => SENTENCE_COLS.map((c) => str(r[c])))))
  let passed = 0, failed = 0
  const ok = (name, cond, extra = '') => {
    if (cond) { passed++; console.log(`  PASS  ${name}`) }
    else { failed++; console.log(`  FAIL  ${name} ${extra}`) }
  }
  ok('round-trip: no structural errors', validateCsv(csvW.rows, csvS.rows, csvW.header, csvS.header).length === 0,
    validateCsv(csvW.rows, csvS.rows, csvW.header, csvS.header).slice(0, 3).join('; '))
  const rebuilt = applyCsvToPack(pack, csvW.rows, csvS.rows)
  ok('round-trip: word count unchanged', rebuilt.words.length === pack.words.length)
  ok('round-trip: sentence count unchanged', rebuilt.sentences.length === pack.sentences.length)
  ok('round-trip: pack byte-identical', JSON.stringify(rebuilt) === JSON.stringify(pack),
    (() => {
      const a = JSON.stringify(rebuilt), b = JSON.stringify(pack)
      const i = [...a].findIndex((c, k) => c !== b[k])
      return `first diff @${i}: ${a.slice(i, i + 90)} vs ${b.slice(i, i + 90)}`
    })())
  ok('round-trip: comma-containing gloss survives', csvW.rows.find((r) => r.id === 'kauppa').sense_en === 'shop, store')
  ok('round-trip: Finnish diacritics survive', csvW.rows.find((r) => r.id === 'leipa').lemma === 'leipä')

  // A throwaway clip makes the audio pipeline testable without shipping a
  // fake Finnish pronunciation inside the repository. Removed in `finally`.
  const stubPath = `${AUDIO_DIR}_csv-selftest.mp3`
  mkdirSync(join(root, AUDIO_DIR), { recursive: true })
  writeFileSync(join(root, stubPath), 'ID3')
  const audioRow = (r) => Object.assign(r, {
    audio_file: stubPath, audio_source: 'tts', audio_license: 'own',
    audio_duration: '1.2', audio_reviewStatus: 'human-verified',
  })

  try {
    const cases = [
      ['invalid cefr', (c) => { c.w[0].cefr = 'Z9' }, 'invalid cefr'],
      ['missing basic case', (c) => { c.w[0].ine = '' }, 'basic case ine'],
      ['verbType out of range', (c) => { c.w.find((r) => r.pos === 'verb').verbType = '9' }, 'verbType'],
      ['duplicate id', (c) => { c.w[1].id = c.w[0].id }, 'duplicate id'],
      ['dangling gloss senseId', (c) => { c.s[0].gloss = 'Ghost~ghost-1' }, 'dangling senseId'],
      ['malformed gloss item', (c) => { c.s[0].gloss = 'Broken' }, 'malformed gloss'],
      ['missing column', (c) => { c.wh = c.wh.filter((x) => x !== 'ipa') }, 'missing column'],
      ['invalid harmony', (c) => { c.w[0].harmony = 'mixed' }, 'invalid harmony'],
      ['ready image without file', (c) => { c.w[0].image_status = 'ready'; c.w[0].image_path = '' }, 'ready image needs'],
      ['image review status', (c) => { c.w[0].image_reviewStatus = 'approved' }, 'image_reviewStatus'],
      ['image source missing', (c) => { c.w[0].image_source = '' }, 'image_source missing'],
      ['half-filled audio row', (c) => { c.w[0].audio_source = 'tts' }, 'audio_file missing but'],
      ['audio file not found', (c) => { audioRow(c.w[0]); c.w[0].audio_file = 'assets/audio/missing.mp3' }, 'audio file not found'],
      ['audio source invalid', (c) => { audioRow(c.w[0]); c.w[0].audio_source = 'radio' }, 'audio_source'],
      ['audio licence missing', (c) => { audioRow(c.w[0]); c.w[0].audio_license = '' }, 'audio_license'],
      ['audio review status invalid', (c) => { audioRow(c.w[0]); c.w[0].audio_reviewStatus = 'approved' }, 'audio_reviewStatus'],
      ['audio duration invalid', (c) => { audioRow(c.w[0]); c.w[0].audio_duration = 'long' }, 'audio_duration'],
      ['audio outside the audio directory', (c) => { audioRow(c.w[0]); c.w[0].audio_file = 'assets/illustrations/talo.png' }, 'audio_file must'],
      ['sentence audio file not found', (c) => { audioRow(c.s[0]); c.s[0].audio_file = 'assets/audio/missing.mp3' }, 'audio file not found'],
    ]
    for (const [name, mutate, expected] of cases) {
      const c = { w: JSON.parse(JSON.stringify(csvW.rows)), s: JSON.parse(JSON.stringify(csvS.rows)), wh: [...csvW.header], sh: [...csvS.header] }
      mutate(c)
      const errs = validateCsv(c.w, c.s, c.wh, c.sh)
      ok(`reject: ${name}`, errs.some((e) => e.includes(expected)), errs.slice(0, 2).join('; '))
    }

    // Positive path: a fully declared clip validates, lands in the pack and
    // exports back to the same CSV values.
    const aw = JSON.parse(JSON.stringify(csvW.rows))
    const as = JSON.parse(JSON.stringify(csvS.rows))
    audioRow(aw[0]); audioRow(as[0])
    const audioErrs = validateCsv(aw, as, csvW.header, csvS.header)
    ok('accept: fully declared word + sentence audio', audioErrs.length === 0, audioErrs.slice(0, 3).join('; '))
    const withAudio = applyCsvToPack(pack, aw, as)
    const wAudio = withAudio.words.find((x) => x.id === aw[0].id)?.audio
    const sAudio = withAudio.sentences.find((x) => x.id === as[0].id)?.audio
    ok('audio object written into word', wAudio?.path === stubPath && wAudio.source === 'tts' && wAudio.durationSec === 1.2)
    ok('audio object written into sentence', sAudio?.path === stubPath && sAudio.reviewStatus === 'human-verified')
    ok('audio columns round-trip',
      wordToRow(withAudio.words.find((x) => x.id === aw[0].id)).audio_file === stubPath &&
      sentenceToRow(withAudio.sentences.find((x) => x.id === as[0].id)).audio_source === 'tts')
  } finally {
    unlinkSync(join(root, stubPath))
  }
  console.log(`\n  csv bridge: ${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

function main() {
  const cmd = process.argv[2] ?? 'check'
  if (cmd === '--self-test') return selfTest()
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'))

  if (cmd === 'export') {
    writeFileSync(WORDS_CSV, serializeCSV(WORD_COLS, pack.words.map((w) => WORD_COLS.map((c) => str(wordToRow(w)[c])))), 'utf8')
    writeFileSync(SENTENCES_CSV, serializeCSV(SENTENCE_COLS, pack.sentences.map((s) => SENTENCE_COLS.map((c) => str(sentenceToRow(s)[c])))), 'utf8')
    console.log(`Exported ${pack.words.length} words  -> ${WORDS_CSV}`)
    console.log(`Exported ${pack.sentences.length} sentences -> ${SENTENCES_CSV}`)
    console.log('UTF-8 with BOM: opens correctly in Excel / Numbers (ä ö å, 中文).')
    return
  }

  const csv = readCsvFiles()
  if (!csv) { console.error('CSV files missing. Run: node scripts/csv-pack.mjs export'); process.exitCode = 1; return }
  const errors = validateCsv(csv.wordRows, csv.sentenceRows, csv.wordHeader, csv.sentenceHeader)
  if (errors.length) {
    console.error(`CSV validation FAILED with ${errors.length} error(s):`)
    for (const e of errors) console.error('  ERROR ' + e)
    process.exitCode = 1
    return
  }
  console.log(`CSV OK: ${csv.wordRows.length} words / ${csv.sentenceRows.length} sentences`)
  console.log(`  media: ${csv.wordRows.filter((r) => r.image_status === 'ready').length} ready illustration(s), ` +
    `${[...csv.wordRows, ...csv.sentenceRows].filter((r) => r.audio_file).length} audio clip(s) declared`)
  if (cmd === 'check') { console.log('No files written.'); return }
  if (cmd === 'import') {
    const next = applyCsvToPack(pack, csv.wordRows, csv.sentenceRows)
    // Content hash instead of a timestamp: re-importing unchanged CSV must be
    // byte-stable, so a clean git diff proves the pipeline is reproducible.
    next.csvSourceSha256 = createHash('sha256')
      .update(JSON.stringify([csv.wordRows, csv.sentenceRows]))
      .digest('hex')
    writeFileSync(PACK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(`Imported -> ${PACK_PATH}`)
    console.log('Next: node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test')
    return
  }
  console.error(`Unknown command: ${cmd}`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
