/**
 * Headless domain tests for the learning flow (no browser required).
 *   node scripts/test-flow.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storage = new Map()
const sandbox = {
  console,
  TextEncoder,
  Date,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  },
  window: {},
}
sandbox.window.window = sandbox.window
vm.createContext(sandbox)
for (const file of ['app/data.js', 'app/grouping.js', 'app/store.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), sandbox, { filename: file })
}
const FI = sandbox.window.FI
const { pack, groups } = sandbox.window.FI_DATA

let passed = 0, failed = 0
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`) }
}
const g = (id) => groups.groups.find((x) => x.id === id)

console.log('Grouping')
ok('17 groups across six levels', groups.groups.length === 17, `got ${groups.groups.length}`)
ok('every group has exactly 5 items', groups.groups.every((x) => x.itemIds.length === 5))
ok('every level has at least one word group', groups.levels.every((l) => l.wordGroups >= 1))
ok('every level has at least one sentence group', groups.levels.every((l) => l.sentenceGroups >= 1))
ok('all six sentence lanes are ready', groups.levels.every((l) => l.sentenceStatus === 'ready'))
ok('A1 has 3 word + 2 sentence groups', groups.levels[0].wordGroups === 3 && groups.levels[0].sentenceGroups === 2)
ok('no duplicate item across groups', (() => {
  const all = groups.groups.flatMap((x) => x.itemIds.map((i) => `${x.kind}:${i}`))
  return new Set(all).size === all.length
})())
ok('all group items share the group level', groups.groups.every((x) => {
  const items = x.kind === 'word' ? pack.words : pack.sentences
  return x.itemIds.every((id) => items.find((i) => i.id === id)?.cefr === x.level)
}))

console.log('Choice round')
const wg = g('A1-W-01')
const qs = FI.buildChoiceQuestions(wg, pack, { seed: 7 })
ok('one question per item', qs.length === 5)
ok('exactly four options per question', qs.every((q) => q.options.length === 4))
ok('exactly one correct option per question', qs.every((q) => q.options.filter((o) => o.id === q.itemId).length === 1))
ok('the target is always among the four options', qs.every((q) => q.options.some((o) => o.id === q.itemId)))
ok('prompt carries zh + en + image', qs.every((q) => q.promptZh && q.promptEn && q.image))
const retryQs = FI.buildChoiceQuestions(wg, pack, { scopeIds: ['talo', 'katu'], seed: 99 })
ok('retry narrows questions but keeps a four-option pool', retryQs.length === 2 && retryQs[0].options.length === 4)
const sq = FI.buildChoiceQuestions(g('A1-S-01'), pack, {})
ok('sentence groups use fiText as options', sq.every((q) => q.options.every((o) => o.label.includes(' '))))

console.log('Answer normalisation')
const n = FI.normalizeAnswer
ok('case + punctuation', n('  TALO. ') === 'talo')
ok('ä tolerance', n('leipä') === 'leipa')
ok('ö tolerance', n('SYÖDÄ') === 'syoda')
ok('hyphen tolerance', n('talo-') === 'talo')
ok('wrong answer rejected', n('kauppa') !== 'talo')

console.log('Cloze round (letter-by-letter)')
const cw = FI.buildClozeQuestions(wg, pack)
ok('word cloze answer is the lemma', cw.every((q, i) => q.answer === pack.words.find((w) => w.id === wg.itemIds[i]).lemma))
ok('three graded hints', cw.every((q) => q.hints.length === 3))
ok('cloze uses one underline per letter', cw.every((q) => q.letters.length === FI.lettersOf(q.answer).length))
ok('cloze randomly reveals some but not all letters', cw.every((q) => q.reveal.some(Boolean) && q.reveal.some((x) => !x)))
const dictNoReveal = FI.buildLetterQuestions(wg, pack, null, 'dictation')
ok('cloze reveal differs from dictation (which shows nothing)', cw.every((q, i) => q.reveal.join('') !== dictNoReveal[i].reveal.join('')))
ok('cloze reveal is deterministic across rebuilds', JSON.stringify(FI.buildClozeQuestions(wg, pack)) === JSON.stringify(cw))
ok('cloze questions carry an image for the prompt', cw.every((q) => q.image))
ok('randomReveal varies with the seed', FI.randomReveal(FI.lettersOf('kaupunki'), 1).join('') !== FI.randomReveal(FI.lettersOf('kaupunki'), 999).join(''))
ok('cloze hint order covers every blank', cw.every((q) => q.hintOrder.length === q.reveal.filter((x) => !x).length))
const cs = FI.buildClozeQuestions(g('A1-S-01'), pack)
ok('sentence cloze masks a token', cs.every((q) => q.fiLine?.includes('______')))
ok('sentence cloze answer normalises to a real token', cs.every((q) => n(q.answer).length > 0))
ok('sentence cloze also uses letter slots', cs.every((q) => Array.isArray(q.letters) && q.reveal.length === q.letters.length))

console.log('Group progression')
ok('A1-W-01 → A1-W-02', FI.nextGroupId(groups, 'A1-W-01') === 'A1-W-02')
ok('last A1 word group → next level', FI.nextGroupId(groups, 'A1-W-03') === 'A2-W-01')
ok('last group returns null', FI.nextGroupId(groups, groups.groups.at(-1).id) === null)

console.log('Progress store')
let st = FI.Store.load()
ok('fresh state has anonId and no session', Boolean(st.anonId) && st.session === null)
const fakeSession = {
  groupId: 'A1-W-01',
  itemIds: wg.itemIds,
  scopeIds: wg.itemIds,
  attempt: 1,
  retryCount: 0,
  choiceAnswers: [
    { itemId: 'talo', correct: true }, { itemId: 'kauppa', correct: false },
    { itemId: 'katu', correct: true }, { itemId: 'kirja', correct: true }, { itemId: 'auto', correct: true },
  ],
  clozePercent: 80,
  choicePercent: 80,
  lastWrongIds: ['kauppa'],
}
const r = FI.Store.recordChoice(st, fakeSession)
ok('choice result 4/5 with one wrong word', r.correct === 4 && r.wrongIds.length === 1)
ok('wrong word enters mistake book', st.mistakes['kauppa']?.count === 1)
FI.Store.recordComplete(st, fakeSession)
ok('group marked completed', st.groups['A1-W-01'].status === 'completed')
ok('event log appended', st.eventLog.length === 2)

const { file } = await FI.Store.buildExport(st)
ok('export has portable schema', file.format === 'finnish-learn-progress' && file.schema === 1)
ok('checksum verifies', await FI.Store.verifyChecksum(file))
const reparsed = FI.Store.parseImport(JSON.stringify(file))
ok('import parses', reparsed.ok === true)
const diff = FI.Store.diff(st, file)
ok('re-import of own file reports zero new events', diff.newEvents === 0, `got ${diff.newEvents}`)
const other = FI.Store.load()
// simulate a second device with a different anonId and its own events
const st2 = { ...other, anonId: 'device-B' }
FI.Store.event(st2, 'choice_round', { groupId: 'A2-W-01', total: 5, correct: 5, wrongIds: [] })
const file2 = await FI.Store.buildExport(st2)
const merged = FI.Store.merge(st, file2.file)
ok('merge dedupes by (anonId, clientSeq)', merged.eventLog.length === 3)
FI.Store.merge(merged, file2.file)
ok('repeated import adds no duplicate events', merged.eventLog.length === 3)
ok('merged state keeps local targetLevel', merged.preferences.targetLevel === st.preferences.targetLevel)

console.log('Mode registry & pipeline')
ok('six practice modes registered', FI.PRACTICE_MODES.length === 6)
ok('spelling mode is fully removed', !FI.PRACTICE_MODES.includes('spelling') && !FI.MODE_META.spelling)
ok('word pipeline has 8 stages', FI.buildPipeline('word', FI.DEFAULT_MODES).join(',') ===
  'memorize,choice,listen,findImage,match,cloze,dictation,complete')
ok('sentence pipeline skips word-only modes', FI.buildPipeline('sentence', FI.DEFAULT_MODES).join(',') ===
  'memorize,choice,listen,match,cloze,complete')
ok('slim preset keeps four rounds', FI.buildPipeline('word', FI.SLIM_MODES).length === 6)
ok('unknown modes are filtered out', FI.sanitizeModes(['listen', 'bogus', 'listen']).join(',') === 'listen')
ok('empty mode list falls back to choice', FI.sanitizeModes([]).join(',') === 'choice')
ok('preferences default to the full flow', st2.preferences.enabledModes.length === 6)

console.log('Listen / find-image rounds')
const listenQs = FI.buildSelectQuestions(wg, pack, { seed: 11, optionCount: 4, hideLabel: true })
ok('listen: one question per word', listenQs.length === 5)
ok('listen: exactly four options', listenQs.every((q) => q.options.length === 4))
ok('listen: every option has an image and both meanings', listenQs.every((q) => q.options.every((o) => o.image && o.zh && o.en) && q.audioText))
ok('listen: NO option exposes the Finnish word', listenQs.every((q) => q.options.every((o) => o.label === undefined)))
ok('listen: exactly one target per question', listenQs.every((q) => q.options.filter((o) => o.id === q.itemId).length === 1))
ok('listen: feedback never prints the word', listenQs.every((q) => Boolean(q.correctMeaning)))
const imageQs = FI.buildSelectQuestions(wg, pack, { seed: 11, optionCount: 4, textOnly: true })
ok('find-image: exactly four options', imageQs.every((q) => q.options.length === 4))
ok('find-image: prompt has zh + en meaning', imageQs.every((q) => q.promptZh && q.promptEn))
ok('find-image: options carry no pictures', imageQs.every((q) => q.options.every((o) => !o.image)))
ok('find-image: options are plain Finnish words', imageQs.every((q) => q.options.every((o) => typeof o.label === 'string')))
ok('find-image: the picture stays in the prompt', imageQs.every((q) => q.image))
const narrowQs = FI.buildSelectQuestions(wg, pack, { scopeIds: ['talo'], seed: 11, optionCount: 4, hideLabel: true })
ok('retry keeps a four-option pool even with one target', narrowQs.length === 1 && narrowQs[0].options.length === 4)
ok('option order is deterministic for the same seed',
  JSON.stringify(FI.buildSelectQuestions(wg, pack, { seed: 11, optionCount: 4, textOnly: true })) === JSON.stringify(imageQs))
ok('default option count is four', FI.buildSelectQuestions(wg, pack, { seed: 11 }).every((q) => q.options.length === 4))

console.log('Word matching round')
const pairs = FI.buildMatchPairs(wg, pack, null, 31)
ok('both rows cover all five items', pairs.left.length === 5 && pairs.right.length === 5)
ok('rows contain the same ids', new Set(pairs.left.map((x) => x.id)).size === 5 &&
  pairs.left.every((x) => pairs.right.some((y) => y.id === x.id)))
ok('board is not pre-aligned', pairs.left.some((x, i) => x.id !== pairs.right[i].id))
ok('meaning row shows zh + en', pairs.right.every((x) => x.label.includes('·')))
ok('meaning row keeps raw zh/en for live language switching', pairs.right.every((x) => x.zh && x.en))
ok('match row honours en-only', FI.buildMatchPairs(wg, pack, null, 31, 'en').right.every((x) => !x.label.includes('房屋')))
ok('match pairs are deterministic', JSON.stringify(FI.buildMatchPairs(wg, pack, null, 31)) === JSON.stringify(pairs))

console.log('Dictation round')
const dictQs = FI.buildLetterQuestions(wg, pack, null, 'dictation')
ok('dictation answer is the lemma', dictQs.every((q, i) => q.answer === pack.words.find((w) => w.id === wg.itemIds[i]).lemma))
ok('dictation reveals no letters', dictQs.every((q) => q.reveal.every((x) => !x)))
ok('one underline per letter', dictQs.every((q) => q.letters.length === FI.lettersOf(q.answer).length))
ok('three graded hints + hint reveal order', dictQs.every((q) => q.hints.length === 3 && q.hintOrder.length === q.letters.length))
ok('dictation carries images and audio text', dictQs.every((q) => q.image && q.audioText))
const strict = FI.strictAnswer
ok('strict answer folds case/space only', strict('  TALO ') === 'talo')
ok('strict answer keeps ä', strict('LEIPÄ') === 'leipä' && strict('leipa') !== strict('leipä'))
ok('strict answer rejects stray punctuation', strict('talo.') !== 'talo')

console.log('Display preferences & speech')
ok('meaning language options', FI.MEANING_LANGS.join(',') === 'both,zh,en')
ok('formatMeaning: both', FI.formatMeaning('房屋', 'a house', 'both') === '房屋 / a house')
ok('formatMeaning: zh only', FI.formatMeaning('房屋', 'a home', 'zh') === '房屋')
ok('formatMeaning: en only', FI.formatMeaning('房屋', 'a home', 'en') === 'a home')
ok('theme options', FI.THEMES.join(',') === 'light,dark,system')
const cleanPrefs = FI.sanitizePrefs({
  meaningLang: 'bogus', theme: 'neon', bgm: 'yes', targetLevel: 'Z9',
  enabledModes: ['choice', 'spelling'],
})
ok('sanitizePrefs clamps invalid meaning/theme/level/bgm',
  cleanPrefs.meaningLang === 'both' && cleanPrefs.theme === 'system' && cleanPrefs.bgm === false && cleanPrefs.targetLevel === 'A1')
ok('sanitizePrefs drops the removed spelling mode', cleanPrefs.enabledModes.join(',') === 'choice')
ok('speech rates are clearly distinct', FI.SPEECH_RATE.slow <= FI.SPEECH_RATE.normal / 2)
ok('syllabify talo → ta/lo', FI.syllabify('talo').join('-') === 'ta-lo')
ok('syllabify kauppa → kau/ppa', FI.syllabify('kauppa').join('-') === 'kau-ppa')
ok('syllabify kirja → ki/rja', FI.syllabify('kirja').join('-') === 'ki-rja')
ok('syllabify is case-stable', FI.syllabify('talo').join('-') === FI.syllabify('Talo').join('-'))

console.log('Audio assets')
ok('itemAudio: demo pack declares no clips', FI.itemAudio(pack.words[0]) === null)
ok('itemAudio: declared clip resolves to its path', FI.itemAudio({ audio: { path: 'assets/audio/talo.mp3' } }) === 'assets/audio/talo.mp3')
ok('itemAudio: malformed audio object is ignored', FI.itemAudio({ audio: {} }) === null)
const noClipQs = FI.buildSelectQuestions(wg, pack, { seed: 7, optionCount: 4, hideLabel: true })
ok('questions: audioFile null when no clip exists', noClipQs.every((q) => q.audioFile === null))
const talo = pack.words.find((w) => w.id === 'talo')
talo.audio = { path: 'assets/audio/talo.mp3', source: 'tts', license: 'own', durationSec: 1.2, reviewStatus: 'human-verified' }
const clipQs = FI.buildSelectQuestions(wg, pack, { seed: 7, optionCount: 4, hideLabel: true })
const clipLetterQs = FI.buildLetterQuestions(wg, pack, wg.itemIds, 'dictation')
ok('questions: listen carries the clip path', clipQs.find((q) => q.itemId === 'talo')?.audioFile === 'assets/audio/talo.mp3')
ok('questions: dictation carries the clip path', clipLetterQs.find((q) => q.itemId === 'talo')?.audioFile === 'assets/audio/talo.mp3')
ok('questions: other items stay on the TTS fallback', clipQs.filter((q) => q.itemId !== 'talo').every((q) => q.audioFile === null))
delete talo.audio

console.log('Generic round recording')
const st3 = FI.Store.load()
const roundSession = {
  groupId: 'A1-W-01', itemIds: wg.itemIds, scopeIds: ['talo'], attempt: 2, retryCount: 1,
  results: { choice: { percent: 80 }, dictation: { percent: 60 } },
}
const rr = FI.Store.recordRound(st3, roundSession, {
  mode: 'dictation', total: 1, correct: 0, wrongIds: ['talo'], percent: 0, fullRound: false,
})
ok('dictation round returns zero score', rr.percent === 0)
ok('dictation wrong word enters mistake book', st3.mistakes['talo']?.count === 1)
ok('round event uses the mode name', st3.eventLog.at(-1).type === 'dictation_round')
ok('narrow retry does not lower best score', st3.groups['A1-W-01'].bestScore === 0)
FI.Store.recordComplete(st3, roundSession)
ok('completion event carries per-mode scores', st3.eventLog.at(-1).payload.modes.choice === 80 && st3.eventLog.at(-1).payload.modes.dictation === 60)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
