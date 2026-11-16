/**
 * Rule-derived Finnish morphology + IPA for the A1-B1 Excel import.
 *
 *   node scripts/fi-morphology.mjs --self-test
 *
 * WHY THIS EXISTS
 * The workbook supplies lemma / Chinese gloss / POS / suggested CEFR only. The
 * app, however, shows a strong+weak stem, six basic cases and (for verbs) the
 * six learner verb types with principal parts. Kotus "Nykysuomen sanalista"
 * (CC BY 4.0, see data/import/KOTUS-NOTICE.txt) supplies the declension /
 * conjugation class number and the consonant-gradation letter, so this module
 * turns `lemma + Kotus class` into the fields the CSV schema requires.
 *
 * IMPORTANT: this is STRUCTURAL derivation, not a Finnish grammar engine. Every
 * imported row is written with reviewStatus "auto-derived" and every image /
 * audio asset stays "pending". Forms for indeclinable words fall back to a
 * clearly marked "—" (not applicable) instead of inventing a plausible-looking
 * but wrong Finnish word. A Finnish linguist must verify every paradigm before
 * production (see data/import/import-report.json and README.md).
 *
 * Pure module: importing it never touches the network or the filesystem.
 */
import { readFileSync } from 'node:fs'

/* ── Kotus sanalista ────────────────────────────────────────────────────── */

/** "1*F" -> { number: 1, grad: 'F' }; "73, (77)" -> { number: 73, grad: null } */
export function parseKotusType(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { number: null, grad: null, raw: s }
  const n = Number.parseInt(s, 10)
  const m = s.match(/\*([A-L])/)
  return { number: Number.isFinite(n) ? n : null, grad: m ? m[1] : null, raw: s }
}

/**
 * lemma -> entries. One spelling can be both a noun and a verb ("sataa"),
 * hence a list rather than a single value.
 */
export function loadKotus(filePath) {
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const index = new Map()
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue
    const [headword, , cls, type] = line.split('\t')
    if (!headword) continue
    const key = headword.toLowerCase()
    const entry = { cls: String(cls ?? '').trim(), ...parseKotusType(type) }
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(entry)
  }
  return index
}

export function lookupKotus(index, lemma, wantVerb) {
  const entries = index.get(String(lemma).toLowerCase()) ?? []
  const isVerbClass = (e) => e.cls === 'verbi' || (e.number >= 52 && e.number <= 78)
  return entries.find((e) => isVerbClass(e) === wantVerb)
    ?? entries.find((e) => e.number !== null) ?? null
}

/* ── phonology ──────────────────────────────────────────────────────────── */

const BACK = /[aou]/i
const FRONT = /[äöy]/i
const VOWELS = /[aeiouyäö]/i

/** 'back' | 'front' | 'neutral' (only e/i -> takes front suffixes). */
export function vowelHarmony(word) {
  const w = String(word).toLowerCase()
  const front = FRONT.test(w)
  const back = BACK.test(w)
  if (front && !back) return 'front'
  if (back && !front) return 'back'
  if (front && back) return BACK.test(w.replace(/[äöy]/g, '')) ? 'back' : 'front'
  return 'neutral'
}
const vowelOf = (h) => (h === 'back' ? 'a' : 'ä')

/** Approximate, rule-derived broad IPA. Stress is always on the first syllable. */
const IPA_MAP = {
  a: 'ɑ', e: 'e', i: 'i', o: 'o', u: 'u', y: 'y', ä: 'æ', ö: 'ø',
  b: 'b', d: 'd', f: 'f', g: 'g', h: 'h', j: 'j', k: 'k', l: 'l', m: 'm',
  n: 'n', p: 'p', r: 'r', s: 's', t: 't', v: 'ʋ', w: 'ʋ', z: 'ts',
  å: 'o', š: 'ʃ', ž: 'ʒ',
}
export function deriveIpa(lemma) {
  const out = []
  const chars = [...String(lemma).toLowerCase()]
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === ' ' || c === '-') { out.push(c === '-' ? '' : ' '); continue }
    if (!IPA_MAP[c]) { out.push(c); continue }
    if (c === chars[i + 1]) { out.push(IPA_MAP[c] + 'ː'); i++; continue }
    if (c === 'n' && chars[i + 1] === 'g') { out.push('ŋː'); i++; continue }
    if (c === 'n' && chars[i + 1] === 'k') { out.push('ŋ'); continue }
    out.push(IPA_MAP[c])
  }
  return `/ˈ${out.join('').replace(/\s+/g, ' ').trim()}/`
}

/* ── consonant gradation (Kotus star letters A-L) ───────────────────────── */

export const GRADATION = {
  A: { strong: 'kk', weak: 'k', label: 'kk~k' },
  B: { strong: 'pp', weak: 'p', label: 'pp~p' },
  C: { strong: 'tt', weak: 't', label: 'tt~t' },
  D: { strong: 'k', weak: '', label: 'k~∅' },
  E: { strong: 'p', weak: 'v', label: 'p~v' },
  F: { strong: 't', weak: 'd', label: 't~d' },
  G: { strong: 'nk', weak: 'ng', label: 'nk~ng' },
  H: { strong: 'mp', weak: 'mm', label: 'mp~mm' },
  I: { strong: 'lt', weak: 'll', label: 'lt~ll' },
  J: { strong: 'nt', weak: 'nn', label: 'nt~nn' },
  K: { strong: 'rt', weak: 'rr', label: 'rt~rr' },
  L: { strong: 'lk', weak: 'lj', label: 'lk~lj' },
}

