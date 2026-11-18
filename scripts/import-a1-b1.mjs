/**
 * Import the user-provided A1-B1 workbook into the CSV editing layer.
 *
 *   node scripts/import-a1-b1.mjs
 *   node scripts/import-a1-b1.mjs --dry-run   # report only, write nothing
 *
 * Pipeline:
 *   data/import/*.csv  (lossless snapshots of the six XLSX sheets)
 *   + data/import/en-glosses.csv / en-overrides.tsv / en-verbs.tsv
 *   + data/import/kotus-sanalista-2024.tsv (CC BY 4.0)
 *   -> data/words.csv + data/sentences.csv + data/topics.json
 *   -> data/import/import-report.json
 *
 * Design rules:
 *  - The 50 hand-authored words / 35 sentences already in the CSV are the
 *    reviewed baseline. They are kept byte-for-byte and keep their IDs and
 *    levels, so existing group IDs, tests and learner progress stay valid.
 *  - Imported rows get an `x…` ID prefix, so re-running this script is
 *    idempotent: previous imports are dropped and regenerated from source.
 *  - Duplicate lemmas (Excel vs reviewed baseline) are skipped, not merged.
 *  - Missing morphology is derived by scripts/fi-morphology.mjs and EVERY
 *    imported row is tagged `auto-derived` with `pending` image/audio. The
 *    workbook's own CEFR column says "建议等级，非官方逐词CEFR定级", so levels
 *    are treated as in-house suggestions, never as an official CEFR list.
 *  - English glosses come from a committed, reviewable translation cache;
 *    verbs use hand-checked English infinitives from en-verbs.tsv.
 *
 * After running, ALWAYS regenerate the illustrations before rebuilding:
 * this script drops and recreates every imported row, so their image columns
 * are reset to `pending`. scripts/generate-illustrations.mjs deterministically
 * restores all generated SVG paths, licence fields and the review manifest.
 *   node scripts/generate-illustrations.mjs && node scripts/build-content.mjs &&
 *   node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test &&
 *   node scripts/test-flow.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  WORD_COLS, SENTENCE_COLS, parseCSV, serializeCSV, readCsvFiles, validateCsv,
} from './csv-pack.mjs'
import {
  loadKotus, lookupKotus, deriveNominal, deriveVerb, deriveIpa,
} from './fi-morphology.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const importDir = join(root, 'data', 'import')
const WORDS_CSV = join(root, 'data', 'words.csv')
const SENTENCES_CSV = join(root, 'data', 'sentences.csv')
const TOPICS_JSON = join(root, 'data', 'topics.json')
const REPORT = join(importDir, 'import-report.json')
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const WORKBOOK = join(importDir, 'finnish_A1-B1_vocabulary_database.xlsx')
const SNAPSHOT_FILES = [
  'words.csv', 'expressions.csv', 'sentences.csv',
  'dialogues.csv', 'grammar.csv', 'notes.csv',
]
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/* ── Chinese topic label -> project topicId + English label ─────────────── */
const TOPIC_MAP = {
  '家庭': ['family', 'Family'],
  '个人信息': ['personal-info', 'Personal information'],
  '住房家具': ['housing', 'Housing & furniture'],
  '家务生活': ['household', 'Household life'],
  '食物饮料': ['food-drink', 'Food & drink'],
  '衣物颜色': ['clothing', 'Clothing & colours'],
  '购物服务': ['shops-services', 'Shopping & services'],
  '城市交通': ['city-transport', 'City & transport'],
  '旅行住宿': ['travel', 'Travel & accommodation'],
  '天气自然': ['weather-nature', 'Weather & nature'],
  '时间日期': ['time', 'Time & dates'],
  '数字数量': ['numbers', 'Numbers & quantity'],
  '身体健康': ['health', 'Body & health'],
  '健康生活方式': ['healthy-living', 'Healthy living'],
  '学习教育': ['study', 'Study & education'],
  '工作职业': ['work', 'Work & careers'],
  '经济金融': ['economy', 'Economy & finance'],
  '社会公共生活': ['society-public', 'Society & public life'],
  '媒体科技': ['media-tech', 'Media & technology'],
  '情绪性格': ['emotions', 'Emotions & personality'],
  '描述比较': ['description', 'Description & comparison'],
  '抽象连接词': ['connectors', 'Abstract connectors'],
  '常用动词': ['common-verbs', 'Common verbs'],
  '扩展动词': ['extended-verbs', 'Extended verbs'],
  '代词': ['pronouns', 'Pronouns'],
  '副词': ['adverbs', 'Adverbs'],
  '疑问词': ['question-words', 'Question words'],
  '连接词': ['conjunctions', 'Conjunctions'],
  '方向副词': ['direction', 'Direction words'],
  '地点副词': ['place-words', 'Place words'],
  '后置词': ['postpositions', 'Postpositions'],
  '指示代词': ['demonstratives', 'Demonstrative pronouns'],
  '关系代词': ['relatives', 'Relative pronouns'],
  '语法词': ['grammar-words', 'Grammar words'],
  '口语': ['colloquial', 'Colloquial speech'],
}
/** Topic ids already used by the hand-reviewed demo content. */
const SEED_TOPICS = {
  home: ['家居', 'Home'],
  'shops-and-services': ['商店与服务', 'Shops & services'],
  travelling: ['出行', 'Travelling'],
  objects: ['物品', 'Objects'],
  food: ['饮食', 'Food'],
  actions: ['动作', 'Actions'],
  communication: ['交流', 'Communication'],
  study: ['学习', 'Study'],
  people: ['人物', 'People'],
  time: ['时间', 'Time'],
  work: ['工作', 'Work'],
  language: ['语言', 'Language'],
  cognition: ['认知', 'Cognition'],
  society: ['社会', 'Society'],
  abstract: ['抽象概念', 'Abstract concepts'],
  general: ['通用', 'General'],
}

