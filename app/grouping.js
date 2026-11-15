/* Domain layer: grouping, quiz generation, answer normalisation, schematic art.
   Framework-free classic script so index.html works from file:// as well. */
(function () {
  const FI = (window.FI = window.FI || {})

  FI.CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  FI.GROUP_SIZE = 5

  /* ── practice mode registry ──────────────────────────────────
     Word groups run all six rounds; sentence groups skip the word-only
     rounds. "拼写" was removed: it duplicated the letter-slot cloze.  */
  FI.PRACTICE_MODES = ['choice', 'listen', 'findImage', 'match', 'cloze', 'dictation']
  FI.DEFAULT_MODES = FI.PRACTICE_MODES.slice()
  FI.SLIM_MODES = ['choice', 'listen', 'match', 'dictation']
  FI.MODE_META = {
    memorize: { short: '背词', label: '背词模式', desc: '看词形、音标、词性、单复数与释义', word: true, sentence: true },
    choice: { short: '选词', label: '选词模式', desc: '看配图与释义，从 4 个词里选择', word: true, sentence: true },
    listen: { short: '听选', label: '听选模式', desc: '听发音，从 4 张「图片 + 释义」卡里选择；不显示芬兰语单词', word: true, sentence: true },
    findImage: { short: '找图', label: '找图模式', desc: '题干只给释义，选项是 4 个纯文字单词；选对后卡片翻面显示配图并朗读一次', word: true, sentence: false },
    match: { short: '匹配', label: '单词匹配模式', desc: '两排打乱，配对成功即消失', word: true, sentence: true },
    cloze: { short: '填空', label: '填空模式', desc: '配图 + 释义，逐字母填空：随机露出若干字母', word: true, sentence: true },
    dictation: { short: '听写', label: '听写模式', desc: '听音（正常/慢速）+ 看图，每字母一个下划线，全对才算通过', word: true, sentence: false },
    complete: { short: '完成', label: '本组完成', desc: '进度已保存到本机', word: true, sentence: true },
    result: { short: '结果', label: '本轮结果', desc: '继续下一个流程或只练错词', word: true, sentence: true },
  }
  FI.PHASE_LABEL = Object.fromEntries(Object.entries(FI.MODE_META).map(([k, v]) => [k, v.label]))
  FI.PHASES = ['memorize', ...FI.PRACTICE_MODES, 'complete']
  /* Mode labels are UI text, so they have an English variant in app/i18n.js.
     The Chinese MODE_META remains the fallback for older saves and for the
     Node domain harness, which does not load the interface dictionary. */
  FI.modeLabel = function (mode, lang) {
    return (lang === 'en' ? FI.MODE_I18N?.en?.[mode]?.label : null) ?? FI.MODE_META[mode]?.label ?? mode
  }
  FI.modeShort = function (mode, lang) {
    return (lang === 'en' ? FI.MODE_I18N?.en?.[mode]?.short : null) ?? FI.MODE_META[mode]?.short ?? mode
  }
  FI.modeDesc = function (mode, lang) {
    return (lang === 'en' ? FI.MODE_I18N?.en?.[mode]?.desc : null) ?? FI.MODE_META[mode]?.desc ?? ''
  }
  FI.modeApplies = function (mode, kind) {
    const m = FI.MODE_META[mode]
    return Boolean(m && (kind === 'word' ? m.word : m.sentence))
  }
  FI.sanitizeModes = function (list) {
    if (!Array.isArray(list)) return FI.DEFAULT_MODES.slice()
    const picked = [...new Set(list)].filter((m) => FI.PRACTICE_MODES.includes(m))
    return picked.length ? picked : ['choice']
  }
  /** Build one group's stage list. Without a seed the registry order is
      returned (home preview / domain harness). A seed shuffles the practice
      modes so each group starts with a fresh sequence; memorise always
      introduces the words first and the completion screen always closes. */
  FI.buildPipeline = function (kind, enabled, seed) {
    const modes = FI.sanitizeModes(enabled).filter((m) => FI.modeApplies(m, kind))
    const middle = typeof seed === 'number' && Number.isFinite(seed)
      ? FI.shuffle(modes, seed >>> 0)
      : modes
    return ['memorize', ...middle, 'complete']
  }

  /* ── display preferences ──────────────────────────────────── */
  FI.MEANING_LANGS = ['both', 'zh', 'en']
  FI.MEANING_LABEL = { both: '中英文都显示', zh: '只显示中文', en: '只显示英文' }
  FI.THEMES = ['light', 'dark', 'system']
  FI.THEME_LABEL = { light: '浅色', dark: '深色', system: '跟随系统' }
  FI.formatMeaning = function (zh, en, lang, sep = ' / ') {
    if (lang === 'zh') return String(zh ?? '')
    if (lang === 'en') return String(en ?? '')
    return `${zh ?? ''}${sep}${en ?? ''}`
  }
  /** Every preference has a bounded, documented domain. Imported files and
      older saves are normalised through here so the UI never sees junk. */
  FI.sanitizePrefs = function (p = {}) {
    const uiLangs = FI.UI_LANGS ?? ['zh', 'en']
    return {
      ...p,
      targetLevel: FI.CEFR.includes(p.targetLevel) ? p.targetLevel : 'A1',
      enabledModes: FI.sanitizeModes(p.enabledModes),
      meaningLang: FI.MEANING_LANGS.includes(p.meaningLang) ? p.meaningLang : 'both',
      uiLang: uiLangs.includes(p.uiLang) ? p.uiLang : 'zh',
      theme: FI.THEMES.includes(p.theme) ? p.theme : 'system',
      bgm: p.bgm === true,
    }
  }

  /* ── speech: an audible difference between normal and slow ──── */
  FI.SPEECH_RATE = { normal: 1, slow: 0.5 }
  /** Split a single Finnish word into rough syllables. Used ONLY for the
      slow playback text, where commas force a real pause even on TTS
      engines that clamp SpeechSynthesisUtterance.rate. */
  FI.syllabify = function (text) {
    const s = String(text ?? '').trim().toLowerCase().replace(/[^a-zäöåšž]/gi, '')
    if (!s) return [String(text ?? '')]
    const groups = s.match(/[aeiouyäöå]+|[^aeiouyäöå]+/g) ?? [s]
    const out = []
    let pending = ''
    for (const part of groups) {
      if (/[aeiouyäöå]/.test(part[0])) { out.push(pending + part); pending = '' }
      else pending = part
    }
    if (pending) {
      if (out.length) out[out.length - 1] += pending
      else out.push(pending)
    }
    return out.length ? out : [s]
  }

  /* ── deterministic randomness ─────────────────────────────── */
  FI.mulberry32 = function (seed) {
    let a = seed >>> 0
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  FI.hash = function (str) {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
  }
  FI.shuffle = function (arr, seed) {
    const rnd = FI.mulberry32(seed)
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  /** Presentation order of the five items in one round. Deterministic for a
      given seed (so pause/resume and retries keep the same sequence), and
      never identical to `avoid` — the canonical order for the first round,
      the previous round's order afterwards. */
  FI.shuffleItems = function (ids, seed, avoid) {
    const list = Array.isArray(ids) ? ids.slice() : []
    if (list.length < 2) return list
    let out = FI.shuffle(list, seed >>> 0)
    if (Array.isArray(avoid) && avoid.length === out.length && out.every((x, i) => x === avoid[i])) {
      out = [...out.slice(1), out[0]]
    }
    return out
  }

  /* ── answer normalisation: NFKC → trim → lower → strip punctuation
        → diacritic tolerance (ä/ö/å etc.) ─────────────────────── */
  const DIACRITICS = {
    ä: 'a', â: 'a', á: 'a', à: 'a', å: 'a', ã: 'a',
    ö: 'o', ô: 'o', ó: 'o', ò: 'o', ø: 'o', õ: 'o',
    ü: 'u', û: 'u', ú: 'u', ù: 'u',
    ë: 'e', ê: 'e', é: 'e', è: 'e',
    ï: 'i', î: 'i', í: 'i', ì: 'i',
    š: 's', ž: 'z', č: 'c', ñ: 'n', ç: 'c',
  }
  FI.normalizeAnswer = function (input) {
    return String(input ?? '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[.,;:!?…"'`´()\[\]{}\/\\]/g, '')
      .replace(/[\s\-_]/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .split('').map((c) => DIACRITICS[c] ?? c).join('')
  }
  /* Dictation is deliberately stricter: every letter, including ä/ö/å,
     must be typed exactly. Only case and surrounding whitespace are folded. */
  FI.strictAnswer = function (input) {
    return String(input ?? '').normalize('NFKC').trim().toLowerCase()
  }
  FI.countSyllables = function (fi) {
    const groups = String(fi).toLowerCase().match(/[aeiouyäöå]+/g)
    return groups ? groups.length : 1
  }
  FI.lettersOf = function (word) { return Array.from(String(word ?? '').normalize('NFC')) }

  /* ── schematic illustrations (placeholder until real art is generated) ── */
  const B = '#185FA5', LB = '#DCEAF7', O = '#D9A86A', N = '#2C4A63', S = '#BFD8C8', W = '#FFFFFF'
  const outline = `stroke="${N}" stroke-width="2" stroke-linejoin="round"`
  const SHAPES = {
    house: `<path d="M16 47 L50 22 L84 47 Z" fill="${O}" ${outline}/><rect x="22" y="46" width="56" height="36" rx="2" fill="${LB}" ${outline}/><rect x="44" y="60" width="14" height="22" fill="${W}" ${outline}/><rect x="29" y="54" width="10" height="10" fill="${W}" ${outline}/><rect x="61" y="54" width="10" height="10" fill="${W}" ${outline}/>`,
    shop: `<rect x="20" y="40" width="60" height="42" rx="2" fill="${LB}" ${outline}/><path d="M14 40 L22 26 H78 L86 40 Z" fill="${O}" ${outline}/><path d="M32 27 L29 40 M50 27 L50 40 M68 27 L71 40" stroke="${W}" stroke-width="4"/><rect x="42" y="58" width="16" height="24" fill="${W}" ${outline}/><rect x="24" y="52" width="12" height="12" fill="${W}" ${outline}/>`,
    street: `<rect x="10" y="28" width="22" height="34" fill="${LB}" ${outline}/><rect x="68" y="22" width="22" height="40" fill="${S}" ${outline}/><rect x="0" y="62" width="100" height="24" fill="${LB}"/><path d="M0 74 H100" stroke="${W}" stroke-width="3" stroke-dasharray="10 9"/><rect x="15" y="35" width="6" height="7" fill="${W}"/><rect x="74" y="30" width="6" height="7" fill="${W}"/>`,
    book: `<path d="M50 30 C38 24 24 24 14 28 V74 C26 70 38 70 50 76 Z" fill="${LB}" ${outline}/><path d="M50 30 C62 24 76 24 86 28 V74 C74 70 62 70 50 76 Z" fill="${W}" ${outline}/><path d="M50 30 V76" ${outline}/><path d="M22 40 H42 M22 50 H42 M58 40 H78 M58 50 H78" stroke="${N}" stroke-width="1.5" opacity=".45"/>`,
    car: `<path d="M16 60 L24 42 H68 L82 60 Z" fill="${LB}" ${outline}/><rect x="12" y="58" width="76" height="16" rx="5" fill="${B}" ${outline}/><circle cx="30" cy="76" r="9" fill="${N}"/><circle cx="70" cy="76" r="9" fill="${N}"/><circle cx="30" cy="76" r="3" fill="${W}"/><circle cx="70" cy="76" r="3" fill="${W}"/><path d="M40 44 H60 V58 H34 Z" fill="${W}" ${outline}/>`,
    drop: `<path d="M50 16 C50 16 26 46 26 61 A24 24 0 0 0 74 61 C74 46 50 16 50 16 Z" fill="${LB}" ${outline}/><path d="M38 62 A13 13 0 0 0 48 74" stroke="${W}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cup: `<path d="M26 38 H66 V62 A13 13 0 0 1 53 75 H39 A13 13 0 0 1 26 62 Z" fill="${LB}" ${outline}/><path d="M66 44 H74 A9 9 0 0 1 74 62 H66" fill="none" ${outline}/><path d="M38 26 C34 22 42 20 38 15 M52 26 C48 22 56 20 52 15" stroke="${O}" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="20" y="76" width="54" height="4" rx="2" fill="${N}"/>`,
    carton: `<path d="M30 38 L50 20 L70 38 Z" fill="${W}" ${outline}/><rect x="30" y="38" width="40" height="44" rx="2" fill="${LB}" ${outline}/><path d="M30 38 H70 L64 30 H36 Z" fill="${S}" ${outline}/><rect x="40" y="50" width="20" height="16" rx="2" fill="${W}" ${outline}/>`,
    bread: `<ellipse cx="50" cy="56" rx="34" ry="22" fill="${O}" ${outline}/><path d="M32 44 L40 58 M46 40 L54 56 M60 42 L68 56" stroke="${W}" stroke-width="3" stroke-linecap="round"/><path d="M18 62 Q50 84 82 62" stroke="${N}" stroke-width="2" fill="none" opacity=".4"/>`,
    plate: `<circle cx="50" cy="52" r="32" fill="${W}" ${outline}/><circle cx="50" cy="52" r="23" fill="${LB}" ${outline}/><circle cx="50" cy="52" r="11" fill="${O}" ${outline}/><path d="M88 28 V76 M84 28 V52 M92 28 V52" stroke="${N}" stroke-width="2.5" stroke-linecap="round"/>`,
    school: `<rect x="18" y="40" width="64" height="42" rx="2" fill="${LB}" ${outline}/><path d="M12 40 L50 20 L88 40 Z" fill="${O}" ${outline}/><rect x="44" y="58" width="14" height="24" fill="${W}" ${outline}/><rect x="26" y="50" width="10" height="10" fill="${W}" ${outline}/><rect x="64" y="50" width="10" height="10" fill="${W}" ${outline}/><path d="M50 20 V10" ${outline}/><path d="M50 10 L66 14 L50 18 Z" fill="${B}" ${outline}/>`,
    speech: `<path d="M14 30 H58 A6 6 0 0 1 64 36 V58 A6 6 0 0 1 58 64 H34 L22 76 V64 H14 A6 6 0 0 1 8 58 V36 A6 6 0 0 1 14 30 Z" fill="${LB}" ${outline}/><path d="M50 20 H84 A6 6 0 0 1 90 26 V44 A6 6 0 0 1 84 50 H74 L66 58 V50 H50 A6 6 0 0 1 44 44" fill="${W}" ${outline}/><path d="M22 44 H50 M22 52 H42" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/>`,
    arrow: `<rect x="16" y="30" width="22" height="52" rx="2" fill="${LB}" ${outline}/><circle cx="32" cy="56" r="2.5" fill="${N}"/><path d="M46 56 H84 M72 44 L84 56 L72 68" fill="none" stroke="${B}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    heart: `<path d="M50 78 C20 58 14 42 22 32 C30 22 44 26 50 38 C56 26 70 22 78 32 C86 42 80 58 50 78 Z" fill="${O}" ${outline}/><circle cx="50" cy="22" r="4" fill="${B}"/>`,
    circle: `<circle cx="50" cy="50" r="32" fill="${LB}" ${outline}/><circle cx="50" cy="50" r="10" fill="${B}"/><path d="M50 18 V10 M50 90 V82 M18 50 H10 M90 50 H82" stroke="${O}" stroke-width="3" stroke-linecap="round"/>`,
    checklist: `<rect x="24" y="18" width="52" height="66" rx="4" fill="${W}" ${outline}/><path d="M34 36 l5 5 8 -10 M34 56 l5 5 8 -10" fill="none" stroke="${B}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M52 38 H70 M52 58 H70 M34 74 H70" stroke="${N}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    people: `<circle cx="34" cy="38" r="12" fill="${O}" ${outline}/><circle cx="68" cy="38" r="12" fill="${LB}" ${outline}/><path d="M14 78 C14 60 24 54 34 54 C44 54 54 60 54 78 Z" fill="${B}" ${outline}/><path d="M50 78 C50 60 58 54 68 54 C78 54 88 60 88 78 Z" fill="${S}" ${outline}/>`,
    clock: `<circle cx="50" cy="52" r="34" fill="${W}" ${outline}/><circle cx="50" cy="52" r="27" fill="${LB}"/><path d="M50 52 V32 M50 52 L66 60" stroke="${N}" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="52" r="3.5" fill="${B}"/><path d="M50 20 V14 M84 52 H90 M50 84 V90 M16 52 H10" stroke="${N}" stroke-width="2.5" stroke-linecap="round"/>`,
    briefcase: `<rect x="16" y="38" width="68" height="42" rx="4" fill="${LB}" ${outline}/><path d="M38 38 V30 A4 4 0 0 1 42 26 H58 A4 4 0 0 1 62 30 V38" fill="none" ${outline}/><path d="M16 54 H84" ${outline}/><rect x="44" y="52" width="12" height="9" rx="2" fill="${W}" ${outline}/>`,
    city: `<rect x="10" y="44" width="22" height="40" fill="${LB}" ${outline}/><rect x="36" y="26" width="24" height="58" fill="${O}" ${outline}/><rect x="64" y="38" width="24" height="46" fill="${S}" ${outline}/><path d="M16 52 H26 M16 60 H26 M16 68 H26 M42 34 H54 M42 42 H54 M42 50 H54 M70 46 H82 M70 54 H82 M70 62 H82" stroke="${W}" stroke-width="2.5"/>`,
    person: `<circle cx="50" cy="32" r="14" fill="${O}" ${outline}/><path d="M22 82 C22 60 34 50 50 50 C66 50 78 60 78 82 Z" fill="${B}" ${outline}/>`,
    calendar: `<rect x="18" y="24" width="64" height="60" rx="4" fill="${W}" ${outline}/><path d="M18 40 H82" ${outline}/><path d="M32 18 V30 M68 18 V30" stroke="${N}" stroke-width="3" stroke-linecap="round"/><rect x="18" y="24" width="64" height="16" rx="4" fill="${B}"/><path d="M30 52 H40 M48 52 H58 M66 52 H76 M30 64 H40 M48 64 H58 M66 64 H76" stroke="${LB}" stroke-width="4" stroke-linecap="round"/>`,
    brain: `<path d="M50 22 C34 16 22 26 22 40 C14 46 16 60 26 64 C26 78 40 84 50 76 C60 84 74 78 74 64 C84 60 86 46 78 40 C78 26 66 16 50 22 Z" fill="${LB}" ${outline}/><path d="M50 22 V76 M32 34 C40 38 40 46 32 52 M68 34 C60 38 60 46 68 52 M30 62 C38 58 40 68 34 72 M70 62 C62 58 60 68 66 72" stroke="${B}" stroke-width="2" fill="none"/>`,
    bulb: `<circle cx="50" cy="42" r="24" fill="${O}" ${outline}/><path d="M40 62 H60 V72 H40 Z" fill="${LB}" ${outline}/><path d="M42 78 H58 M44 84 H56" stroke="${N}" stroke-width="3" stroke-linecap="round"/><path d="M50 18 V10 M24 42 H16 M76 42 H84 M30 24 L24 18 M70 24 L76 18" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/>`,
    magnifier: `<circle cx="44" cy="44" r="24" fill="${LB}" ${outline}/><path d="M62 62 L84 84" stroke="${N}" stroke-width="8" stroke-linecap="round"/><path d="M34 38 C38 34 48 34 52 38" stroke="${W}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M34 50 H54 M34 58 H48" stroke="${B}" stroke-width="2.5" stroke-linecap="round"/>`,
    globe: `<circle cx="50" cy="50" r="34" fill="${LB}" ${outline}/><ellipse cx="50" cy="50" rx="14" ry="34" fill="none" ${outline}/><path d="M16 50 H84 M22 32 H78 M22 68 H78" stroke="${B}" stroke-width="2" fill="none"/>`,
    chart: `<rect x="14" y="76" width="72" height="4" rx="2" fill="${N}"/><rect x="22" y="54" width="14" height="22" rx="2" fill="${LB}" ${outline}/><rect x="43" y="38" width="14" height="38" rx="2" fill="${O}" ${outline}/><rect x="64" y="24" width="14" height="52" rx="2" fill="${S}" ${outline}/>`,
    eye: `<path d="M10 50 C24 26 76 26 90 50 C76 74 24 74 10 50 Z" fill="${W}" ${outline}/><circle cx="50" cy="50" r="14" fill="${B}" ${outline}/><circle cx="50" cy="50" r="5" fill="${W}"/>`,
    tools: `<path d="M20 26 A12 12 0 0 0 28 46 L72 82 A8 8 0 0 0 84 70 L44 30 A12 12 0 0 0 20 26 Z" fill="${LB}" ${outline}/><path d="M78 20 L84 26 L62 48 L56 42 Z" fill="${O}" ${outline}/>`,
  }
  const ALIAS = {
    house: 'house', shop: 'shop', street: 'street', book: 'book', car: 'car',
    water: 'drop', coffee: 'cup', milk: 'carton', bread: 'bread', food: 'plate',
    school: 'school', speech: 'speech', eat: 'plate', come: 'arrow', want: 'heart',
    being: 'circle', need: 'checklist', ask: 'speech', answer: 'speech',
    friend: 'people', clock: 'clock', family: 'people', work: 'briefcase',
    city: 'city', language: 'book', person: 'person', calendar: 'calendar',
    brain: 'brain', idea: 'bulb', research: 'magnifier', globe: 'globe',
    chart: 'chart', eye: 'eye', tools: 'tools', people: 'people',
  }
  FI.motifSVG = function (motif, seedText) {
    const key = ALIAS[motif]
    const h = FI.hash(String(seedText ?? motif ?? 'x'))
    let inner
    if (key) inner = SHAPES[key]
    else {
      const hues = [LB, S, O, '#E8DCC8', '#CFE0EE']
      const c1 = hues[h % hues.length], c2 = hues[(h >> 4) % hues.length]
      const x = 20 + (h % 24), y = 20 + ((h >> 8) % 24)
      inner = `<rect x="${x}" y="${y}" width="46" height="46" rx="9" fill="${c1}" ${outline}/>` +
        `<circle cx="${82 - x + 20}" cy="${76 - y + 12}" r="18" fill="${c2}" ${outline}/>` +
        `<path d="M18 82 H82" stroke="${B}" stroke-width="3" stroke-linecap="round"/>`
    }
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><rect class="motif-bg" width="100" height="100"/>${inner}</svg>`
  }

  /* ── item helpers ─────────────────────────────────────────── */
  FI.itemMaps = function (pack) {
    return {
      words: new Map(pack.words.map((w) => [w.id, w])),
      sentences: new Map(pack.sentences.map((s) => [s.id, s])),
    }
  }
  FI.itemLabel = function (item, kind) { return kind === 'word' ? item.lemma : item.fiText }
  FI.itemMeaning = function (item, kind) {
    return kind === 'word'
      ? { zh: item.senses[0].zh, en: item.senses[0].en }
      : { zh: item.zhText, en: item.enText }
  }
  FI.itemImage = function (item, kind) {
    return kind === 'word'
      ? item.senses[0].image
      : { path: null, motif: 'speech', altZh: item.zhText, altEn: item.enText, status: 'pending' }
  }
  /** Optional pre-recorded clip declared in the content pack (from CSV).
      null means the UI must fall back to browser speech synthesis. */
  FI.itemAudio = function (item) { return item?.audio?.path || null }

  /* ── choice questions: meaning + image → pick from FOUR words ───
     The correct item is always present; the other three are sampled from
     the same group, deterministically for a given seed.                 */
  FI.buildChoiceQuestions = function (group, pack, options) {
    const maps = FI.itemMaps(pack)
    const scope = options.scopeIds ?? group.itemIds
    const source = group.kind === 'word' ? maps.words : maps.sentences
    const seed = options.seed ?? FI.hash(group.id)
    const wanted = Math.min(options.optionCount ?? 4, group.itemIds.length)
    const pool = group.itemIds.map((id) => ({ id, label: FI.itemLabel(source.get(id), group.kind) }))
    return scope.map((itemId, i) => {
      const item = source.get(itemId)
      const meaning = FI.itemMeaning(item, group.kind)
      const target = pool.find((o) => o.id === itemId)
      const distractors = FI.shuffle(pool.filter((o) => o.id !== itemId), seed + i * 7919).slice(0, wanted - 1)
      return {
        itemId,
        promptZh: meaning.zh,
        promptEn: meaning.en,
        image: FI.itemImage(item, group.kind),
        audioFile: FI.itemAudio(item),
        label: FI.itemLabel(item, group.kind),
        options: FI.shuffle([target, ...distractors], seed + i * 104729 + 17),
      }
    })
  }

  /* ── cloze: letter-by-letter fill-in, not whole-word typing ──────
     Kept as a named entry point so the build/test harness and legacy
     sessions still resolve; the questions carry letters/reveal/hintOrder
     and are rendered by the shared underline-slot renderer.               */
  FI.buildClozeQuestions = function (group, pack, scopeIds, meaningLang) {
    return FI.buildLetterQuestions(group, pack, scopeIds, 'cloze', meaningLang)
  }

  /* ── 听选 / 找图: FOUR options per question ─────────────────────
     listen    → audio prompt; every option is picture + zh/en meaning,
                 and NEVER exposes the Finnish word (otherwise matching
                 the sound to the spelling bypasses comprehension).
     findImage → ONE meaning in the prompt, no picture; four plain words.
                 q.image / q.audioText / q.audioFile are the reveal payload:
                 only the correctly picked card flips to that picture and
                 plays that word once. Options themselves stay picture-free,
                 otherwise the answer can be guessed by looking at the art. */
  FI.buildSelectQuestions = function (group, pack, options) {
    const maps = FI.itemMaps(pack)
    const source = group.kind === 'word' ? maps.words : maps.sentences
    const scope = options.scopeIds ?? group.itemIds
    const seed = options.seed ?? FI.hash(group.id)
    const wanted = Math.min(options.optionCount ?? 4, group.itemIds.length)
    const pool = group.itemIds.map((id) => {
      const item = source.get(id)
      const meaning = FI.itemMeaning(item, group.kind)
      return {
        id,
        // Listen hides the word entirely; find-image needs plain text words.
        ...(options.hideLabel ? {} : { label: FI.itemLabel(item, group.kind) }),
        // A picture on every option gives the answer away. Find-image keeps
        // its single picture on the question (revealed only after a flip).
        ...(options.textOnly ? {} : { image: FI.itemImage(item, group.kind) }),
        zh: meaning.zh,
        en: meaning.en,
      }
    })
    return scope.map((itemId, i) => {
      const item = source.get(itemId)
      const meaning = FI.itemMeaning(item, group.kind)
      const target = pool.find((o) => o.id === itemId)
      const distractors = FI.shuffle(pool.filter((o) => o.id !== itemId), seed + i * 7919).slice(0, wanted - 1)
      return {
        itemId,
        label: FI.itemLabel(item, group.kind), // only used for feedback in find-image
        correctMeaning: FI.formatMeaning(meaning.zh, meaning.en, options.meaningLang ?? 'both'),
        // One meaning only: the picture is NOT in the prompt for find-image.
        promptZh: meaning.zh,
        promptEn: meaning.en,
        // Reveal payload for the flip + one-shot autoplay on a correct pick.
        audioText: group.kind === 'word' ? item.lemma : item.fiText,
        audioFile: FI.itemAudio(item),
        image: FI.itemImage(item, group.kind),
        options: FI.shuffle([target, ...distractors], seed + i * 104729 + 17),
      }
    })
  }

  /* ── 单词匹配: two independently shuffled rows ------------------ */
  FI.buildMatchPairs = function (group, pack, scopeIds, seed, meaningLang = 'both') {
    const maps = FI.itemMaps(pack)
    const source = group.kind === 'word' ? maps.words : maps.sentences
    const s = seed ?? FI.hash(group.id)
    const items = (scopeIds ?? group.itemIds).map((id) => {
      const item = source.get(id)
      const meaning = FI.itemMeaning(item, group.kind)
      return {
        id,
        label: FI.itemLabel(item, group.kind),
        zh: meaning.zh,
        en: meaning.en,
        text: FI.formatMeaning(meaning.zh, meaning.en, meaningLang, ' · '),
      }
    })
    const left = FI.shuffle(items.map((x) => ({ id: x.id, label: x.label })), s)
    let right = FI.shuffle(items.map((x) => ({ id: x.id, label: x.text, zh: x.zh, en: x.en })), s + 577)
    // Never hand the learner an already aligned board.
    if (left.length > 1 && left.every((x, i) => x.id === right[i].id)) {
      right = [...right.slice(1), right[0]]
    }
    return { left, right }
  }

  /* Randomly reveal a few letters for cloze. Deterministic per (group, word)
     so a paused session resumes with exactly the same gaps. */
  FI.randomReveal = function (letters, seed) {
    const n = letters.length
    if (n <= 1) return letters.map(() => false)
    const count = Math.max(1, Math.min(n - 1, Math.round(n * 0.4)))
    const picked = new Set(FI.shuffle(letters.map((_, i) => i), seed >>> 0).slice(0, count))
    return letters.map((_, i) => picked.has(i))
  }

  /* ── 填空 / 听写: one underline per letter ----------------------
     cloze     → a random subset of letters is given, the rest are blanks
     dictation → no letter is given, strict per-letter scoring
     The old "spelling" mode was removed because it duplicated cloze.  */
  FI.buildLetterQuestions = function (group, pack, scopeIds, mode, meaningLang = 'both') {
    const maps = FI.itemMaps(pack)
    const source = group.kind === 'word' ? maps.words : maps.sentences
    return (scopeIds ?? group.itemIds).map((id) => {
      const item = source.get(id)
      const meaning = FI.itemMeaning(item, group.kind)
      let answer = FI.itemLabel(item, group.kind)
      let fiLine = null
      if (group.kind === 'sentence') {
        const target = (item.gloss ?? []).find((g) => g.senseId !== null) ?? { token: item.fiText.split(' ')[0] }
        answer = target.token.replace(/[.,!?]/g, '')
        fiLine = item.fiText.replace(target.token, '______')
      }
      const letters = FI.lettersOf(answer)
      const isDictation = mode === 'dictation'
      const seed = FI.hash(`${group.id}:${id}:${mode}`)
      const reveal = isDictation ? letters.map(() => false) : FI.randomReveal(letters, seed)
      const blanks = letters.map((_, i) => i).filter((i) => !reveal[i])
      return {
        itemId: id,
        answer,
        letters,
        reveal,
        hintOrder: isDictation ? blanks : FI.shuffle(blanks, seed + 7919),
        promptZh: meaning.zh,
        promptEn: meaning.en,
        fiLine,
        image: FI.itemImage(item, group.kind),
        audioText: group.kind === 'word' ? item.lemma : item.fiText,
        audioFile: FI.itemAudio(item),
        hints: [
          `首字母：${letters[0]}`,
          `共 ${letters.length} 个字母 · ${FI.countSyllables(answer)} 个音节`,
          `释义：${FI.formatMeaning(meaning.zh, meaning.en, meaningLang)}`,
        ],
      }
    })
  }

  FI.nextGroupId = function (groupIndex, groupId) {
    const list = groupIndex.groups
    const i = list.findIndex((g) => g.id === groupId)
    if (i < 0 || i === list.length - 1) return null
    // Two parallel tracks: word groups stay on the word track, sentence
    // groups on the sentence track. Only when a track is exhausted do we
    // fall back to the immediate next group in the index.
    const sameTrack = list.slice(i + 1).find((g) => g.kind === list[i].kind)
    return (sameTrack ?? list[i + 1])?.id ?? null
  }
})()