/** Apply gradation to the LAST occurrence of the strong pattern in a stem. */
export function weakStem(strong, grad) {
  const g = GRADATION[grad]
  if (!g) return strong
  if (grad === 'L') return strong.replace(/([lr])k(?=[aeiouyäö]|$)/i, '$1j')
  if (grad === 'D') {
    // k disappears; an i preceded by a vowel turns into j:
    // aika -> aja-, poika -> poja-, but ikä -> iä- keeps its initial i.
    let idx = -1
    for (let i = 0; i < strong.length; i++) {
      const c = strong[i].toLowerCase()
      if (c === 'k' && (i === strong.length - 1 || VOWELS.test(strong[i + 1]))) idx = i
    }
    if (idx < 0) return strong
    return (strong.slice(0, idx) + strong.slice(idx + 1))
      .replace(/([aeiouyäö])i(?=[aeiouyäö])/i, '$1j')
  }
  const idx = strong.toLowerCase().lastIndexOf(g.strong)
  if (idx < 0) return strong
  return strong.slice(0, idx) + g.weak + strong.slice(idx + g.strong.length)
}

/* ── nominal paradigms ──────────────────────────────────────────────────── */

const INDECLINABLE_CLASSES = new Set([99, 100, 101])
const NEN_CLASSES = new Set([38])
const SI_CLASSES = new Set([27])
const S_STEM_39 = new Set([39])
const S_STEM_40 = new Set([40])
const AS_STEM_41 = new Set([41])
const MPI_CLASSES = new Set([16])
const IN_CLASSES = new Set([31, 32, 33])
const UT_CLASSES = new Set([34, 35, 36, 43])
const E_STEM_CLASSES = new Set([7, 23, 24, 25, 26, 48])

const DISPLAY = {
  indeclinable: 'indeclinable',
  pending: 'paradigm pending',
  phrase: 'phrase (paradigm pending)',
  pluraliaTantum: 'pluralia tantum (paradigm pending)',
  vowel: 'Kotus %d 型',
  eStem: 'Kotus %d 型（-e 词干）',
  siStem: 'Kotus 27 型（-si 词干）',
  nenStem: 'Kotus 38 型（-nen 词干）',
  sStem: 'Kotus %d 型（-s 词干）',
  sStemGuess: 'Kotus 39/40 型（推测）',
  asStem: 'Kotus 41 型',
  mpiStem: 'Kotus 16 型（-mpi 词干）',
  inStem: 'Kotus %d 型（-in 词干）',
  anStem: 'Kotus 33 型（-än 词干）',
  miesStem: 'Kotus 42 型（mies 词干）',
  kevatStem: 'Kotus 44 型（kevät 词干）',
  onStem: 'Kotus 34 型（-ton 词干）',
  nutStem: 'Kotus 47 型（-nut 分词）',
  consonantStem: 'Kotus %d 型（辅干 + -i）',
  utStem: 'Kotus %d 型（-ut 词干）',
}

/**
 * A word with no derivable paradigm is NEVER claimed to be "indeclinable":
 * those two states need different labels so a reviewer can tell a genuine
 * adverb from a gap in our rule coverage.
 */
export function nominalFamily(lemma, cls, pos) {
  if (/\s/.test(lemma)) return 'phrase'
  if (INDECLINABLE_CLASSES.has(cls) || pos === 'adverb' || pos === 'particle') return 'indeclinable'
  if (/nen$/i.test(lemma) || NEN_CLASSES.has(cls)) return 'nenStem'
  if (SI_CLASSES.has(cls)) return 'siStem'
  if (S_STEM_39.has(cls) || S_STEM_40.has(cls)) return 'sStem'
  if (AS_STEM_41.has(cls) || (cls === null && /(?:as|äs)$/i.test(lemma))) return 'asStem'
  if (MPI_CLASSES.has(cls) && /mpi$/i.test(lemma)) return 'mpiStem'
  if (cls === 44 && /ät$/i.test(lemma)) return 'kevatStem'
  if ((cls === 42 || cls === null) && /es$/i.test(lemma)) return 'miesStem'
  if ((cls === 34 || cls === null) && /(?:on|ön)$/i.test(lemma)) return 'onStem'
  if ((cls === 47 || cls === null) && /(?:nut|nyt)$/i.test(lemma)) return 'nutStem'
  if ((cls === 33 || cls === null) && /än$/i.test(lemma)) return 'anStem'
  if ((IN_CLASSES.has(cls) || cls === null) && /in$/i.test(lemma)) return 'inStem'
  if (UT_CLASSES.has(cls) && /(?:ut|yt)$/i.test(lemma)) return 'utStem'
  if (cls === null && /(?:us|ys|os|ös)$/i.test(lemma)) return 'sStemGuess'
  if (E_STEM_CLASSES.has(cls) || /[^aeiouyäö]e$/i.test(lemma)) return 'eStem'
  if (/[aeiouyäö]$/i.test(lemma)) return 'vowel'
  if (/[^aeiouyäö]$/i.test(lemma) && [5, 6].includes(cls)) return 'consonantStem'
  if (/t$/i.test(lemma)) return 'pluraliaTantum'
  return 'pending'
}

/**
 * Kotus class 101 (pronouns) is marked "no regular declension" in the word
 * list, but the A1 personal/demonstrative pronouns are extremely visible in a
 * beginner app. These hand-checked forms avoid showing "—" for minä / sinä.
 * tuple = [strong stem, gen, par, ine, ela, ill]
 */