const POS_MAP = {
  'n./其他': 'noun',
  'v.': 'verb',
  '否定动词': 'verb',
  'adj.': 'adjective',
  '副词': 'adverb',
  'adv.': 'adverb',
  '口语副词': 'adverb',
  '代词': 'pronoun',
  '连词': 'particle',
  'conj.': 'particle',
  '后置词': 'particle',
}

/** Two workbook rows need a human decision; both are recorded in the report.
 *  "y yhdeksän" is a stray-character typo for "yhdeksän" (gloss 九 / nine);
 *  "maksaa takaisin" is a phrasal VERB, not a noun ("n./其他"). */
const LEMMA_FIXES = { 'y yhdeksän': 'yhdeksän' }
const POS_FIXES = { 'maksaa takaisin': 'verb' }
const SOURCE_FIXES = { 'y yhdeksän': 'lemma typo corrected' }

/** Machine translations occasionally capitalise ordinary nouns. Keep proper
 *  nouns / the pronoun "I" capitalised, lower-case everything else. */
const KEEP_CAPITAL = /^(?:Finnish|English|Chinese|Swedish|I\b|Finland|China|Europe|Christmas|OK\b|WC\b|CV\b|EU\b)/i
const tidyWordGloss = (en) => {
  const s = String(en).trim()
  return KEEP_CAPITAL.test(s) ? s : s.toLowerCase()
}

/* ── helpers ───────────────────────────────────────────────────────────── */
const str = (v) => (v === null || v === undefined ? '' : String(v))
const readImport = (name) => parseCSV(readFileSync(join(importDir, name), 'utf8')).rows

function tsvMap(path) {
  const map = new Map()
  if (!existsSync(path)) return map
  for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    if (!line.trim() || line.startsWith('#') || /^zh\t|^lemma\t/.test(line)) continue
    const i = line.indexOf('\t')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (key && val) map.set(key, val)
  }
  return map
}

