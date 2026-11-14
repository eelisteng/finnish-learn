/**
 * Expands data/content-source.mjs into the versioned JSON content pack.
 * All linguistic values are explicitly tagged auto-derived: this script only
 * guarantees structural consistency, not Finnish correctness.
 *
 *   node scripts/build-content.mjs
 */
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LEVELS, WORD_SEED, SENTENCE_SEED } from '../data/content-source.mjs'
import { csvOverride } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'data', 'packs', 'a1-core.json')

const CASE_CEFR = {
  nom: 'A1', gen: 'A1', par: 'A1', ine: 'A1', ela: 'A1', ill: 'A1',
  ade: 'A2', abl: 'A2', all: 'A2', ess: 'A2', tra: 'A2', acc: 'A2',
  ins: 'B1', abe: 'B1', com: 'B1',
}
const CASE_LABEL = {
  nom: '主格 nominatiivi', gen: '属格 genetiivi', par: '部分格 partitiivi',
  ine: '内格 inessiivi', ela: '出格 elatiivi', ill: '入格 illatiivi',
}
const bandFor = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

function defaultSuffix(caseId, harmony) {
  const front = harmony === 'front'
  return {
    gen: '-n',
    par: front ? '-ä' : '-a',
    ine: front ? '-ssä' : '-ssa',
    ela: front ? '-stä' : '-sta',
    ill: '-Vn',
  }[caseId]
}

function expandNominal(word) {
  const n = word.n
  const overrides = n.suffix ?? {}
  const order = ['gen', 'par', 'ine', 'ela', 'ill']
  const caseForms = [
    { case: 'nom', form: word.lemma, suffix: '—', stemUsed: 'strong', cefr: CASE_CEFR.nom, label: CASE_LABEL.nom },
    ...order.map((caseId, i) => ({
      case: caseId,
      form: n.forms[i],
      suffix: overrides[caseId] ?? defaultSuffix(caseId, n.harmony),
      stemUsed: ['gen', 'ine', 'ela'].includes(caseId) ? 'weak' : 'strong',
      cefr: CASE_CEFR[caseId],
      label: CASE_LABEL[caseId],
    })),
  ]
  return {
    nominal: {
      stems: { strong: n.strong, weak: n.weak },
      gradation: n.gradation,
      harmony: n.harmony,
      declensionClass: n.declensionClass,
      kotusType: n.kotusType,
      caseForms,
    },
    number: {
      singular: word.lemma,
      plural: n.plural,
      note: '主格单复数；其他格另有复数形式，见完整变格表',
    },
  }
}

const posLabel = {
  noun: '名词', verb: '动词', adjective: '形容词', pronoun: '代词',
  numeral: '数词', adverb: '副词', particle: '小品词',
}

function buildWord(word) {
  const senseId = `${word.id}-1`
  const path = word.image ?? null
  const ready = Boolean(path && existsSync(join(root, path)))
  const sense = {
    id: senseId,
    cefr: word.cefr,
    zh: word.zh,
    en: word.en,
    posZh: posLabel[word.pos],
    image: {
      id: `img-${word.id}-1`,
      path: ready ? path : null,
      motif: word.motif,
      altZh: `${word.zh}的情境示意图`,
      altEn: `Illustration for ${word.en}`,
      source: ready ? 'generated' : 'hand-drawn',
      license: 'own',
      status: ready ? 'ready' : 'pending',
      reviewStatus: 'pending',
      note: ready ? 'AI 生成样例，已裁掉平台水印，待人工审核' : '几何占位图，正式插画待生成',
    },
  }
  const morphology = word.pos === 'verb'
    ? { verb: { ...word.v } }
    : expandNominal(word)

  return {
    id: word.id,
    lemma: word.lemma,
    pos: word.pos,
    posZh: posLabel[word.pos],
    cefr: word.cefr,
    topicId: word.topic,
    ipa: word.ipa,
    ipaSource: 'rule-derived',
    senses: [sense],
    provenance: {
      lemmaSource: 'kotus',
      glossSource: 'wiktionary+own-review',
      frequencyBand: bandFor[word.cefr],
      gradingSignals: word.pos === 'verb' ? ['frequency', 'verb-type'] : ['frequency', 'morphology'],
      reviewStatus: 'auto-derived',
    },
    ...morphology,
    ...(word.pos === 'verb' ? { number: null } : {}),
  }
}

function buildSentence(s) {
  return {
    id: s.id,
    fiText: s.fi,
    zhText: s.zh,
    enText: s.en,
    cefr: s.cefr,
    grammarPoints: s.grammarPoints,
    gloss: s.gloss,
  }
}

const seedPack = {
  format: 'finnish-learn-content',
  schema: 2,
  version: 'fi-core-2026.11-demo',
  reviewNote: 'Demo pack. Every paradigm, IPA transcription and Chinese gloss is auto-derived and MUST be human-verified before production. CEFR grading is an internal product convention, not an official word list.',
  levels: LEVELS,
  words: WORD_SEED.map(buildWord),
  sentences: SENTENCE_SEED.map(buildSentence),
}

// data/words.csv + data/sentences.csv are the human-proofreading layer. When
// present, their values win over the seed, so rebuilding from source never
// silently discards reviewed Finnish forms or Chinese glosses.
const pack = csvOverride(seedPack)

writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8')
const byLevel = Object.fromEntries(LEVELS.map((l) => [l, {
  words: pack.words.filter((w) => w.cefr === l).length,
  sentences: pack.sentences.filter((s) => s.cefr === l).length,
}]))
console.log(`Built ${outPath}`)
console.log(`  words ${pack.words.length} | sentences ${pack.sentences.length}`)
for (const level of LEVELS) {
  console.log(`  ${level}: ${byLevel[level].words} words / ${byLevel[level].sentences} sentences`)
}
const ready = pack.words.filter((w) => w.senses[0].image.status === 'ready').length
console.log(`  ready illustrations ${ready} / motif placeholders ${pack.words.length - ready}`)