const PRONOUN_FORMS = {
  minä: ['minu', 'minun', 'minua', 'minussa', 'minusta', 'minuun'],
  sinä: ['sinu', 'sinun', 'sinua', 'sinussa', 'sinusta', 'sinuun'],
  hän: ['häne', 'hänen', 'häntä', 'hänessä', 'hänestä', 'häneen'],
  me: ['mei', 'meidän', 'meitä', 'meissä', 'meistä', 'meihin'],
  te: ['tei', 'teidän', 'teitä', 'teissä', 'teistä', 'teihin'],
  he: ['hei', 'heidän', 'heitä', 'heissä', 'heistä', 'heihin'],
  tämä: ['tämä', 'tämän', 'tätä', 'tässä', 'tästä', 'tähän'],
  tuo: ['tuo', 'tuon', 'tuota', 'tuossa', 'tuosta', 'tuohon'],
  se: ['sii', 'sen', 'sitä', 'siinä', 'siitä', 'siihen'],
  mikä: ['mi', 'minkä', 'mitä', 'missä', 'mistä', 'mihin'],
  kuka: ['kene', 'kenen', 'ketä', 'kenessä', 'kenestä', 'keneen'],
}

const dashForms = () => ({
  nom: '—', gen: '—', par: '—', ine: '—', ela: '—', ill: '—',
  suffix_gen: '—', suffix_par: '—', suffix_ine: '—', suffix_ela: '—', suffix_ill: '—',
})

/**
 * Derive every nominal CSV column. Returns `{ ...fields, quality }` where
 * quality is 'kotus-rule' | 'shape-rule' | 'indeclinable'.
 */
