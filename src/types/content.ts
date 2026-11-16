/** CEFR levels used across senses, words, sentences, case forms and the learner profile. */
export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export const CEFR_ORDER: CEFR[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export type FinnishCase =
  | 'nom' | 'gen' | 'par' | 'ine' | 'ela' | 'ill'
  | 'ade' | 'abl' | 'all' | 'ess' | 'tra' | 'acc'
  | 'ins' | 'abe' | 'com'

/** The six "basic cases" shown by default on every nominal word card. */
export const A1_BASIC_CASES: FinnishCase[] = ['nom', 'gen', 'par', 'ine', 'ela', 'ill']

export const CASE_CEFR: Record<FinnishCase, CEFR> = {
  nom: 'A1', gen: 'A1', par: 'A1', ine: 'A1', ela: 'A1', ill: 'A1',
  ade: 'A2', abl: 'A2', all: 'A2', ess: 'A2', tra: 'A2', acc: 'A2',
  ins: 'B1', abe: 'B1', com: 'B1',
}

/** Pedagogical verb types 1-6 (verbityypit), displayed next to the verb in the UI. */
export type VerbType = 1 | 2 | 3 | 4 | 5 | 6

export const VERB_TYPE_RULES: Record<VerbType, { ending: string; stemRule: string; example: string }> = {
  1: { ending: 'vowel + -a/-ä', stemRule: 'drop final -a/-ä', example: 'puhua → puhu- → puhun' },
  2: { ending: '-da/-dä', stemRule: 'drop -da/-dä', example: 'syödä → syö- → syön' },
  3: { ending: 'consonant + -la/-na/-ra/-sta', stemRule: 'drop ending, add -e-', example: 'tulla → tule- → tulen' },
  4: { ending: 'vowel + -ta/-tä', stemRule: 'drop -ta/-tä, add -a/-ä-', example: 'haluta → halua- → haluan' },
  5: { ending: '-ita/-itä', stemRule: 'drop -ta/-tä, add -itse-', example: 'tarvita → tarvitse- → tarvitsen' },
  6: { ending: '-eta/-etä', stemRule: 'drop -ta/-tä, add -ne-', example: 'vanheta → vanhene- → vanhenen' },
}

export interface ImageRef {
  id: string
  path: string | null
  /** Schematic SVG motif used when the real illustration is still pending. */
  motif: string
  altZh: string
  altEn: string
  source: 'generated' | 'hand-drawn' | 'cc0' | 'cc-by'
  license: string
  attribution?: string
  status: 'ready' | 'pending'
  /** Generated assets stay pending until a human has actually looked at them. */
  reviewStatus: 'pending' | 'human-verified'
  note?: string
}

/**
 * Optional pre-recorded Finnish pronunciation. Declared in the CSV editing
 * layer, never in app/*.js. A missing `audio` entry means "no clip yet": the
 * UI falls back to browser speech synthesis and warns when no fi-FI voice is
 * installed. Slow playback uses playbackRate 0.5 with preservesPitch on.
 */
export interface AudioRef {
  /** Relative path, e.g. assets/audio/talo.mp3 */
  path: string
  source: 'tts' | 'human' | 'other'
  license: string
  /** Seconds; null until measured. */
  durationSec: number | null
  reviewStatus: 'pending' | 'human-verified'
}

/** One image per sense, never one image per lemma: polysemy would otherwise mislead learners. */
export interface Sense {
  id: string
  cefr: CEFR
  zh: string
  en: string
  posZh?: string
  image: ImageRef
}

export interface CaseForm {
  case: FinnishCase
  form: string
  suffix: string
  stemUsed: 'strong' | 'weak'
  cefr: CEFR
  label?: string
  example?: string
}

/** Nominative singular/plural, shown on every memorize-mode card. */
export interface NumberForms {
  singular: string
  plural: string
  note?: string
}

export interface NominalParadigm {
  stems: { strong: string; weak: string }
  gradation: string | null
  harmony: 'back' | 'front' | 'neutral'
  /**
   * "Kotus N 型 (...)" for a rule-derived paradigm, or one of the explicit
   * state labels `indeclinable` / `paradigm pending` /
   * `pluralia tantum (paradigm pending)` / `phrase (paradigm pending)` /
   * `pronoun (irregular)`. State labels mean the caseForms contain "—" and
   * must never be presented as verified Finnish.
   */
  declensionClass: string
  /** Kotus nominal declension type, 1-51. null = pending human review. */
  kotusType: number | null
  caseForms: CaseForm[]
}

export interface VerbParadigm {
  /** Shown in the UI: the learner-facing 1-6 classification. */
  verbType: VerbType
  /** Used by the form generator: Kotus conjugation type, 52-78. */
  kotusType: number | null
  infinitiveEnding: string
  presentStem: string
  present1sg: string
  past3sg: string
  nutParticiple: string
  irregular?: boolean
  note?: string
}

export interface Provenance {
  lemmaSource: string
  glossSource: string
  frequencyBand?: number
  gradingSignals: string[]
  reviewStatus: 'auto-derived' | 'human-reviewed' | 'csv-authored'
}

export interface WordEntry {
  id: string
  lemma: string
  pos: 'noun' | 'adjective' | 'pronoun' | 'numeral' | 'verb' | 'adverb' | 'particle'
  posZh: string
  /** Derived: min(senses[].cefr). Validated at build time, never trusted from input. */
  cefr: CEFR
  topicId: string
  /** IPA transcription shown in 背词模式. Rule-derived in the demo pack. */
  ipa: string
  ipaSource: 'rule-derived' | 'human-verified'
  senses: Sense[]
  audio?: AudioRef
  provenance: Provenance
  nominal?: NominalParadigm
  verb?: VerbParadigm
  /** null for verbs: Finnish verbs conjugate by person, not by number. */
  number?: NumberForms | null
}

export interface SentenceEntry {
  id: string
  fiText: string
  zhText: string
  enText: string
  cefr: CEFR
  grammarPoints: FinnishCase[]
  gloss: { token: string; senseId: string | null; caseForm?: FinnishCase }[]
  audio?: AudioRef
}

export interface ContentPack {
  format: 'finnish-learn-content'
  schema: number
  version: string
  reviewNote?: string
  levels: CEFR[]
  words: WordEntry[]
  sentences: SentenceEntry[]
}

/* ── Learning groups ─────────────────────────────────────────────────────── */

export type GroupKind = 'word' | 'sentence'

/** A deterministic slice of 5 words or 5 sentences inside one CEFR level. */
export interface LearningGroup {
  id: string
  level: CEFR
  kind: GroupKind
  index: number
  size: number
  /** True only for a trailing group when the level is not a multiple of 5. */
  partial: boolean
  title: string
  /** English title. Hand-authored for the 17 reviewed demo groups, derived
   *  from the dominant topic (data/topics.json) for workbook-imported groups. */
  titleEn?: string
  itemIds: string[]
}

export interface LevelSummary {
  level: CEFR
  wordCount: number
  sentenceCount: number
  wordGroups: number
  sentenceGroups: number
  sentenceStatus: 'ready' | 'pending'
}

export interface GroupIndex {
  format: 'finnish-learn-groups'
  schema: number
  contentVersion: string
  groupSize: number
  levels: LevelSummary[]
  groups: LearningGroup[]
}

export const GROUP_SIZE = 5

/** Canonical word-group phase order (used for previews and tooling).
 *  At runtime the practice modes in the middle are shuffled per group, and
 *  the items inside each round are shuffled too; memorize stays first and
 *  complete stays last. Sentence groups skip word-only modes. */
export const FLOW_PHASES = [
  'memorize', 'choice', 'listen', 'findImage', 'match', 'cloze', 'dictation', 'complete',
] as const
export type FlowPhase = (typeof FLOW_PHASES)[number]