function slug(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
    .replace(/ü/g, 'u').replace(/š/g, 's').replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Re-attach sentence punctuation that the translation cache strips. */
function restorePunctuation(zh, en) {
  let out = String(en ?? '').trim()
  if (!out) return out
  if (/[？?]$/.test(zh) && !/[?！!。.]$/.test(out)) out += '?'
  else if (/[！!]$/.test(zh) && !/[?!。.]$/.test(out)) out += '!'
  return out
}

const levelOf = (raw) => String(raw ?? '').match(/A1|A2|B1|B2|C1|C2/)?.[0] ?? 'A1'

/** Token chips only: no senseId / caseForm, because the workbook does not
    annotate interlinear glosses. An empty senseId is legal in the schema. */
const tokenGloss = (fiText) => fiText.trim().split(/\s+/).filter(Boolean)
  .map((t) => `${t}~~`).join('|')

const blankRow = (cols) => Object.fromEntries(cols.map((c) => [c, '']))
const motifOf = (en) => String(en).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'idea'

/* ── main ──────────────────────────────────────────────────────────────── */
function main() {
  const dryRun = process.argv.includes('--dry-run')
  const existing = readCsvFiles()
  if (!existing) throw new Error('data/words.csv / data/sentences.csv missing - run node scripts/csv-pack.mjs export first')

  // Baseline = reviewed rows. Anything starting with "x" is a previous import.
  const baseWords = existing.wordRows.filter((r) => !r.id.startsWith('x'))
  const baseSentences = existing.sentenceRows.filter((r) => !r.id.startsWith('x'))
  const usedWordIds = new Set(baseWords.map((r) => r.id))
  const usedSentenceIds = new Set(baseSentences.map((r) => r.id))
  const seenLemmas = new Set(baseWords.map((r) => r.lemma.toLowerCase()))
  const seenFi = new Set(baseSentences.map((r) => r.fiText.trim().toLowerCase()))

  // Translation layers (later ones win).
  const enCache = new Map(readImport('en-glosses.csv').map((r) => [r.zh, r.en]))
  const enOverrides = tsvMap(join(importDir, 'en-overrides.tsv'))
  const enVerbs = tsvMap(join(importDir, 'en-verbs.tsv'))
  const enOf = (zh) => enOverrides.get(zh) ?? enCache.get(zh) ?? ''

  const kotus = loadKotus(join(importDir, 'kotus-sanalista-2024.tsv'))
  const xWords = readImport('words.csv')
  const xSentences = readImport('sentences.csv')
  const xExpressions = readImport('expressions.csv')
  const xDialogues = readImport('dialogues.csv')

  const skipped = []
  const sourceFixes = []
  const quality = { 'kotus-rule': 0, 'shape-rule': 0, 'hand-checked': 0, phrase: 0, indeclinable: 0, pending: 0 }
  const levelCount = Object.fromEntries(LEVEL_ORDER.map((l) => [l, 0]))
  const posCount = {}
  const enStats = { cache: 0, verbTable: 0, missing: 0 }
  let kotusHit = 0

  /* ── words ──────────────────────────────────────────────────────────── */
  const ordered = xWords
    .map((r, i) => ({ r, i }))
    .sort((a, b) => LEVEL_ORDER.indexOf(levelOf(a.r['建议等级'])) - LEVEL_ORDER.indexOf(levelOf(b.r['建议等级'])) || a.i - b.i)

  const newWords = []
  for (const { r } of ordered) {
    const rawLemma = String(r['芬兰语词条'] ?? '').trim()
    const lemma = LEMMA_FIXES[rawLemma] ?? rawLemma
    const zh = String(r['中文释义'] ?? '').trim()
    if (!lemma || !zh) { skipped.push({ lemma, reason: 'empty lemma or Chinese gloss' }); continue }
    if (SOURCE_FIXES[rawLemma]) sourceFixes.push({ from: rawLemma, to: lemma, reason: SOURCE_FIXES[rawLemma] })
    if (seenLemmas.has(lemma.toLowerCase())) { skipped.push({ lemma, reason: 'already in reviewed baseline' }); continue }

    const pos = POS_FIXES[rawLemma] ?? POS_MAP[r['词性']] ?? 'noun'
    const cefr = levelOf(r['建议等级'])
    const topicRaw = String(r['主题分类'] ?? '').trim()
    const [topicId] = TOPIC_MAP[topicRaw] ?? ['general', 'General']
    let en = pos === 'verb' && enVerbs.has(rawLemma) ? enVerbs.get(rawLemma) : enOf(zh)
    if (pos === 'verb' && enVerbs.has(rawLemma)) enStats.verbTable++
    else if (en) enStats.cache++
    if (!en) { enStats.missing++; skipped.push({ lemma, reason: 'no English gloss - add to en-overrides.tsv' }); continue }
    en = tidyWordGloss(en)

    const k = lookupKotus(kotus, lemma, pos === 'verb')
    const cls = k?.number ?? null
    const grad = k?.grad ?? null
    if (cls !== null) kotusHit++
    const morph = pos === 'verb'
      ? deriveVerb({ lemma, cls, grad })
      : deriveNominal({ lemma, pos, cls, grad })

    let id = `xw-${slug(lemma)}`
    if (!/^[a-z0-9-]+$/.test(id) || usedWordIds.has(id)) {
      const base = id
      let n = 2
      while (usedWordIds.has(id)) id = `${base}-${n++}`
    }
    usedWordIds.add(id)
    seenLemmas.add(lemma.toLowerCase())

    const row = {
      ...blankRow(WORD_COLS),
      id, lemma, pos, cefr, topicId, ipa: deriveIpa(lemma),
      sense_zh: zh, sense_en: en,
      image_status: 'pending', image_source: 'hand-drawn', image_license: 'own',
      image_reviewStatus: 'pending', motif: motifOf(en),
      reviewStatus: 'auto-derived',
      ...(pos === 'verb'
        ? {
          verbType: morph.verbType, infinitiveEnding: morph.infinitiveEnding,
          presentStem: morph.presentStem, present1sg: morph.present1sg,
          past3sg: morph.past3sg, nutParticiple: morph.nutParticiple,
          irregular: morph.irregular, kotusType: morph.kotusType,
        }
        : {
          singular: morph.singular, plural: morph.plural,
          nom: morph.nom, gen: morph.gen, par: morph.par,
          ine: morph.ine, ela: morph.ela, ill: morph.ill,
          suffix_gen: morph.suffix_gen, suffix_par: morph.suffix_par,
          suffix_ine: morph.suffix_ine, suffix_ela: morph.suffix_ela,
          suffix_ill: morph.suffix_ill,
          stem_strong: morph.stem_strong, stem_weak: morph.stem_weak,
          gradation: morph.gradation, harmony: morph.harmony,
          kotusType: morph.kotusType, declensionClass: morph.declensionClass,
        }),
    }
    newWords.push(row)
    levelCount[cefr]++
    posCount[pos] = (posCount[pos] ?? 0) + 1
    quality[morph.quality] = (quality[morph.quality] ?? 0) + 1
  }

  /* ── sentences / expressions / dialogue lines / workbook examples ───── */
  const newSentences = []
  const addSentence = (prefix, fiText, zhText, cefr, source) => {
    const fi = String(fiText ?? '').replace(/\s+/g, ' ').trim()
    const zh = String(zhText ?? '').trim()
    if (!fi || !zh) { skipped.push({ lemma: fi, reason: `empty ${source} text` }); return }
    if (seenFi.has(fi.toLowerCase())) { skipped.push({ lemma: fi, reason: `duplicate ${source} text` }); return }
    const en = restorePunctuation(zh, enOf(zh))
    if (!en) { enStats.missing++; skipped.push({ lemma: fi, reason: `no English translation for ${source}` }); return }
    let n = 1
    let id = `${prefix}-${String(n).padStart(3, '0')}`
    while (usedSentenceIds.has(id)) id = `${prefix}-${String(++n).padStart(3, '0')}`
    usedSentenceIds.add(id)
    seenFi.add(fi.toLowerCase())
    newSentences.push({
      ...blankRow(SENTENCE_COLS),
      id, fiText: fi, zhText: zh, enText: en, cefr,
      grammarPoints: '', gloss: tokenGloss(fi),
    })
  }

  for (const r of xSentences) addSentence('xs', r['芬兰语句子'], r['中文翻译'], levelOf(r['建议等级']), 'sentence')
  for (const r of xExpressions) addSentence('xe', r['芬兰语表达'], r['中文释义'], levelOf(r['建议等级']), 'expression')
  for (const r of xDialogues) {
    const fiLines = String(r['芬兰语对话'] ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    const zhLines = String(r['中文翻译'] ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    const level = levelOf(r['建议等级'])
    if (fiLines.length !== zhLines.length) {
      addSentence('xd', r['芬兰语对话'], r['中文翻译'], level, 'dialogue (whole)')
    } else {
      fiLines.forEach((fi, i) => addSentence(
        'xd',
        fi.replace(/^[AB]:\s*/i, ''),
        zhLines[i].replace(/^[AB]:\s*/i, ''),
        level, 'dialogue line',
      ))
    }
  }
  // The workbook also supplies 20 example sentences inside the word sheet.
  for (const r of xWords) {
    if (r['芬兰语例句']) addSentence('xx', r['芬兰语例句'], r['例句中文'], levelOf(r['建议等级']), 'word example')
  }

  /* ── validate + write ──────────────────────────────────────────────── */
  const wordRows = [...baseWords, ...newWords]
  const sentenceRows = [...baseSentences, ...newSentences]
  const errors = validateCsv(wordRows, sentenceRows, WORD_COLS, SENTENCE_COLS)
  if (errors.length) {
    console.error(`Import CSV validation FAILED with ${errors.length} error(s):`)
    for (const e of errors.slice(0, 25)) console.error('  ERROR ' + e)
    if (errors.length > 25) console.error(`  … ${errors.length - 25} more`)
    process.exitCode = 1
    return
  }

  const topics = {}
  for (const [zh, [id, en]] of Object.entries(TOPIC_MAP)) topics[id] = { zh, en }
  for (const [id, [zh, en]] of Object.entries(SEED_TOPICS)) if (!topics[id]) topics[id] = { zh, en }

  // Content hashes, not a wall-clock timestamp: the report must be byte-stable
  // so "regenerate everything -> git diff" is a meaningful reproducibility check.
  const sourceWorkbookSha256 = existsSync(WORKBOOK) ? sha256(readFileSync(WORKBOOK)) : null
  const snapshotsSha256 = sha256(Buffer.concat(
    SNAPSHOT_FILES.map((f) => readFileSync(join(importDir, f))),
  ))

  const report = {
    format: 'finnish-learn-import-report',
    sourceWorkbook: 'finnish_A1-B1_vocabulary_database.xlsx',
    sourceWorkbookSha256,
    snapshotsSha256,
    sourceSheets: {
      'A1-B1词汇总库': xWords.length, '固定表达': xExpressions.length,
      '句子库': xSentences.length, '情景对话': xDialogues.length,
    },
    counts: {
      reviewedBaselineWords: baseWords.length, importedWords: newWords.length, finalWords: wordRows.length,
      reviewedBaselineSentences: baseSentences.length, importedSentences: newSentences.length,
      finalSentences: sentenceRows.length,
      skipped: skipped.length,
    },
    levels: levelCount,
    partsOfSpeech: posCount,
    morphology: {
      kotusClassFound: kotusHit,
      kotusClassMissing: newWords.length - kotusHit,
      derivationQuality: quality,
    },
    english: enStats,
    sourceFixes,
    sentenceSources: newSentences.reduce((m, s) => {
      const k = s.id.split('-')[0]
      m[k] = (m[k] ?? 0) + 1
      return m
    }, {}),
    caveats: [
      'The workbook CEFR column is an in-house SUGGESTION ("建议等级，非官方逐词CEFR定级"), not an official CEFR word list.',
      'Every imported word is reviewStatus=auto-derived: IPA, case tables, stems and verb principal parts are rule-derived and need a Finnish linguist to verify.',
      'Genuinely indeclinable words (Kotus 99, adverbs, conjunctions) show "—"; words whose paradigm could not be derived are labelled "paradigm pending" / "pluralia tantum (paradigm pending)" and also show "—" until a linguist fills them in.',
      'Imported sentences carry token chips only; interlinear senseId/caseForm annotation is a future step, so no CEFR gate is inferred from glosses.',
      'Imported rows are emitted with pending image/audio columns; run scripts/generate-illustrations.mjs afterwards to restore the deterministic SVG illustrations. Browser TTS is used until native recordings are reviewed.',
      'Colloquial (Puhekieli) variants, collocations and grammar notes from the workbook are preserved in data/import/*.csv but not yet surfaced in the app.',
      'This report is deterministic (content hashes, no wall-clock timestamp): regenerating from unchanged inputs must produce an empty git diff.',
    ],
    skipped,
  }

  console.log(`Import ${dryRun ? '(dry run) ' : ''}report`)
  console.log(`  words       ${baseWords.length} reviewed + ${newWords.length} imported = ${wordRows.length}`)
  console.log(`  sentences   ${baseSentences.length} reviewed + ${newSentences.length} imported = ${sentenceRows.length}`)
  console.log(`  levels      ${JSON.stringify(levelCount)}`)
  console.log(`  POS         ${JSON.stringify(posCount)}`)
  console.log(`  Kotus class ${kotusHit} found / ${newWords.length - kotusHit} missing`)
  console.log(`  derivation  ${JSON.stringify(quality)}`)
  console.log(`  English     ${JSON.stringify(enStats)}`)
  console.log(`  skipped     ${skipped.length}`)
  if (dryRun) return

  writeFileSync(WORDS_CSV, serializeCSV(WORD_COLS, wordRows.map((r) => WORD_COLS.map((c) => str(r[c])))), 'utf8')
  writeFileSync(SENTENCES_CSV, serializeCSV(SENTENCE_COLS, sentenceRows.map((r) => SENTENCE_COLS.map((c) => str(r[c])))), 'utf8')
  writeFileSync(TOPICS_JSON, `${JSON.stringify({ format: 'finnish-learn-topics', topics }, null, 2)}\n`, 'utf8')
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`\nWrote data/words.csv, data/sentences.csv, data/topics.json, data/import/import-report.json`)
  console.log('Next: node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test')
}

main()