export function deriveNominal({ lemma, pos = 'noun', cls = null, grad = null }) {
  const L = String(lemma).trim()
  const h = vowelHarmony(L)
  const a = vowelOf(h)
  const family = nominalFamily(L, cls, pos)
  const label = (DISPLAY[family] ?? 'Kotus %d 型').replace('%d', cls ?? '—')
  // Kotus 99/100/101 are not nominal declension classes (1-51); leave the
  // column empty so csv-pack stores null and the validator accepts it.
  const kotusType = cls !== null && cls >= 1 && cls <= 51 ? cls : ''
  const base = {
    stem_strong: L + '-', stem_weak: L + '-', gradation: GRADATION[grad]?.label ?? '',
    harmony: h, kotusType, declensionClass: label,
    singular: L, plural: '—', ...dashForms(), quality: 'unsupported',
  }
  const set = (o) => ({ ...base, ...o, nom: L })

  const pron = PRONOUN_FORMS[L.toLowerCase()]
  if (pron) {
    const [stem, gen, par, ine, ela, ill] = pron
    return set({
      stem_strong: stem + '-', stem_weak: stem + '-', gradation: '',
      declensionClass: 'pronoun (irregular)', kotusType: '',
      singular: L, plural: '—',
      gen, par, ine, ela, ill,
      suffix_gen: '-n', suffix_par: '-' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-Vn',
      quality: 'hand-checked',
    })
  }

  if (['indeclinable', 'pending', 'phrase', 'pluraliaTantum'].includes(family)) {
    // Genuine adverbs/particles (Kotus 99/101) really are indeclinable; the
    // other three mean "we could not safely derive this paradigm yet". Both
    // render "—" in the case table, but the declensionClass label differs.
    return set({
      stem_strong: L + '-', stem_weak: L + '-', gradation: '',
      singular: family === 'pluraliaTantum' ? '—' : L,
      plural: family === 'pluraliaTantum' ? L : '—',
      quality: family === 'indeclinable' ? 'indeclinable' : 'pending',
    })
  }

  /** Most special stems share the same endings; only par/ill differ. */
  const stemTable = ({ strong, weak, par, ill, plural, parSuffix, illSuffix, gradation = '' }) => set({
    stem_strong: strong + '-', stem_weak: weak + '-', gradation,
    singular: L, plural: plural ?? weak + 't',
    gen: weak + 'n', par, ine: weak + 'ss' + a, ela: weak + 'st' + a, ill,
    suffix_gen: '-n', suffix_par: parSuffix, suffix_ine: '-ss' + a,
    suffix_ela: '-st' + a, suffix_ill: illSuffix,
    quality: 'kotus-rule',
  })

  if (family === 'vowel') {
    // talo -> talon / taloa / talossa / talosta / taloon / talot
    // maa  -> maan  / maata / maassa / maasta / maahan / maat
    const S = L
    const W = weakStem(L, grad)
    const last = S.slice(-1)
    const long = VOWELS.test(S.slice(-2, -1)) && VOWELS.test(last)
    const ill = cls === 17 ? S + 'seen' : S + (long ? 'h' + last : last) + 'n'
    return set({
      stem_strong: S + '-', stem_weak: W + '-',
      singular: L, plural: W + 't',
      gen: W + 'n', par: long ? S + 't' + a : S + a,
      ine: W + 'ss' + a, ela: W + 'st' + a, ill,
      suffix_gen: '-n', suffix_par: long ? '-t' + a : '-' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a,
      suffix_ill: cls === 17 ? '-seen' : (long ? '-hVn' : '-Vn'),
      quality: cls !== null || grad ? 'kotus-rule' : 'shape-rule',
    })
  }

  if (family === 'eStem') {
    // perhe -> perheen / perhettä / perheessä / perheestä / perheeseen / perheet
    // kieli -> kielen  / kieltä  / kielessä / kielestä / kieleen   / kielet
    const iStem = /i$/i.test(L)
    const stem = iStem ? L.slice(0, -1) + 'e' : L + 'e'
    const W = weakStem(stem, grad)
    const tPart = [24, 25, 26].includes(cls)
    const par = iStem ? (tPart ? stem.slice(0, -1) + 't' + a : stem + a) : L + 'tt' + a
    return set({
      stem_strong: stem + '-', stem_weak: W + '-',
      singular: L, plural: W + 't',
      gen: W + 'n', par, ine: W + 'ss' + a, ela: W + 'st' + a,
      ill: iStem ? stem + 'en' : stem + 'seen',
      suffix_gen: '-n',
      suffix_par: iStem ? (tPart ? '-t' + a : '-' + a) : '-tt' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a,
      suffix_ill: iStem ? '-en' : '-seen',
      quality: 'kotus-rule',
    })
  }

  if (family === 'siStem') {
    // vesi  -> veden / vettä  / vedessä / vedestä / veteen  / vedet
    // vuosi -> vuoden / vuotta / vuodessa / vuodesta / vuoteen / vuodet
    const S = L.replace(/si$/i, 'te')
    const W = S.replace(/t(?=[aeiouyäö])/i, 'd')
    return set({
      stem_strong: S + '-', stem_weak: W + '-', gradation: 't~d',
      singular: L, plural: W + 't',
      gen: W + 'n', par: L.replace(/si$/i, 't') + 't' + a,
      ine: W + 'ss' + a, ela: W + 'st' + a, ill: S + 'en',
      suffix_gen: '-n', suffix_par: '-tt' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-en',
      quality: 'kotus-rule',
    })
  }

  if (family === 'nenStem') {
    // ihminen -> ihmisen / ihmistä / ihmisessä / ihmisestä / ihmiseen / ihmiset
    const S = L.replace(/nen$/i, 'se')
    const short = L.replace(/nen$/i, 's')
    return set({
      stem_strong: S + '-', stem_weak: S + '-', gradation: '',
      singular: L, plural: S + 't',
      gen: S + 'n', par: short + 't' + a, ine: S + 'ss' + a, ela: S + 'st' + a,
      ill: S + 'en',
      suffix_gen: '-n', suffix_par: '-t' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-en',
      quality: 'kotus-rule',
    })
  }

  if (family === 'sStem' || family === 'sStemGuess') {
    const B = L.replace(/s$/i, '')
    // Compounds absent from Kotus ("työsopimus") follow the -kse- pattern;
    // -eys/-eus words ("mielenterveys") follow the -de-/-te- pattern.
    if (S_STEM_40.has(cls) || (cls === null && /(?:eys|eus)$/i.test(L))) {
      // kalleus -> kalleuden / kalleutta / kalleudessa / kalleuteen / kalleudet
      const W = B + 'de', ST = B + 'te'
      return set({
        stem_strong: ST + '-', stem_weak: W + '-', gradation: 't~d',
        singular: L, plural: W + 't',
        gen: W + 'n', par: B + 'tt' + a,
        ine: W + 'ss' + a, ela: W + 'st' + a, ill: ST + 'en',
        suffix_gen: '-n', suffix_par: '-tt' + a,
        suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-en',
        quality: 'kotus-rule',
      })
    }
    // vastaus -> vastauksen / vastausta / vastauksessa / vastaukseen / vastaukset
    return set({
      stem_strong: B + 'kse-', stem_weak: B + 'kse-', gradation: '',
      singular: L, plural: B + 'kset',
      gen: B + 'ksen', par: L + 't' + a,
      ine: B + 'kse' + 'ss' + a, ela: B + 'kse' + 'st' + a,
      ill: B + 'kseen',
      suffix_gen: '-ksen', suffix_par: '-t' + a,
      suffix_ine: '-kse' + 'ss' + a, suffix_ela: '-kse' + 'st' + a, suffix_ill: '-kseen',
      quality: 'kotus-rule',
    })
  }

  if (family === 'asStem') {
    // hammas    -> hampaan / hammasta / hampaassa / hampaaseen / hampaat
    // matkaopas -> matkaoppaan / matkaopasta / matkaoppaassa
    // Inverse gradation: nominative carries the weak grade.
    const B = L.replace(/as$/i, '')
    const ST = /mm$/i.test(B)
      ? B.replace(/mm$/i, 'mp') + (a === 'a' ? 'aa' : 'ää')
      : B + B.slice(-1) + (a === 'a' ? 'aa' : 'ää')
    const W = B + a
    return set({
      stem_strong: ST + '-', stem_weak: W + '-', gradation: 'mp~mm',
      singular: L, plural: ST + 't',
      gen: ST + 'n', par: W + 'st' + a, ine: ST + 'ss' + a, ela: ST + 'st' + a,
      ill: ST + 'seen',
      suffix_gen: '-n', suffix_par: '-st' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-seen',
      quality: 'kotus-rule',
    })
  }

  if (family === 'miesStem') {
    // mies -> miehen / miestä / miehessä / mieheen / miehet
    const S = L.replace(/es$/i, '') + 'ehe'
    return stemTable({ strong: S, weak: S, par: L + 't' + a, ill: S + 'en',
      parSuffix: '-t' + a, illSuffix: '-en' })
  }

  if (family === 'anStem') {
    // sydän -> sydämen / sydäntä / sydämessä / sydämeen / sydämet
    const S = L.replace(/än$/i, 'äme')
    return stemTable({ strong: S, weak: S, par: L + 't' + a, ill: S + 'en',
      parSuffix: '-t' + a, illSuffix: '-en' })
  }

  if (family === 'kevatStem') {
    // kevät -> kevään / kevättä / keväässä / kevääseen / keväät
    const S = L.replace(/ät$/i, 'ää')
    return stemTable({ strong: S, weak: S, par: L + 't' + a, ill: S + 'seen',
      parSuffix: '-t' + a, illSuffix: '-seen' })
  }

  if (family === 'onStem') {
    // mahdoton -> mahdottoman / mahdotonta / mahdottomassa / mahdottomaan
    const B = L.replace(/(?:on|ön)$/i, '')
    const S = B + B.slice(-1) + (a === 'a' ? 'oma' : 'ömä')
    return stemTable({ strong: S, weak: S, par: L + 't' + a, ill: S + a + 'n',
      parSuffix: '-t' + a, illSuffix: '-Vn', gradation: 't~tt' })
  }

  if (family === 'nutStem') {
    // hermostunut -> hermostuneen / hermostunutta / hermostuneessa
    const S = L.replace(/(?:ut|yt)$/i, 'ee')
    return stemTable({ strong: S, weak: S, par: L.slice(0, -1) + 'tt' + a, ill: S + 'seen',
      parSuffix: '-tt' + a, illSuffix: '-seen' })
  }

  if (family === 'consonantStem') {
    // Loanwords in Kotus 5/6 gain an epenthetic -i-: internet -> internetin.
    const S = L + 'i'
    return stemTable({ strong: S, weak: S, par: S + a, ill: S + 'in',
      parSuffix: '-' + a, illSuffix: '-Vn' })
  }

  if (family === 'mpiStem') {
    // vanhempi -> vanhemman / vanhempaa / vanhemmassa / vanhempaan / vanhemmat
    const ST = L.replace(/mpi$/i, 'mpa'), W = L.replace(/mpi$/i, 'mma')
    return set({
      stem_strong: ST + '-', stem_weak: W + '-', gradation: 'mp~mm',
      singular: L, plural: W + 't',
      gen: W + 'n', par: ST + a, ine: W + 'ss' + a, ela: W + 'st' + a,
      ill: ST + a + 'n',
      suffix_gen: '-n', suffix_par: '-' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-Vn',
      quality: 'kotus-rule',
    })
  }

  if (family === 'inStem') {
    // kytkin -> kytkimen / kytkintä / kytkimessä / kytkimeen / kytkimet
    const W = L.replace(/in$/i, 'ime')
    return set({
      stem_strong: W + '-', stem_weak: W + '-', gradation: '',
      singular: L, plural: W + 't',
      gen: W + 'n', par: L + 't' + a, ine: W + 'ss' + a, ela: W + 'st' + a,
      ill: W + 'en',
      suffix_gen: '-n', suffix_par: '-t' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-en',
      quality: 'kotus-rule',
    })
  }

  if (family === 'utStem') {
    // ohut -> ohuen / ohutta / ohuessa / ohueen / ohuet
    const W = L.replace(/(?:ut|yt)$/i, 'ue')
    const ST = L.replace(/(?:ut|yt)$/i, 'u')
    return set({
      stem_strong: ST + '-', stem_weak: W + '-', gradation: 't~∅',
      singular: L, plural: W + 't',
      gen: W + 'n', par: ST + 'tt' + a, ine: W + 'ss' + a, ela: W + 'st' + a,
      ill: W + 'en',
      suffix_gen: '-n', suffix_par: '-tt' + a,
      suffix_ine: '-ss' + a, suffix_ela: '-st' + a, suffix_ill: '-en',
      quality: 'kotus-rule',
    })
  }

  return set({ quality: 'unsupported' })
}

