/**
 * Build-time validation for the content pack and the learning-group index.
 * Guarantees structure and grading consistency only - it cannot verify that a
 * Finnish inflection or an IPA transcription is linguistically correct.
 *
 *   node scripts/validate-content.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pack = JSON.parse(readFileSync(join(root, 'data', 'packs', 'a1-core.json'), 'utf8'))
const groupsPath = join(root, 'data', 'groups.json')
const groupIndex = existsSync(groupsPath) ? JSON.parse(readFileSync(groupsPath, 'utf8')) : null

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const BASIC_CASES = ['nom', 'gen', 'par', 'ine', 'ela', 'ill']
const CASE_CEFR = {
  nom: 'A1', gen: 'A1', par: 'A1', ine: 'A1', ela: 'A1', ill: 'A1',
  ade: 'A2', abl: 'A2', all: 'A2', ess: 'A2', tra: 'A2', acc: 'A2',
  ins: 'B1', abe: 'B1', com: 'B1',
}
const rank = (level) => LEVELS.indexOf(level)

function validatePack(p) {
  const errors = []
  const warnings = []
  const senses = new Map()
  const stats = { words: 0, senses: 0, imagesReady: 0, imagesPending: 0, verbTypes: new Set(), basicCases: 0, withIpa: 0, withNumber: 0 }

  if (p.format !== 'finnish-learn-content') errors.push('pack.format must be finnish-learn-content')
  if (!p.version) errors.push('pack.version missing')

  for (const word of p.words ?? []) {
    stats.words++
    if (!word.ipa) errors.push(`${word.id}: ipa missing (背词模式必需)`)
    else stats.withIpa++

    if (!word.senses?.length) {
      errors.push(`${word.id}: no senses`)
      continue
    }
    for (const sense of word.senses) {
      stats.senses++
      if (!LEVELS.includes(sense.cefr)) errors.push(`${word.id}/${sense.id}: invalid cefr`)
      senses.set(sense.id, sense)
      if (!sense.image) {
        errors.push(`${word.id}/${sense.id}: missing image (one image per sense is mandatory)`)
      } else {
        for (const key of ['id', 'altZh', 'altEn', 'source', 'license', 'status', 'reviewStatus']) {
          if (!(key in sense.image)) errors.push(`${word.id}/${sense.id}: image.${key} missing`)
        }
        if (sense.image.status === 'ready') {
          stats.imagesReady++
          if (!sense.image.path) errors.push(`${word.id}/${sense.id}: ready image has no path`)
          else if (!existsSync(join(root, sense.image.path))) warnings.push(`${sense.image.path}: file not found`)
        } else {
          stats.imagesPending++
          if (!sense.image.motif) errors.push(`${word.id}/${sense.id}: pending image needs a motif placeholder`)
        }
        if (!sense.image.altZh || !sense.image.altEn) errors.push(`${word.id}/${sense.id}: image alt text missing`)
      }
    }

    const minRank = Math.min(...word.senses.map((s) => rank(s.cefr)))
    const derived = LEVELS[minRank]
    if (word.cefr !== derived) errors.push(`${word.id}: cefr ${word.cefr} != min(senses) ${derived}`)
    if (!word.provenance?.lemmaSource) errors.push(`${word.id}: provenance.lemmaSource missing`)

    if (word.pos === 'verb') {
      const verb = word.verb
      if (!verb) errors.push(`${word.id}: verb paradigm missing`)
      else {
        if (!Number.isInteger(verb.verbType) || verb.verbType < 1 || verb.verbType > 6) {
          errors.push(`${word.id}: verbType must be 1-6`)
        } else stats.verbTypes.add(verb.verbType)
        if (!verb.irregular && !(verb.kotusType >= 52 && verb.kotusType <= 78)) {
          errors.push(`${word.id}: kotusType must be 52-78 for a regular verb`)
        }
        for (const key of ['infinitiveEnding', 'presentStem', 'present1sg', 'past3sg', 'nutParticiple']) {
          if (!verb[key]) errors.push(`${word.id}: verb.${key} missing`)
        }
        if (word.nominal) errors.push(`${word.id}: verbs must not carry a case table`)
      }
    } else {
      if (!word.number?.singular || !word.number?.plural) {
        errors.push(`${word.id}: number.singular/plural missing (背词模式必需)`)
      } else stats.withNumber++
      const nominal = word.nominal
      if (!nominal) errors.push(`${word.id}: nominal paradigm missing`)
      else {
        if (!nominal.stems?.strong || !nominal.stems?.weak) errors.push(`${word.id}: strong/weak stems missing`)
        if (!['back', 'front', 'neutral'].includes(nominal.harmony)) errors.push(`${word.id}: invalid harmony`)
        if (nominal.kotusType !== null && !(nominal.kotusType >= 1 && nominal.kotusType <= 51)) {
          errors.push(`${word.id}: kotusType must be 1-51 for a nominal`)
        }
        const present = new Set((nominal.caseForms ?? []).map((f) => f.case))
        for (const required of BASIC_CASES) {
          if (!present.has(required)) errors.push(`${word.id}: basic case ${required} missing`)
          else stats.basicCases++
        }
        for (const form of nominal.caseForms ?? []) {
          if (!form.form || !form.suffix || !['strong', 'weak'].includes(form.stemUsed)) {
            errors.push(`${word.id}/${form.case}: incomplete case form`)
          }
          if (form.cefr !== CASE_CEFR[form.case]) {
            errors.push(`${word.id}/${form.case}: cefr ${form.cefr} != teaching level ${CASE_CEFR[form.case]}`)
          }
        }
      }
    }
  }

  const sentenceIds = new Set()
  for (const sentence of p.sentences ?? []) {
    if (sentenceIds.has(sentence.id)) errors.push(`${sentence.id}: duplicate sentence id`)
    sentenceIds.add(sentence.id)
    if (!LEVELS.includes(sentence.cefr)) errors.push(`${sentence.id}: invalid cefr`)
    let requiredRank = 0
    for (const point of sentence.grammarPoints ?? []) {
      if (!(point in CASE_CEFR)) errors.push(`${sentence.id}: unknown grammar point ${point}`)
      else requiredRank = Math.max(requiredRank, rank(CASE_CEFR[point]))
    }
    for (const token of sentence.gloss ?? []) {
      if (token.caseForm && !(token.caseForm in CASE_CEFR)) errors.push(`${sentence.id}: unknown caseForm ${token.caseForm}`)
      if (token.caseForm) requiredRank = Math.max(requiredRank, rank(CASE_CEFR[token.caseForm]))
      if (token.senseId === null) continue
      const sense = senses.get(token.senseId)
      if (!sense) errors.push(`${sentence.id}: dangling senseId ${token.senseId}`)
      else requiredRank = Math.max(requiredRank, rank(sense.cefr))
    }
    if (rank(sentence.cefr) < requiredRank) {
      errors.push(`${sentence.id}: cefr ${sentence.cefr} too low, requires ${LEVELS[requiredRank]}`)
    }
  }
  return { errors, warnings, stats }
}

function validateGroups(p, gi) {
  const errors = []
  if (!gi) return { errors: ['data/groups.json missing - run node scripts/build-groups.mjs'] }
  if (gi.contentVersion !== p.version) errors.push('groups.contentVersion does not match pack.version')
  const words = new Map(p.words.map((w) => [w.id, w]))
  const sentences = new Map(p.sentences.map((s) => [s.id, s]))
  const seen = new Set()
  const covered = new Set()

  for (const g of gi.groups ?? []) {
    const source = g.kind === 'word' ? words : sentences
    if (g.size !== g.itemIds.length) errors.push(`${g.id}: size does not match itemIds`)
    if (g.itemIds.length > gi.groupSize) errors.push(`${g.id}: group size ${g.itemIds.length} exceeds ${gi.groupSize}`)
    if (!g.partial && g.itemIds.length !== gi.groupSize) errors.push(`${g.id}: full group must have exactly ${gi.groupSize} items`)
    if (!LEVELS.includes(g.level)) errors.push(`${g.id}: invalid level`)
    for (const itemId of g.itemIds) {
      const key = `${g.kind}:${itemId}`
      if (seen.has(key)) errors.push(`${g.id}: duplicate item ${itemId}`)
      seen.add(key)
      covered.add(key)
      const item = source.get(itemId)
      if (!item) errors.push(`${g.id}: unknown item ${itemId}`)
      else if (item.cefr !== g.level) errors.push(`${g.id}: group level ${g.level} != item ${itemId} level ${item.cefr}`)
    }
  }
  for (const w of p.words) if (!covered.has(`word:${w.id}`)) errors.push(`${w.id}: not assigned to any group`)
  for (const s of p.sentences) if (!covered.has(`sentence:${s.id}`)) errors.push(`${s.id}: not assigned to any group`)
  return { errors }
}

function runSelfTest(p, gi) {
  const findWord = (q, id) => q.words.find((w) => w.id === id)
  const findSentence = (q, id) => q.sentences.find((s) => s.id === id)
  const findGroup = (q, id) => q.groups.find((g) => g.id === id)
  const base = { words: p.words, sentences: p.sentences, groups: gi.groups }
  const cases = [
    ['句子等级门槛', (q) => { findSentence(q, 'a2-s01').cefr = 'A1' }, 'too low'],
    ['词条等级派生', (q) => { findWord(q, 'talo').cefr = 'A2' }, 'min(senses)'],
    ['插画 alt 必填', (q) => { delete findWord(q, 'talo').senses[0].image.altZh }, 'image.altZh'],
    ['动词类型范围', (q) => { findWord(q, 'puhua').verb.verbType = 9 }, 'verbType'],
    ['六个基本格', (q) => { findWord(q, 'talo').nominal.caseForms = findWord(q, 'talo').nominal.caseForms.slice(0, 5) }, 'basic case'],
    ['音标必填', (q) => { delete findWord(q, 'talo').ipa }, 'ipa missing'],
    ['单复数必填', (q) => { delete findWord(q, 'talo').number }, 'number.singular/plural'],
    ['占位图 motif', (q) => { delete findWord(q, 'katu').senses[0].image.motif }, 'motif placeholder'],
    ['分组不得超 5 条', (q) => { findGroup(q, 'A1-W-01').itemIds.push('kirja'); findGroup(q, 'A1-W-01').size = 6 }, 'group size'],
    ['分组等级一致', (q) => { findGroup(q, 'A1-W-01').level = 'B2' }, 'group level'],
    ['分组引用有效', (q) => { findGroup(q, 'A1-W-01').itemIds[0] = 'ghost' }, 'unknown item'],
  ]
  let passed = 0
  for (const [name, mutate, expected] of cases) {
    const copy = JSON.parse(JSON.stringify(base))
    mutate(copy)
    const mutatedPack = { ...p, words: copy.words, sentences: copy.sentences }
    const mutatedGroups = { ...gi, groups: copy.groups }
    const hits = [...validatePack(mutatedPack).errors, ...validateGroups(mutatedPack, mutatedGroups).errors]
    const hit = hits.some((e) => e.includes(expected))
    console.log(`  ${hit ? 'PASS' : 'FAIL'}  ${name}`)
    if (hit) passed++
    else process.exitCode = 1
  }
  console.log(`  self-test: ${passed}/${cases.length} negative cases rejected as expected`)
  if (passed !== cases.length) process.exitCode = 1
}

const { errors, warnings, stats } = validatePack(pack)
const groupErrors = validateGroups(pack, groupIndex).errors
const allErrors = [...errors, ...groupErrors]

console.log('Content pack:', pack.version)
console.log(`  words ${stats.words} | senses ${stats.senses} | basic case forms ${stats.basicCases}`)
console.log(`  ipa ${stats.withIpa} | noun/adjective number ${stats.withNumber}`)
console.log(`  images ready ${stats.imagesReady} / motif placeholder ${stats.imagesPending}`)
console.log(`  verb types covered: ${[...stats.verbTypes].sort().join(', ')}`)
console.log(`  sentences ${(pack.sentences ?? []).length} | groups ${groupIndex?.groups.length ?? 0}`)
for (const warning of warnings) console.log(`  WARN  ${warning}`)
for (const error of allErrors) console.log(`  ERROR ${error}`)

if (process.argv.includes('--self-test')) {
  console.log('Self-test (negative cases):')
  runSelfTest(pack, groupIndex)
}

if (allErrors.length) {
  console.log(`\nValidation FAILED with ${allErrors.length} error(s)`)
  process.exitCode = 1
} else {
  console.log('\nValidation OK')
}