/* ── verb paradigms ─────────────────────────────────────────────────────── */

/** Kotus conjugation class (52-78) -> learner verb type 1-6. */
const CLASS_TO_TYPE = {
  52: 1, 53: 1, 54: 1, 55: 1, 56: 1, 57: 1, 58: 1, 59: 1, 60: 1, 61: 1, 76: 1, 77: 1, 78: 1,
  62: 2, 63: 2, 64: 2, 65: 2, 68: 2, 71: 2,
  66: 3, 67: 3, 70: 3,
  73: 4, 74: 4, 75: 4,
  69: 5,
  72: 6,
}
const INF_ENDING = {
  1: '元音 + -a/-ä', 2: '-da/-dä', 3: '辅音 + -la/-na/-ra/-sta',
  4: '元音 + -ta/-tä', 5: '-ita/-itä', 6: '-eta/-etä',
}
export function verbTypeFromShape(L) {
  if (/(?:da|dä)$/i.test(L)) return 2
  if (/(?:sta|stä|lla|llä|nna|nnä|rra|rrä)$/i.test(L)) return 3
  if (/(?:ita|itä)$/i.test(L)) return 5
  if (/(?:eta|etä)$/i.test(L)) return 6
  if (/(?:ta|tä)$/i.test(L)) return 4
  return 1
}

/** Hand-checked principal parts for verbs whose formation is not rule-regular. */
const VERB_EXCEPTIONS = {
  olla: { verbType: 3, ending: '-lla', stem: 'ole-', p1: 'olen', past: 'oli', nut: 'ollut', irregular: true },
  käydä: { verbType: 2, ending: '-dä', stem: 'käy-', p1: 'käyn', past: 'kävi', nut: 'käynyt' },
  tehdä: { verbType: 2, ending: '-dä', stem: 'teh-', p1: 'teen', past: 'teki', nut: 'tehnyt' },
  nähdä: { verbType: 2, ending: '-dä', stem: 'näh-', p1: 'näen', past: 'näki', nut: 'nähnyt' },
  juoda: { verbType: 2, ending: '-da', stem: 'juo-', p1: 'juon', past: 'joi', nut: 'juonut' },
  syödä: { verbType: 2, ending: '-dä', stem: 'syö-', p1: 'syön', past: 'söi', nut: 'syönyt' },
  luoda: { verbType: 2, ending: '-da', stem: 'luo-', p1: 'luon', past: 'loi', nut: 'luonut' },
  tietää: { verbType: 1, ending: '元音 + -a/-ä', stem: 'tiedä-', p1: 'tiedän', past: 'tiesi', nut: 'tiennyt' },
  ei: { verbType: 1, ending: '—（否定动词，不变化）', stem: 'ei-', p1: 'en', past: 'ei', nut: '—', irregular: true },
  ajatella: { stem: 'ajattele-', p1: 'ajattelen', past: 'ajatteli', nut: 'ajatellut' },
  harjoitella: { stem: 'harjoittele-', p1: 'harjoittelen', past: 'harjoitteli', nut: 'harjoitellut' },
  suunnitella: { stem: 'suunnittele-', p1: 'suunnittelen', past: 'suunnitteli', nut: 'suunnitellut' },
  venytellä: { stem: 'venyttele-', p1: 'venyttelen', past: 'venytteli', nut: 'venytellyt' },
  suositella: { stem: 'suosittele-', p1: 'suosittelen', past: 'suositteli', nut: 'suositellut' },
  käsitellä: { stem: 'käsittele-', p1: 'käsittelen', past: 'käsitteli', nut: 'käsitellyt' },
  kuunnella: { stem: 'kuuntele-', p1: 'kuuntelen', past: 'kuunteli', nut: 'kuunnellut' },
  'työskennellä': { stem: 'työskentele-', p1: 'työskentelen', past: 'työskenteli', nut: 'työskennellyt' },
  hymyillä: { stem: 'hymyile-', p1: 'hymyilen', past: 'hymyili', nut: 'hymyillyt' },
  tuulla: { stem: 'tuule-', p1: 'tuulee', past: 'tuuli', nut: 'tuullut' },
  suojella: { stem: 'suojelen', p1: 'suojelen', past: 'suojeli', nut: 'suojellut' },
  juosta: { stem: 'juokse-', p1: 'juoksen', past: 'juoksi', nut: 'juossut', verbType: 3 },
}

/** 3rd person singular imperfect, keyed by Kotus conjugation class. */
function past3sg(cls, stem, L, h) {
  const a = vowelOf(h)
  const drop = (s) => s.slice(0, -1)
  const ta = L.replace(/(?:ta|tä)$/i, '')
  switch (cls) {
    case 52: return stem + 'i'                                   // sanoi / uskoi
    case 53: case 58: case 60: return drop(stem) + 'i'          // muisti / laski / lähti
    case 54: case 59: return drop(stem).replace(/t$/i, 's') + 'i' // käänsi / tunsi
    case 55: case 56: case 57: return drop(stem) + (h === 'back' ? 'oi' : 'öi') // maksoi / antoi
    case 61: return stem                                        // salli / etsi
    case 62: return stem                                        // voi
    case 63: return drop(stem) + 'i'                            // sai / myi
    case 66: return ta + 'i'                                    // julkaisi
    case 67: return drop(stem) + 'i'                            // tuli / meni / nousi
    case 69: return ta + 'tsi'                                  // tarvitsi
    case 70: case 71: case 64: case 65: return drop(stem) + 'i' // overridden by exceptions
    case 72: return ta + 'ni'                                   // vanheni
    case 73: case 74: case 75: return ta + 'si'                 // osasi / tarjosi / halusi
    case 76: return drop(stem).replace(/t$/i, 's') + 'i'        // tiesi
    default: {
      const t = verbTypeFromShape(L)
      if (t === 1) return /[aeiouyäö]{2}$/i.test(stem) ? drop(stem) + 'i' : stem + 'i'
      if (t === 2) return stem
      if (t === 3) return drop(stem) + 'i'
      if (t === 6) return ta + 'ni'
      if (t === 5) return ta + 'tsi'
      return ta + 'si'
    }
  }
}

/** Active past participle (NUT participle) per Kotus class / learner type. */
function nutParticiple(type, cls, stem, L, h) {
  const a = vowelOf(h)
  const n = a === 'a' ? 'nut' : 'nyt'
  const u = a === 'a' ? 'ut' : 'yt'
  if ([73, 74, 75, 69, 72].includes(cls)) return L.replace(/(?:ta|tä)$/i, '') + (a === 'a' ? 'nnut' : 'nnyt')
  if (cls === 66) return L.replace(/(?:ta|tä)$/i, '') + 's' + u
  if (type === 3) {
    if (/(?:sta|stä)$/i.test(L)) {
      const b = L.replace(/(?:sta|stä)$/i, 's')                 // nousta -> nous
      return b + b.slice(-1) + u                                // -> noussut
    }
    return L.slice(0, -1) + u                                   // tullut / mennyt
  }
  return stem + n
}

/**
 * Derive every verb CSV column. `kotusType` must be 52-78 for regular verbs;
 * otherwise `irregular: true` keeps the validator honest about the gap.
 */
export function deriveVerb({ lemma, cls = null, grad = null }) {
  const L = String(lemma).trim()
  // Phrasal verbs ("maksaa takaisin") conjugate like their head verb. Keep the
  // head's principal parts but flag the row as irregular / phrase so nobody
  // mistakes the derived forms for a verified full-phrase paradigm.
  if (/\s/.test(L)) {
    const head = deriveVerb({ lemma: L.split(/\s+/)[0], cls, grad: null })
    return {
      ...head,
      infinitiveEnding: `${head.infinitiveEnding}（短语）`,
      irregular: 'true', kotusType: '', quality: 'phrase',
    }
  }
  const h = vowelHarmony(L)
  const type = CLASS_TO_TYPE[cls] ?? verbTypeFromShape(L)
  let ending = INF_ENDING[type] ?? '元音 + -a/-ä'
  if (type === 1 && /(?:aa|ää)$/i.test(L)) ending = '元音 + -a/-ä（-aa）'
  const ex = VERB_EXCEPTIONS[L.toLowerCase()]
  const kotusType = cls !== null && cls >= 52 && cls <= 78 ? cls : ''
  const irregular = Boolean(ex?.irregular) || !kotusType

  if (ex) {
    return {
      verbType: ex.verbType ?? type,
      infinitiveEnding: ex.ending ?? ending,
      presentStem: ex.stem,
      present1sg: ex.p1,
      past3sg: ex.past,
      nutParticiple: ex.nut,
      irregular: irregular ? 'true' : '',
      kotusType,
      quality: 'hand-checked',
    }
  }

  let stem, p1, past, nut
  if (type === 1) {
    const S = L.slice(0, -1)                    // strong present stem
    const W = weakStem(S, grad)                 // weak present stem
    stem = W + '-'; p1 = W + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  } else if (type === 2) {
    const S = L.replace(/(?:da|dä)$/i, '')
    stem = S + '-'; p1 = S + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  } else if (type === 3) {
    const S = /(?:sta|stä)$/i.test(L)
      ? L.replace(/(?:sta|stä)$/i, 'se')       // nousta -> nouse-, juosta -> juokse-
      : L.slice(0, -1).replace(/(ll|nn|rr)$/i, (m) => m[0]) + 'e'
    stem = S + '-'; p1 = S + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  } else if (type === 4) {
    const S = L.replace(/(?:ta|tä)$/i, '') + vowelOf(h)
    stem = S + '-'; p1 = S + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  } else if (type === 5) {
    const S = L.replace(/(?:ta|tä)$/i, '') + 'tse'
    stem = S + '-'; p1 = S + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  } else {
    const S = L.replace(/(?:ta|tä)$/i, '') + 'ne'
    stem = S + '-'; p1 = S + 'n'
    past = past3sg(cls, S, L, h)
    nut = nutParticiple(type, cls, S, L, h)
  }

  return {
    verbType: type, infinitiveEnding: ending, presentStem: stem,
    present1sg: p1, past3sg: past, nutParticiple: nut,
    irregular: irregular ? 'true' : '', kotusType,
    quality: cls !== null ? 'kotus-rule' : 'shape-rule',
  }
}

/* ── self-test ──────────────────────────────────────────────────────────── */
function selfTest() {
  const cases = [
    ['harmony back', vowelHarmony('talo') === 'back'],
    ['harmony front', vowelHarmony('leipä') === 'front'],
    ['harmony neutral', vowelHarmony('vesi') === 'neutral'],
    ['parse starred type', parseKotusType('9*B').number === 9 && parseKotusType('9*B').grad === 'B'],
    ['parse compound type', parseKotusType('73, (77)').number === 73],
    ['gradation pp~p', weakStem('kauppa', 'B') === 'kaupa'],
    ['gradation t~d', weakStem('katu', 'F') === 'kadu'],
    ['gradation k~zero', weakStem('aika', 'D') === 'aja'],
    ['gradation k~zero keeps initial i', weakStem('ikä', 'D') === 'iä'],
    ['gradation nt~nn', weakStem('tunti', 'J') === 'tunni'],
    ['IPA talo', deriveIpa('talo') === '/ˈtɑlo/'],
    ['IPA kauppa', deriveIpa('kauppa') === '/ˈkɑupːɑ/'],
    ['IPA leipä', deriveIpa('leipä') === '/ˈleipæ/'],
  ]
  const noun = (lemma, cls, grad) => deriveNominal({ lemma, cls, grad })
  const verb = (lemma, cls, grad) => deriveVerb({ lemma, cls, grad })
  cases.push(
    ['talo paradigm', (() => { const x = noun('talo', 1); return x.gen === 'talon' && x.par === 'taloa' && x.ine === 'talossa' && x.ela === 'talosta' && x.ill === 'taloon' && x.plural === 'talot' })()],
    ['kauppa gradation', (() => { const x = noun('kauppa', 10, 'B'); return x.gen === 'kaupan' && x.par === 'kauppaa' && x.ill === 'kauppaan' && x.plural === 'kaupat' })()],
    ['katu gradation', (() => { const x = noun('katu', 1, 'F'); return x.gen === 'kadun' && x.par === 'katua' && x.ill === 'katuun' })()],
    ['leipä gradation', (() => { const x = noun('leipä', 10, 'E'); return x.gen === 'leivän' && x.par === 'leipää' && x.plural === 'leivät' })()],
    ['ruoka k-zero', (() => { const x = noun('ruoka', 9, 'D'); return x.gen === 'ruoan' && x.par === 'ruokaa' && x.ine === 'ruoassa' })()],
    ['vesi -si stem', (() => { const x = noun('vesi', 27); return x.gen === 'veden' && x.par === 'vettä' && x.ill === 'veteen' && x.plural === 'vedet' })()],
    ['vuosi -si stem', (() => { const x = noun('vuosi', 27); return x.gen === 'vuoden' && x.par === 'vuotta' && x.ill === 'vuoteen' })()],
    ['perhe -e stem', (() => { const x = noun('perhe', 48); return x.gen === 'perheen' && x.par === 'perhettä' && x.ine === 'perheessä' && x.ill === 'perheeseen' && x.plural === 'perheet' })()],
    ['kieli -i/e stem', (() => { const x = noun('kieli', 26); return x.gen === 'kielen' && x.par === 'kieltä' && x.ill === 'kieleen' && x.plural === 'kielet' })()],
    ['ovi -i/e stem', (() => { const x = noun('ovi', 7); return x.gen === 'oven' && x.par === 'ovea' && x.ill === 'oveen' })()],
    ['ihminen -nen stem', (() => { const x = noun('ihminen', 38); return x.gen === 'ihmisen' && x.par === 'ihmistä' && x.ill === 'ihmiseen' })()],
    ['vastaus -s stem', (() => { const x = noun('vastaus', 39); return x.gen === 'vastauksen' && x.par === 'vastausta' && x.ill === 'vastaukseen' })()],
    ['kalleus -s stem', (() => { const x = noun('kalleus', 40); return x.gen === 'kalleuden' && x.par === 'kalleutta' && x.ill === 'kalleuteen' })()],
    ['hammas inverse', (() => { const x = noun('hammas', 41); return x.gen === 'hampaan' && x.par === 'hammasta' && x.plural === 'hampaat' })()],
    ['vanhempi -mpi stem', (() => { const x = noun('vanhempi', 16, 'H'); return x.gen === 'vanhemman' && x.par === 'vanhempaa' && x.ill === 'vanhempaan' })()],
    ['maa long vowel', (() => { const x = noun('maa', 18); return x.par === 'maata' && x.ill === 'maahan' && x.gen === 'maan' })()],
    ['indeclinable adverb', (() => { const x = noun('yleensä', 99); return x.gen === '—' && x.kotusType === '' && x.quality === 'indeclinable' })()],
    ['kansainvälinen -nen without class', (() => { const x = noun('kansainvälinen', null); return x.gen === 'kansainvälisen' && x.ill === 'kansainväliseen' })()],
    ['työsopimus guessed -s stem', (() => { const x = noun('työsopimus', null); return x.gen === 'työsopimuksen' && x.par === 'työsopimusta' })()],
    ['mielenterveys guessed -de stem', (() => { const x = noun('mielenterveys', null); return x.gen === 'mielenterveyden' })()],
    ['mies stem', (() => { const x = noun('mies', 42); return x.gen === 'miehen' && x.par === 'miestä' })()],
    ['matkaopas inverse stem', (() => { const x = noun('matkaopas', null); return x.gen === 'matkaoppaan' && x.par === 'matkaopasta' })()],
    ['sydän stem', (() => { const x = noun('sydän', 33); return x.gen === 'sydämen' && x.par === 'sydäntä' })()],
    ['kevät stem', (() => { const x = noun('kevät', 44); return x.gen === 'kevään' && x.par === 'kevättä' })()],
    ['mahdoton stem', (() => { const x = noun('mahdoton', 34, 'C'); return x.gen === 'mahdottoman' && x.par === 'mahdotonta' })()],
    ['hermostunut participle stem', (() => { const x = noun('hermostunut', 47); return x.gen === 'hermostuneen' && x.par === 'hermostunutta' })()],
    ['internet consonant stem', (() => { const x = noun('internet', 5); return x.gen === 'internetin' && x.par === 'internetiä' })()],
    ['plural-only word labelled pending', (() => { const x = noun('kengät', null); return x.gen === '—' && x.quality === 'pending' && x.plural === 'kengät' })()],
    ['minä pronoun paradigm', (() => { const x = noun('minä', 101); return x.gen === 'minun' && x.par === 'minua' && x.ill === 'minuun' && x.quality === 'hand-checked' })()],
    ['se pronoun paradigm', (() => { const x = noun('se', 101); return x.gen === 'sen' && x.par === 'sitä' && x.ine === 'siinä' })()],
    ['puhua type 1', (() => { const x = verb('puhua', 52); return x.verbType === 1 && x.presentStem === 'puhu-' && x.present1sg === 'puhun' && x.past3sg === 'puhui' && x.nutParticiple === 'puhunut' })()],
    ['ostaa class 53', (() => { const x = verb('ostaa', 53); return x.past3sg === 'osti' && x.present1sg === 'ostan' })()],
    ['maksaa class 56', (() => { const x = verb('maksaa', 56); return x.past3sg === 'maksoi' })()],
    ['antaa gradation', (() => { const x = verb('antaa', 56, 'J'); return x.presentStem === 'anna-' && x.present1sg === 'annan' && x.past3sg === 'antoi' })()],
    ['ottaa gradation', (() => { const x = verb('ottaa', 53, 'C'); return x.presentStem === 'ota-' && x.present1sg === 'otan' && x.past3sg === 'otti' })()],
    ['ymmärtää class 54', (() => { const x = verb('ymmärtää', 54, 'K'); return x.present1sg === 'ymmärrän' && x.past3sg === 'ymmärsi' })()],
    ['kääntää class 54', (() => { const x = verb('kääntää', 54, 'J'); return x.present1sg === 'käännän' && x.past3sg === 'käänsi' })()],
    ['lukea class 58', (() => { const x = verb('lukea', 58, 'D'); return x.present1sg === 'luen' && x.past3sg === 'luki' })()],
    ['sallia class 61', (() => { const x = verb('sallia', 61); return x.past3sg === 'salli' && x.nutParticiple === 'sallinut' })()],
    ['tulla type 3', (() => { const x = verb('tulla', 67); return x.verbType === 3 && x.presentStem === 'tule-' && x.present1sg === 'tulen' && x.past3sg === 'tuli' && x.nutParticiple === 'tullut' })()],
    ['nousta type 3', (() => { const x = verb('nousta', 67); return x.presentStem === 'nouse-' && x.past3sg === 'nousi' && x.nutParticiple === 'noussut' })()],
    ['haluta type 4', (() => { const x = verb('haluta', 75); return x.verbType === 4 && x.presentStem === 'halua-' && x.present1sg === 'haluan' && x.past3sg === 'halusi' && x.nutParticiple === 'halunnut' })()],
    ['tarvita type 5', (() => { const x = verb('tarvita', 69); return x.verbType === 5 && x.presentStem === 'tarvitse-' && x.present1sg === 'tarvitsen' && x.past3sg === 'tarvitsi' && x.nutParticiple === 'tarvinnut' })()],
    ['olla exception', (() => { const x = verb('olla', 67); return x.irregular === 'true' && x.present1sg === 'olen' && x.past3sg === 'oli' && x.nutParticiple === 'ollut' })()],
    ['ajatella exception', (() => { const x = verb('ajatella', 67, 'C'); return x.present1sg === 'ajattelen' && x.past3sg === 'ajatteli' })()],
    ['unknown class stays honest', (() => { const x = verb('ei', null); return x.irregular === 'true' && x.kotusType === '' })()],
  )
  let failed = 0
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) failed++
  }
  console.log(`\n  fi-morphology: ${cases.length - failed}/${cases.length} checks passed`)
  if (failed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) selfTest()
