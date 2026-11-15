/* Learning flow controller.
   Configurable pipeline: memorise first, then the enabled practice modes in
   a per-group random order, then complete. The five items inside every round
   are shuffled too. Each session carries its seed, so a paused group resumes
   with exactly the same mode and item order. Every practice round ends with
   a result screen offering "continue" or "retry only the wrong items".

   All interface strings come from app/i18n.js and follow preferences.uiLang
   (zh / en). Word and sentence meanings follow the separate meaningLang
   preference. Display preferences are local-only and travel with the
   portable progress file.

   Feedback is intentionally colour-only: a correct option turns green, a
   wrong one turns red (and the right option is highlighted). No status label
   is printed under the options, and the stage itself no longer flashes.
   Find-image adds one extra, non-textual reward: the correctly picked word
   card flips over to its illustration and the word is read aloud once. */
(function () {
  const FI = window.FI
  const { pack, groups: groupIndex } = window.FI_DATA
  const maps = FI.itemMaps(pack)
  const groupById = new Map(groupIndex.groups.map((g) => [g.id, g]))
  const app = document.getElementById('app')
  const modalRoot = document.getElementById('modal-root')
  const toastEl = document.getElementById('toast')

  // Browser regression sets FI_FAST_TEST to collapse every transition timer.
  const FAST = Boolean(window.FI_FAST_TEST)
  // Autoplay is normally suppressed in the headless suite; FI_TEST_AUTOPLAY
  // opts the regression page in so the memorise auto-read path is exercised.
  const AUTOPLAY = !FAST || Boolean(window.FI_TEST_AUTOPLAY)
  // The browser regression drives a fixed, canonical order; real sessions
  // are shuffled. Read dynamically so the harness can switch modes of order.
  const fixedOrder = () => window.FI_TEST_FIXED_ORDER === true
  const newSeed = () => (Math.random() * 0xffffffff) >>> 0
  const DELAY = {
    feedback: FAST ? 6 : 880,
    transition: FAST ? 6 : 1000,
    matchWrong: FAST ? 6 : 640,
    matchClear: FAST ? 6 : 1050,
  }

  let state = FI.Store.load()
  let session = null
  let ui = { view: 'home', level: state.preferences.targetLevel ?? 'A1', timer: null, token: 0, transition: false, modal: false }
  let pendingImport = null
  let lastSlot = null

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const today = () => new Date().toISOString().slice(0, 10)
  const source = (kind) => (kind === 'word' ? maps.words : maps.sentences)
  const SELECT_MODES = ['choice', 'listen', 'findImage']
  // Cloze and dictation share the underline-slot renderer; they differ in
  // what is revealed, what the prompt shows and how strictly we score.
  const LETTER_MODES = ['cloze', 'dictation']
  const pref = () => state.preferences

  /* ── localised text helpers ────────────────────────────────── */
  const uiLang = () => pref().uiLang
  const t = (key, vars) => FI.tr(uiLang(), key, vars)            // plain text
  const th = (key, vars) => FI.trHtml(uiLang(), key, vars)        // HTML-safe
  const modeLabel = (m) => FI.modeLabel(m, uiLang())
  const modeShort = (m) => FI.modeShort(m, uiLang())
  const modeDesc = (m) => FI.modeDesc(m, uiLang())
  const groupTitle = (g) => FI.groupTitle(g, uiLang())
  const meaningName = () => t(`meaningLang.${pref().meaningLang}`)
  const themeName = (v) => t(`theme.${v}`)
  const bgmName = (id) => FI.bgmName(id, uiLang())
  const bgmDesc = (id) => FI.bgmDesc(id, uiLang())
  const uiName = () => (FI.UI_LANG_NAME ?? {})[uiLang()] ?? uiLang()
  const kindName = (kind) => t(`head.kind.${kind}`)
  const groupKindName = (kind) => t(`head.group.${kind}`)

  /* ── display preferences ───────────────────────────────────── */
  function applyTheme() {
    const choice = pref().theme
    const resolved = choice === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : choice
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#101922' : '#F4F7FA')
  }
  function applyBgm() {
    if (!FI.Bgm) return
    FI.Bgm.setTrack(pref().bgmTrack)
    if (pref().bgm) FI.Bgm.start(pref().bgmTrack)
    else FI.Bgm.stop()
  }
  function applyUiLang() {
    document.documentElement.lang = uiLang() === 'en' ? 'en' : 'zh-CN'
    document.title = t('app.title')
  }
  function applyPrefs() { applyTheme(); applyBgm(); applyUiLang() }
  window.matchMedia?.('(prefers-color-scheme: dark)')
    ?.addEventListener?.('change', () => { if (pref().theme === 'system') applyTheme() })

  /** zh / en lines, filtered by the "Chinese only / English only / both" setting. */
  function meaningLines(zh, en) {
    const lang = pref().meaningLang
    const out = []
    if (lang !== 'en') out.push(`<div class="zh">${esc(zh)}</div>`)
    if (lang !== 'zh') out.push(`<div class="en${lang === 'en' ? ' solo' : ''}">${esc(en)}</div>`)
    return out.join('')
  }
  function meaningInline(zh, en) {
    return esc(FI.formatMeaning(zh, en, pref().meaningLang))
  }
  /** Compact meaning block used on the listen-mode option cards. */
  function meaningOption(zh, en) {
    const lang = pref().meaningLang
    const out = []
    if (lang !== 'en') out.push(`<span class="om zh">${esc(zh)}</span>`)
    if (lang !== 'zh') out.push(`<span class="om en${lang === 'en' ? ' solo' : ''}">${esc(en)}</span>`)
    return `<span class="optcard-meaning">${out.join('')}</span>`
  }

  function persist() {
    state.preferences.targetLevel = ui.level
    // On the home screen keep the paused session untouched so the resume
    // banner survives level switches, imports and exports.
    if (ui.view === 'learn') state.session = session && session.phase !== 'complete' ? session : null
    FI.Store.save(state)
  }
  function toast(msg) {
    toastEl.textContent = msg
    toastEl.classList.add('show')
    clearTimeout(toastEl._t)
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200)
  }
  function later(fn, ms) {
    clearTimeout(ui.timer)
    const token = ++ui.token
    ui.timer = setTimeout(() => { if (token === ui.token) fn() }, ms)
  }
  function stopTimers() { clearTimeout(ui.timer); ui.token++ }

  /* ── image rendering ──────────────────────────────────────── */
  function imageAlt(image) {
    return uiLang() === 'en' ? (image?.altEn ?? image?.altZh) : (image?.altZh ?? image?.altEn)
  }
  function picture(image, seed, cls, alt) {
    const label = esc(alt ?? imageAlt(image) ?? t('mem.imageFallback'))
    if (image?.path) {
      // A missing illustration must degrade to the geometric placeholder
      // instead of leaking long alt text into the card.
      return `<img class="${cls}" src="${esc(image.path)}" alt="${label}" data-motif="${esc(image.motif ?? 'idea')}" data-seed="${esc(seed)}">`
    }
    return `<div class="${cls}" role="img" aria-label="${label}">${FI.motifSVG(image?.motif ?? 'idea', seed)}</div>`
  }

  /* ── audio ──────────────────────────────────────────────────
     Pre-recorded clips win. An item may declare audio.path in the content
     pack (produced from the CSV columns). Clips go through HTMLAudioElement:
     slow = playbackRate 0.5 with preservesPitch on, which is both genuinely
     slower and pitch-correct — unlike SpeechSynthesisUtterance.rate, which
     many engines clamp. Only items without a clip fall back to browser TTS;
     most devices have no fi-FI voice, so that fallback is called out in the
     Settings dialog and in the listen/dictation prompts.                    */
  let clipEl = null
  let playToken = 0
  function stopClip() {
    if (!clipEl) return
    try { clipEl.pause(); clipEl.currentTime = 0 } catch { /* not loaded yet */ }
  }
  function finnishVoice() {
    return (window.speechSynthesis?.getVoices?.() ?? []).some((v) => /^fi/i.test(v.lang))
  }
  /** Explicit warning instead of silently reading Finnish with a wrong voice. */
  function voiceHint(hasClip) {
    if (hasClip || finnishVoice() || !window.speechSynthesis) return ''
    return `<p class="hintline">${th('audio.voiceWarning')}</p>`
  }
  function ttsSpeak(text, slow) {
    if (!window.speechSynthesis) { toast(t('toast.audioUnsupported')); return }
    try {
      window.speechSynthesis.cancel()
      const raw = String(text)
      // Syllable commas force a real pause on engines that clamp `rate`.
      const spoken = slow && !/\s/.test(raw.trim()) ? FI.syllabify(raw).join(', ') : raw
      const u = new SpeechSynthesisUtterance(spoken)
      u.lang = 'fi-FI'
      u.rate = slow ? FI.SPEECH_RATE.slow : FI.SPEECH_RATE.normal
      u.pitch = slow ? 0.95 : 1
      const voice = (window.speechSynthesis.getVoices?.() ?? []).find((v) => /^fi/i.test(v.lang))
      if (voice) u.voice = voice
      window.speechSynthesis.speak(u)
    } catch { /* speech synthesis is best-effort */ }
  }
  function speak(text, speed, audioPath) {
    const slow = speed === 'slow'
    const token = ++playToken
    stopClip()
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel() } catch { /* noop */ } }
    const fallback = () => { if (token === playToken) ttsSpeak(text, slow) }
    // Browser regression stubs window.Audio, so this path is exercised there
    // without touching the network or a real sound device.
    if (!audioPath) return fallback()
    try {
      if (!clipEl) { clipEl = new Audio(); clipEl.preload = 'auto' }
      clipEl.src = audioPath
      clipEl.playbackRate = slow ? FI.SPEECH_RATE.slow : FI.SPEECH_RATE.normal
      clipEl.preservesPitch = true
      clipEl.onerror = fallback
      const playing = clipEl.play()
      if (playing && typeof playing.catch === 'function') playing.catch(fallback)
    } catch { fallback() }
  }
  /** Auto-read once per newly shown card/question.
      Memorise: each of the five cards plays once on entry (and again after a
      paused session is resumed). Listen/dictation: each question plays once.
      Re-renders of the same card do not repeat the sound. */
  function autoSpeak() {
    if (!AUTOPLAY || !session || ui.transition) return
    const p = session.phase
    if (!['memorize', 'listen', 'dictation'].includes(p)) return
    const r = session.round
    if (!r || r.feedback) return
    let text, audioFile, key
    if (p === 'memorize') {
      const item = source(session.kind).get(r.scopeIds[r.index])
      if (!item) return
      text = session.kind === 'word' ? item.lemma : item.fiText
      audioFile = FI.itemAudio(item)
      key = `memorize:${session.groupId}:${session.attempt}:${r.index}`
    } else {
      const q = r.questions?.[r.index]
      if (!q?.audioText) return
      text = q.audioText
      audioFile = q.audioFile
      key = `${p}:${r.mode}:${r.attempt}:${r.index}`
    }
    if (session._spoken === key) return
    session._spoken = key
    speak(text, r.speed ?? 'normal', audioFile)
  }

  /* ── session lifecycle ────────────────────────────────────── */
  function initSlots(q) {
    return q.letters.map((ch, i) => (q.reveal[i] ? ch : ''))
  }
  function makeRound(mode, scope, isRetry) {
    const g = groupById.get(session.groupId)
    const base = session.seed ?? FI.hash(session.groupId)
    const seed = base + session.attempt * 101 + session.pipelineIndex * 31 +
      FI.hash(mode) * 13 + (isRetry ? 7 : 0)
    // Every round gets its own item order. `previousOrder` stops two rounds
    // in a row from presenting the same five words in the same sequence; for
    // the first round it is the canonical order from the content pack.
    const previousOrder = session.round?.scopeIds ?? session.itemIds
    const order = fixedOrder()
      ? scope.slice()
      : FI.shuffleItems(scope, seed + 991, previousOrder)
    const r = {
      mode,
      scopeIds: order.slice(),
      attempt: session.attempt,
      index: 0,
      questions: [],
      answers: [],
      feedback: null,
      hintsUsed: 0,
      hintRevealed: [],
      slots: [],
      lastInput: '',
      speed: 'normal',
      selected: null,
      flash: null,
      matched: [],
      mismatches: [],
      pairs: null,
    }
    // All select-style rounds use exactly four options.
    if (mode === 'choice') {
      r.questions = FI.buildChoiceQuestions(g, pack, { scopeIds: order, seed, optionCount: 4 })
    } else if (mode === 'listen' || mode === 'findImage') {
      r.questions = FI.buildSelectQuestions(g, pack, {
        scopeIds: order,
        seed,
        optionCount: 4,
        textOnly: mode === 'findImage',
        hideLabel: mode === 'listen',
        meaningLang: pref().meaningLang,
      })
    } else if (mode === 'match') {
      r.pairs = FI.buildMatchPairs(g, pack, order, seed, pref().meaningLang)
    } else if (LETTER_MODES.includes(mode)) {
      r.questions = FI.buildLetterQuestions(g, pack, order, mode, pref().meaningLang)
      r.slots = initSlots(r.questions[0])
    }
    return r
  }

  function startGroup(groupId, opts = {}) {
    const g = groupById.get(groupId)
    if (!g) { toast(t('toast.groupMissing')); return }
    stopTimers()
    ui.transition = false
    // A fresh seed per group: mode order and item order change every time the
    // group is started, but stay fixed while the group is in progress.
    const seed = fixedOrder() ? 0 : newSeed()
    session = {
      groupId,
      level: g.level,
      kind: g.kind,
      itemIds: g.itemIds.slice(),
      seed,
      pipeline: FI.buildPipeline(g.kind, state.preferences.enabledModes, fixedOrder() ? undefined : seed),
      pipelineIndex: 0,
      phase: 'memorize',
      scopeIds: (opts.scopeIds ?? g.itemIds).slice(),
      attempt: opts.attempt ?? 1,
      retryCount: opts.retryCount ?? 0,
      round: null, // replaced below, once `session` is fully assigned
      results: {},
      lastResult: null,
      lastWrongIds: [],
      startedAt: new Date().toISOString(),
      _spoken: null,
      _flipSpoken: null,
    }
    session.round = makeRound('memorize', session.scopeIds, false)
    ui.view = 'learn'
    persist()
    render()
  }

  function enterMode(mode, scope, isRetry = false) {
    const idx = session.pipeline.indexOf(mode)
    session.pipelineIndex = idx >= 0 ? idx : Math.min(session.pipelineIndex + 1, session.pipeline.length - 1)
    session.phase = mode
    session.lastResult = null
    session.round = makeRound(mode, scope, isRetry)
    ui.transition = false
    stopTimers()
    persist()
    render()
  }

  function nextModeLabel() {
    return modeLabel(session.pipeline[session.pipelineIndex + 1] ?? 'complete')
  }

  function advance() {
    const nextIdx = session.pipelineIndex + 1
    if (nextIdx >= session.pipeline.length) { finishGroup(); return }
    session.pipelineIndex = nextIdx
    const next = session.pipeline[nextIdx]
    if (next === 'complete') finishGroup()
    else enterMode(next, session.itemIds)
  }

  function finishGroup() {
    stopTimers()
    session.choicePercent = session.results.choice?.percent ?? 0
    session.clozePercent = session.results.cloze?.percent ?? 0
    FI.Store.recordComplete(state, session)
    session.phase = 'complete'
    session.round = null
    session.lastResult = null
    persist()
    render()
  }

  function finishRound() {
    stopTimers()
    const r = session.round
    if (!r) return
    let total, correct, wrongIds, hintIds, percent
    let extraKey = '', extraCount = 0
    if (r.mode === 'match') {
      total = r.scopeIds.length
      correct = r.answers.length
      wrongIds = [...new Set(r.mismatches)]
      hintIds = []
      const attempts = correct + r.mismatches.length
      percent = attempts ? Math.round((correct / attempts) * 100) : 100
      extraKey = 'result.mismatch'
      extraCount = r.mismatches.length
    } else {
      total = r.answers.length
      correct = r.answers.filter((a) => a.correct).length
      wrongIds = [...new Set(r.answers.filter((a) => !a.correct).map((a) => a.itemId))]
      hintIds = [...new Set(r.answers.filter((a) => a.hintUsed).map((a) => a.itemId))]
      percent = total ? Math.round((correct / total) * 100) : 0
      if (r.mode === 'dictation') { extraKey = 'result.hinted'; extraCount = hintIds.length }
    }
    const retryIds = r.mode === 'dictation'
      ? [...new Set([...wrongIds, ...hintIds])]
      : wrongIds
    const result = {
      mode: r.mode,
      label: modeLabel(r.mode),
      total, correct, wrongIds, hintIds, retryIds, percent,
      extraKey, extraCount,
      perfect: retryIds.length === 0,
      fullRound: r.scopeIds.length === session.itemIds.length,
    }
    FI.Store.recordRound(state, session, result)
    session.results[r.mode] = result
    session.lastResult = result
    session.lastWrongIds = retryIds
    session.phase = 'result'
    r.feedback = null
    persist()
    render()
  }

  function retryRound() {
    const ids = session.lastResult?.retryIds ?? []
    if (!ids.length) return
    const mode = session.pipeline[session.pipelineIndex]
    session.attempt++
    session.retryCount++
    enterMode(mode, ids, true)
    toast(t('toast.retry', { n: ids.length, mode: modeLabel(mode) }))
  }

  function goHome(msg) {
    stopTimers()
    ui.transition = false
    if (session && session.phase !== 'complete') {
      state.session = session
      state.paused = true
    }
    session = null
    ui.view = 'home'
    persist()
    render()
    if (msg) toast(msg)
  }

  /* ── answer handling ──────────────────────────────────────── */
  function nextQuestion() {
    const r = session.round
    if (!r) return
    if (r.index < r.questions.length - 1) {
      r.index++
      r.feedback = null
      r.hintsUsed = 0
      r.hintRevealed = []
      r.lastInput = ''
      if (LETTER_MODES.includes(r.mode)) r.slots = initSlots(r.questions[r.index])
      lastSlot = null
      persist()
      render()
    } else finishRound()
  }

  function pick(idx) {
    if (!session || !SELECT_MODES.includes(session.phase)) return
    const r = session.round
    if (r.feedback) return
    const q = r.questions[r.index]
    const opt = q.options[idx]
    if (!opt) return
    const correct = opt.id === q.itemId
    r.answers.push({ itemId: q.itemId, chosenId: opt.id, correct, hintUsed: false })
    r.feedback = { idx, correct, correctIdx: q.options.findIndex((o) => o.id === q.itemId) }
    // Find-image reward: flip the correct card to its picture and read the
    // word once. This is user-triggered (a click), so no autoplay gate; a
    // per-question key prevents a second sound on re-render / resume.
    if (correct && session.phase === 'findImage') {
      const flipKey = `findImage:${session.groupId}:${r.attempt}:${r.index}`
      if (session._flipSpoken !== flipKey) {
        session._flipSpoken = flipKey
        speak(q.audioText, 'normal', q.audioFile)
      }
    }
    persist()
    render()
    later(nextQuestion, DELAY.feedback)
  }

  function assemble(q, r) {
    return q.letters.map((ch, i) => (q.reveal[i] || r.hintRevealed.includes(i) ? ch : (r.slots[i] ?? ''))).join('')
  }

  function submitAnswer() {
    if (!session || !LETTER_MODES.includes(session.phase)) return
    const r = session.round
    if (r.feedback) return
    const q = r.questions[r.index]
    const outstanding = q.letters.some((_, i) => !q.reveal[i] && !r.hintRevealed.includes(i) && !r.slots[i])
    if (outstanding) { toast(t('toast.slotsIncomplete')); return }
    const val = assemble(q, r)
    const correct = r.mode === 'dictation'
      ? FI.strictAnswer(val) === FI.strictAnswer(q.answer)
      : FI.normalizeAnswer(val) === FI.normalizeAnswer(q.answer)
    r.lastInput = val
    r.answers.push({ itemId: q.itemId, correct, hintUsed: r.hintsUsed > 0 })
    r.feedback = { correct, answer: q.answer, val }
    persist()
    render()
    later(nextQuestion, DELAY.feedback)
  }

  function useHint() {
    const r = session?.round
    if (!r || r.feedback) return
    const q = r.questions[r.index]
    if (!q?.hints || r.hintsUsed >= q.hints.length) return
    if (LETTER_MODES.includes(r.mode)) {
      const at = q.hintOrder[r.hintsUsed]
      if (at !== undefined) {
        r.slots[at] = q.letters[at]
        r.hintRevealed.push(at)
      }
    }
    r.hintsUsed++
    persist()
    render()
  }

  function matchPick(side, id) {
    if (!session || session.phase !== 'match') return
    const r = session.round
    if (r.feedback || r.matched.includes(id) || r.flash) return
    if (!r.selected) { r.selected = { side, id }; persist(); render(); return }
    if (r.selected.side === side) { r.selected = { side, id }; persist(); render(); return }
    const first = r.selected
    const leftId = first.side === 'left' ? first.id : id
    const rightId = first.side === 'right' ? first.id : id
    r.selected = null
    if (leftId === rightId) {
      r.matched.push(leftId)
      r.answers.push({ itemId: leftId, correct: true, hintUsed: false })
      persist()
      render()
      if (r.matched.length === r.scopeIds.length) later(finishRound, DELAY.matchClear)
    } else {
      r.flash = { side, id, firstSide: first.side, firstId: first.id }
      r.mismatches.push(leftId, rightId)
      persist()
      render()
      later(() => { r.flash = null; persist(); render() }, DELAY.matchWrong)
    }
  }

  function focusSlot(i) {
    const el = app.querySelector(`input[data-slot="${i}"]`)
    if (el) { el.focus(); el.select?.() }
  }
  function focusNextEmpty(from) {
    const q = session?.round?.questions?.[session.round.index]
    const r = session.round
    if (!q || !r) return
    for (let i = from + 1; i < q.letters.length; i++) {
      if (!q.reveal[i] && !r.hintRevealed.includes(i) && !r.slots[i]) { focusSlot(i); return }
    }
    const first = q.letters.findIndex((_, i) => !q.reveal[i] && !r.hintRevealed.includes(i) && !r.slots[i])
    if (first >= 0) focusSlot(first)
  }
  function insertLetter(ch) {
    const r = session?.round
    if (!r || r.feedback || !LETTER_MODES.includes(r.mode)) return
    const q = r.questions[r.index]
    let i = lastSlot
    if (i == null || i < 0 || i >= q.letters.length || q.reveal[i] || r.hintRevealed.includes(i)) {
      i = q.letters.findIndex((_, j) => !q.reveal[j] && !r.hintRevealed.includes(j) && !r.slots[j])
    }
    if (i < 0) return
    r.slots[i] = ch
    persist()
    render()
    focusNextEmpty(i)
  }

  function memNext() {
    if (!session || session.phase !== 'memorize' || ui.transition) return
    const r = session.round
    const scope = r.scopeIds
    if (r.index < scope.length - 1) {
      r.index++
      persist()
      render()
    } else {
      ui.transition = true
      render()
      toast(t('toast.memDone', { mode: nextModeLabel() }))
      later(advance, DELAY.transition)
    }
  }

  /* ── home view ────────────────────────────────────────────── */
  function renderHome() {
    const completed = Object.values(state.groups).filter((g) => g.status === 'completed').length
    const todayEvents = state.eventLog.filter((e) => String(e.createdAt).slice(0, 10) === today()).length
    const mistakes = Object.keys(state.mistakes).length
    const levelInfo = groupIndex.levels.find((l) => l.level === ui.level)
    const wordGroups = groupIndex.groups.filter((g) => g.level === ui.level && g.kind === 'word')
    const sentenceGroups = groupIndex.groups.filter((g) => g.level === ui.level && g.kind === 'sentence')
    // A set, not an arrow: the practice modes are shuffled per group.
    const pipelineSet = (kind) => FI.buildPipeline(kind, state.preferences.enabledModes)
      .slice(1, -1).map(modeShort).join(' · ')
    const wordPipeline = pipelineSet('word')
    const sentencePipeline = pipelineSet('sentence')

    const resume = state.session ? (() => {
      const s = state.session
      const g = groupById.get(s.groupId)
      if (!g || !Array.isArray(s.pipeline)) return ''
      const phase = modeLabel(s.phase)
      const total = s.round?.questions?.length || s.round?.pairs?.left.length || s.scopeIds.length
      const pos = s.phase === 'result' ? total : Math.min((s.round?.index ?? 0) + 1, total)
      return `<div class="resume">
        <p>${th('home.resume.line', {
          state: t(state.paused ? 'home.resume.paused' : 'home.resume.interrupted'),
          id: g.id, title: groupTitle(g), phase, pos, total,
        })}</p>
        <button class="btn primary sm" data-act="resume">${th('home.resume.continue')}</button>
        <button class="btn ghost sm" data-act="discard">${th('home.resume.discard')}</button>
      </div>`
    })() : ''

    const levelTabs = FI.CEFR.map((l) => {
      const info = groupIndex.levels.find((x) => x.level === l)
      return `<button class="leveltab ${l === ui.level ? 'active' : ''}" data-act="level" data-level="${l}">${l}<span style="opacity:.7;font-size:11px">${th('home.levelTab', { n: info.wordGroups })}</span></button>`
    }).join('')

    const card = (g) => {
      const p = state.groups[g.id] ?? {}
      const status = p.status ?? 'not-started'
      const label = status === 'completed' ? t('home.card.completed')
        : status === 'in-progress' ? t('home.card.inProgress') : t('home.card.notStarted')
      const button = status === 'completed' ? t('home.card.relearn')
        : status === 'in-progress' ? t('home.card.continue') : t('home.card.start')
      const items = g.itemIds.map((id) => {
        const item = source(g.kind).get(id)
        return `<span class="chip fi">${esc(FI.itemLabel(item, g.kind))}</span>`
      }).join('')
      const foot = th('home.card.size', { n: g.size })
        + (p.bestScore ? th('home.card.best', { n: p.bestScore }) : '')
        + (p.attempts ? th('home.card.attempts', { n: p.attempts }) : '')
      return `<div class="gcard ${status === 'completed' ? 'done' : ''}">
        <div class="gcard-head"><span class="gid">${esc(g.id)}</span><span class="status ${status === 'completed' ? 'done' : status === 'in-progress' ? 'active' : ''}">${label}</span></div>
        <h4>${esc(groupTitle(g))}</h4>
        <div class="chips">${items}</div>
        <div class="gcard-foot">
          <small>${foot}</small>
          <button class="btn sm primary" data-act="start-group" data-id="${esc(g.id)}">${button}</button>
        </div>
      </div>`
    }

    app.innerHTML = `<div class="wrap">
      <div class="topbar">
        <div class="brand"><div class="brand-mark">FL</div><div><h1>Finnish Learn</h1><p>${th('brand.subtitle')}</p></div></div>
        <button class="btn sm icon" data-act="ui-toggle" title="${th('ui.toggle.title')}">${th('ui.toggle')}</button>
        <button class="btn sm icon" data-act="theme-toggle" title="${th('home.theme.title')}">${th(document.documentElement.dataset.theme === 'dark' ? 'home.theme.dark' : 'home.theme.light')}</button>
        <button class="btn sm icon ${pref().bgm ? 'on' : ''}" data-act="bgm-toggle" title="${th('home.music.title', { track: bgmName(pref().bgmTrack) })}">${th('home.music', { state: t(pref().bgm ? 'home.music.on' : 'home.music.off') })}</button>
        <button class="btn sm" data-act="settings">${th('home.settings')}</button>
        <button class="btn sm" data-act="export">${th('home.export')}</button>
        <button class="btn sm" data-act="import">${th('home.import')}</button>
      </div>

      <div class="hero">
        <h2>${th('home.hero.title')}</h2>
        <p>${th('home.hero.desc', { words: wordPipeline, sentences: sentencePipeline })}</p>
        <div class="stats">
          <div class="stat"><span>${th('home.stat.completed')}</span><b>${completed}<small> / ${groupIndex.groups.length}</small></b></div>
          <div class="stat"><span>${th('home.stat.items')}</span><b>${pack.words.length + pack.sentences.length}<small>${th('home.stat.itemsUnit')}</small></b></div>
          <div class="stat"><span>${th('home.stat.today')}</span><b>${todayEvents}<small>${th('home.stat.unit')}</small></b></div>
          <div class="stat"><span>${th('home.stat.mistakes')}</span><b>${mistakes}<small>${th('home.stat.unit')}</small></b></div>
        </div>
      </div>

      ${state.contentMismatch ? `<div class="resume"><p>${th('home.mismatch', { from: state.contentVersion, to: pack.version })}</p></div>` : ''}
      ${resume}

      <div class="leveltabs">${levelTabs}</div>
      <p class="levelhint">${th('home.levelHint', {
        level: ui.level, words: levelInfo.wordCount, sentences: levelInfo.sentenceCount,
        wordGroups: levelInfo.wordGroups, sentenceGroups: levelInfo.sentenceGroups, size: FI.GROUP_SIZE,
      })}</p>

      <div class="section-head"><h3>${th('home.section.words')}</h3><span>${th('home.section.words.desc', { meaning: meaningName() })}</span></div>
      <div class="group-grid">${wordGroups.map(card).join('')}</div>

      <div class="section-head"><h3>${th('home.section.sentences')}</h3><span>${th('home.section.sentences.desc')}</span></div>
      ${sentenceGroups.length
        ? `<div class="group-grid">${sentenceGroups.map(card).join('')}</div>`
        : `<div class="empty">${th('home.empty', { level: ui.level, size: FI.GROUP_SIZE })}</div>`}

      <div class="tools">
        <button class="btn sm" data-act="settings">${th('home.tools.settings')}</button>
        <button class="btn sm" data-act="export">${th('home.tools.export')}</button>
        <button class="btn sm" data-act="import">${th('home.tools.merge')}</button>
        <button class="btn sm danger" data-act="clear">${th('home.tools.clear')}</button>
      </div>
      <p class="footnote">
        ${th('home.foot.line1', {
          ui: uiName(), meaning: meaningName(), theme: themeName(pref().theme),
          bgm: t(pref().bgm ? 'common.bgmOn' : 'common.bgmOff'),
          track: bgmName(pref().bgmTrack),
        })}<br>
        ${th('home.foot.line2', { date: state.lastExportedAt ? state.lastExportedAt.slice(0, 16).replace('T', ' ') : t('home.foot.never') })}<br>
        ${th('home.foot.line3')}
      </p>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
    </div>`
  }

  /* ── learning view ────────────────────────────────────────── */
  function renderHead(g) {
    const steps = session.pipeline.map((m, i) =>
      `<div class="step ${i === session.pipelineIndex ? 'on' : i < session.pipelineIndex ? 'past' : ''}">${i + 1}. ${esc(modeShort(m))}</div>`
    ).join('')
    const r = session.round
    const total = session.phase === 'memorize'
      ? session.scopeIds.length
      : (r ? (r.questions.length || r.pairs?.left.length || 1) : session.scopeIds.length)
    const pos = (session.phase === 'complete' || session.phase === 'result')
      ? total
      : session.phase === 'match'
        ? Math.min(r?.matched.length ?? 0, total)
        : Math.min((r?.index ?? 0) + 1, total)
    const pct = Math.round((pos / Math.max(total, 1)) * 100)
    return `<div class="learn-head">
      <div class="row">
        <button class="btn sm ghost" data-act="pause">${th('head.pause')}</button>
        <h2>${esc(g.id)} · ${esc(groupTitle(g))}${session.attempt > 1 ? `　<span class="pill amber">${th('head.retryBadge', { n: session.attempt })}</span>` : ''}</h2>
        <span class="counter">${th('head.counter', { level: g.level, kind: kindName(g.kind), pos, total })}</span>
      </div>
      <div class="steps">${steps}</div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
    </div>`
  }

  function memorizeWord(item) {
    const s = item.senses[0]
    const isVerb = item.pos === 'verb'
    const numberBlock = isVerb
      ? `<dt>${th('mem.number')}</dt><dd>${th('mem.number.verb')}</dd>`
      : `<dt>${th('mem.singular')}</dt><dd class="fi">${esc(item.number.singular)}</dd><dt>${th('mem.plural')}</dt><dd class="fi">${esc(item.number.plural)}</dd>`
    const verbBadge = isVerb ? `<span class="badge amber">${th('mem.verbType', { n: item.verb.verbType, irr: item.verb.irregular ? t('mem.irregular') : '' })}</span>` : ''
    const more = isVerb
      ? `<details class="more"><summary>${th('mem.verbDetails', { n: item.verb.verbType })}</summary>
          <div class="vrow">
            <div><span>${th('mem.infEnding')}</span><b>${esc(item.verb.infinitiveEnding)}</b></div>
            <div><span>${th('mem.presentStem')}</span><b>${esc(item.verb.presentStem)}</b></div>
            <div><span>${th('mem.present1sg')}</span><b>${esc(item.verb.present1sg)}</b></div>
            <div><span>${th('mem.past3sg')}</span><b>${esc(item.verb.past3sg)}</b></div>
            <div><span>${th('mem.nutParticiple')}</span><b>${esc(item.verb.nutParticiple)}</b></div>
          </div>
          <p style="color:var(--muted);margin:10px 0 0">${th('mem.verbFoot', {
            kotus: item.verb.kotusType ?? '—',
            note: FI.verbNote(item.verb.note, uiLang()),
          })}</p>
        </details>`
      : `<details class="more"><summary>${th('mem.nominalDetails')}</summary>
          <div class="vrow">
            <div><span>${th('mem.stemStrong')}</span><b>${esc(item.nominal.stems.strong)}</b></div>
            <div><span>${th('mem.stemWeak')}</span><b>${esc(item.nominal.stems.weak)}</b></div>
            <div><span>${th('mem.harmony')}</span><b>${esc(item.nominal.harmony)}</b></div>
            <div><span>${th('mem.declClass')}</span><b>${esc(FI.declText(`Kotus ${item.nominal.kotusType ?? '—'}`, uiLang()))}</b></div>
          </div>
          <table class="cases"><tr><th>${th('mem.table.case')}</th><th>${th('mem.table.form')}</th><th>${th('mem.table.suffix')}</th><th>${th('mem.table.stem')}</th></tr>
          ${item.nominal.caseForms.map((f) => `<tr><td>${esc(FI.caseText(f, uiLang()))}</td><td class="f">${esc(f.form)}</td><td class="f">${esc(f.suffix)}</td><td>${th(f.stemUsed === 'strong' ? 'mem.stem.strong' : 'mem.stem.weak')}</td></tr>`).join('')}
          </table>
        </details>`
    return `<div class="mem">
      ${picture(s.image, item.id, 'mem-pic')}
      <div>
        <p class="lemma">${esc(item.lemma)}</p>
        <p class="ipa">${esc(item.ipa)} <button class="btn sm ghost" data-act="speak" data-text="${esc(item.lemma)}" data-audio="${esc(item.audio?.path ?? '')}" title="${th('audio.pronounceTitle')}">${th('audio.pronounce')}</button></p>
        <div class="badges"><span class="badge blue">${esc(item.cefr)}</span><span class="badge">${esc(FI.posText(item, uiLang()))}</span>${verbBadge}<span class="badge teal">auto-derived</span></div>
        <dl class="kv">${numberBlock}<dt>${th('mem.morphClass')}</dt><dd>${isVerb ? th('mem.kotus', { n: item.verb.kotusType ?? '—' }) : esc(FI.declText(item.nominal.declensionClass, uiLang()))}</dd></dl>
        <div class="gloss-box">${meaningLines(s.zh, s.en)}</div>
        ${more}
      </div>
    </div>`
  }

  function memorizeSentence(item) {
    return `<div class="cloze-q" style="text-align:left">
        <div class="fi" style="font-size:26px">${esc(item.fiText)} <button class="btn sm ghost" data-act="speak" data-text="${esc(item.fiText)}" data-audio="${esc(item.audio?.path ?? '')}">🔊</button></div>
        ${meaningLines(item.zhText, item.enText)}
      </div>
      <div class="badges"><span class="badge blue">${esc(item.cefr)}</span>${item.grammarPoints.map((c) => `<span class="badge amber">${esc(FI.caseName(c, uiLang()))}</span>`).join('')}</div>
      <p class="tip" style="margin:12px 0 6px">${th('mem.sentence.gloss')}</p>
      <div class="chips">${item.gloss.map((g) => `<span class="chip fi">${esc(g.token)}${g.caseForm ? ` · ${esc(g.caseForm)}` : ''}</span>`).join('')}</div>`
  }

  function renderMemorize(g) {
    const r = session.round
    const index = r?.index ?? 0
    const scope = r?.scopeIds ?? session.scopeIds
    const item = source(session.kind).get(scope[index])
    const body = ui.transition
      ? `<div style="text-align:center;padding:36px 0"><div class="pill teal">${th('mem.transition.title')}</div><h3 style="margin:14px 0 4px">${th('mem.transition.heading', { mode: nextModeLabel() })}</h3><p class="tip">${th('mem.transition.tip', { n: scope.length })}</p></div>`
      : session.kind === 'word' ? memorizeWord(item) : memorizeSentence(item)
    return `<div class="stage">
      <div class="stage-head"><h3>${th('mem.title')}</h3><span class="pill">${index + 1} / ${scope.length}</span><span class="pill teal">${th('mem.pill', { meaning: meaningName() })}</span></div>
      ${body}
      <div class="stage-foot">
        <button class="btn sm" data-act="mem-prev" ${index === 0 || ui.transition ? 'disabled' : ''}>${th('mem.prev')}</button>
        <span class="spacer"></span><span class="tip">${th('mem.nextKey')}</span>
        <button class="btn primary" data-act="mem-next" ${ui.transition ? 'disabled' : ''}>${index < scope.length - 1 ? th('mem.next') : th('mem.finish', { mode: modeShort(session.pipeline[1] ?? 'complete') })}</button>
      </div>
    </div>`
  }

  function renderChoice(g) {
    const r = session.round
    const q = r.questions[r.index]
    const fb = r.feedback
    const opts = q.options.map((o, i) => {
      let cls = 'opt'
      if (fb) {
        if (i === fb.idx) cls += fb.correct ? ' correct' : ' wrong'
        else if (!fb.correct && i === fb.correctIdx) cls += ' reveal'
      }
      return `<button class="${cls}" data-act="pick" data-idx="${i}" ${fb ? 'disabled' : ''}><span class="num">${i + 1}</span> ${esc(o.label)}</button>`
    }).join('')
    return `<div class="stage">
      <div class="stage-head"><h3>${esc(modeLabel('choice'))}</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">${th('choice.pill')}</span></div>
      <div class="quiz-prompt">
        ${picture(q.image, q.itemId, 'quiz-pic')}
        ${meaningLines(q.promptZh, q.promptEn)}
        <p class="hintline">${th('choice.hint', { kind: t(session.kind === 'word' ? 'select.word' : 'select.sentence') })}</p>
      </div>
      <div class="opts">${opts}</div>
      <div class="stage-foot"><span class="tip">${th('choice.foot')}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">${th('common.pause')}</button></div>
    </div>`
  }

  function renderSelectWithImages(g, mode) {
    const r = session.round
    const q = r.questions[r.index]
    const fb = r.feedback
    const isListen = mode === 'listen'
    const isFind = mode === 'findImage'
    const cards = q.options.map((o, i) => {
      let cls = 'optcard'
      if (fb) {
        if (i === fb.idx) cls += fb.correct ? ' correct' : ' wrong'
        else if (!fb.correct && i === fb.correctIdx) cls += ' reveal'
      }
      // Listen: picture + meaning, never the Finnish word. Showing the word
      // would let learners match sound→spelling without understanding it.
      // Find-image: the prompt holds ONE meaning and no picture; the four
      // options are plain words. Only a correctly picked card turns over to
      // reveal the target illustration, so pictures never give the answer away.
      const flipped = isFind && Boolean(fb?.correct) && i === fb.idx
      if (flipped) cls += ' flipped'
      const front = `<span class="flip-face flip-front"><span class="num">${i + 1}</span><span class="optcard-label fi">${esc(o.label)}</span></span>`
      const back = flipped
        ? `<span class="flip-face flip-back">${picture(q.image, q.itemId, 'optcard-pic')}<span class="flip-word fi">${esc(o.label)}</span></span>`
        : ''
      const body = isListen
        ? `${picture(o.image, o.id, 'optcard-pic')}${meaningOption(o.zh, o.en)}`
        : `<span class="flip-inner">${front}${back}</span>`
      return `<button class="${cls}" data-act="pick" data-idx="${i}" ${fb ? 'disabled' : ''}>
        ${isListen ? `<span class="num">${i + 1}</span>` : ''}${body}
      </button>`
    }).join('')
    const prompt = isListen
      ? `<div class="listen-hero">
          <div class="audio-big">🎧</div>
          <p class="tip">${th('listen.hero')}</p>
          <div class="audio-row">
            <button class="btn primary" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="normal" data-rate="${FI.SPEECH_RATE.normal}">${th('audio.normal')}</button>
            <button class="btn sm" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="slow" data-rate="${FI.SPEECH_RATE.slow}">${th('audio.slow')}${q.audioFile ? '' : th('audio.slowSyllables')}</button>
          </div>
          ${voiceHint(q.audioFile)}
          <p class="hintline">${th('listen.hint')}</p>
        </div>`
      : `<div class="quiz-prompt find-prompt">
          ${meaningLines(q.promptZh, q.promptEn)}
          <p class="hintline">${th('findImage.hint')}</p>
        </div>`
    return `<div class="stage">
      <div class="stage-head"><h3>${esc(modeLabel(mode))}</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">${isListen ? th('listen.pill', { meaning: meaningName() }) : th('findImage.pill')}</span></div>
      ${prompt}
      <div class="optcards ${isListen ? 'with-meaning' : 'find-image'}">${cards}</div>
      <div class="stage-foot"><span class="tip">${th(isListen ? 'select.foot.listen' : 'select.foot.findImage')}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">${th('common.pause')}</button></div>
    </div>`
  }

  function renderMatch(g) {
    const r = session.round
    const p = r.pairs
    const alive = (side) => p[side].filter((x) => !r.matched.includes(x.id))
    const tile = (side, x) => {
      const selected = r.selected?.side === side && r.selected?.id === x.id
      const flashed = (r.flash?.side === side && r.flash?.id === x.id) ||
        (r.flash?.firstSide === side && r.flash?.firstId === x.id)
      const cls = `mtile ${selected ? 'selected' : ''} ${flashed ? 'wrong' : ''} ${side === 'left' ? 'fi' : ''}`
      const label = side === 'right' && x.zh !== undefined
        ? FI.formatMeaning(x.zh, x.en, pref().meaningLang, ' · ')
        : x.label
      return `<button class="${cls}" data-act="match-${side}" data-id="${esc(x.id)}">${esc(label)}</button>`
    }
    const done = r.matched.length === r.scopeIds.length
    return `<div class="stage">
      <div class="stage-head"><h3>${esc(modeLabel('match'))}</h3><span class="pill">${th('match.pill', { done: r.matched.length, total: r.scopeIds.length })}</span><span class="pill teal">${th('match.pill2')}</span></div>
      <p class="tip" style="margin:0 0 6px">${th('match.topRow', { kind: kindName(session.kind) })}</p>
      <div class="match-row">${alive('left').map((x) => tile('left', x)).join('') || `<span class="tip">${th('match.allMatched')}</span>`}</div>
      <p class="tip" style="margin:14px 0 6px">${th('match.bottomRow', { meaning: meaningName() })}</p>
      <div class="match-row">${alive('right').map((x) => tile('right', x)).join('') || `<span class="tip">${th('match.allMatched')}</span>`}</div>
      ${r.mismatches.length ? `<p class="tip" style="margin-top:12px;color:var(--no-text)">${th('match.mismatch', { n: r.mismatches.length })}</p>` : ''}
      ${done ? `<div class="feedback ok" role="status">${th('match.done')}</div>` : ''}
      <div class="stage-foot"><span class="tip">${th('match.foot')}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">${th('common.pause')}</button></div>
    </div>`
  }

  /* Cloze and dictation share the underline-slot renderer. Cloze shows the
     illustration alongside the meaning; dictation hides the meaning. On a
     wrong answer the correct letters are shown in place, inside the same
     red slots — no separate status label is printed below. */
  function renderLetters(g, mode) {
    const r = session.round
    const q = r.questions[r.index]
    const fb = r.feedback
    const isDictation = mode === 'dictation'
    const slots = q.letters.map((ch, i) => {
      const fixed = q.reveal[i] || r.hintRevealed.includes(i)
      if (fixed) return `<span class="slot fixed" aria-label="${th('letters.aria.given')}">${esc(ch)}</span>`
      const shown = fb && !fb.correct ? q.letters[i] : (r.slots[i] ?? '')
      return `<input class="slot ${fb ? (fb.correct ? 'ok' : 'no') : ''}" data-slot="${i}" maxlength="1" value="${esc(shown)}" aria-label="${th('letters.aria.slot', { n: i + 1 })}" autocomplete="off" autocapitalize="off" spellcheck="false" ${fb ? 'disabled' : ''}>`
    }).join('')
    // Hints are rebuilt on every render so a language or meaning switch
    // applies to the current question rather than only to the next group.
    const hintTexts = [
      t('letters.hintFirst', { ch: q.letters[0] }),
      t('letters.hintCount', { n: q.letters.length, syllables: FI.countSyllables(q.answer) }),
      t('letters.hintMeaning', { text: FI.formatMeaning(q.promptZh, q.promptEn, pref().meaningLang) }),
    ]
    const hints = hintTexts.slice(0, r.hintsUsed).map((h) => `<div>· ${esc(h)}</div>`).join('')
    const audio = `<div class="audio-row">
        <button class="btn primary" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="normal" data-rate="${FI.SPEECH_RATE.normal}">${th('audio.normal')}</button>
        <button class="btn" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="slow" data-rate="${FI.SPEECH_RATE.slow}">${th('audio.slow')}</button>
      </div>${voiceHint(q.audioFile)}`
    const clozePrompt = `<div class="cloze-q cloze-with-pic">
        ${picture(q.image, q.itemId, 'cloze-pic')}
        ${meaningLines(q.promptZh, q.promptEn)}
        ${q.fiLine ? `<div class="fi">${esc(q.fiLine).replace('______', '<span class="blank">______</span>')}</div>` : ''}
      </div>
      <p class="tip" style="text-align:center;margin:0 0 4px">${th(session.kind === 'word' ? 'letters.cloze.word' : 'letters.cloze.sentence')}</p>`
    const prompt = isDictation
      ? `<div class="dictation-prompt">
          ${picture(q.image, q.itemId, 'quiz-pic')}
          ${audio}
          <p class="tip">${th('letters.dictation.tip')}</p>
        </div>`
      : clozePrompt
    const pill = isDictation ? th('letters.dictation.pill') : th('letters.cloze.pill')
    const hintDefault = isDictation ? th('letters.hintDefault.dictation') : th('letters.hintDefault.cloze')
    const foot = isDictation ? th('letters.foot.dictation') : th('letters.foot.cloze')
    return `<div class="stage">
      <div class="stage-head"><h3>${esc(modeLabel(mode))}</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">${pill}</span></div>
      ${prompt}
      <div class="slots" id="slots">${slots}</div>
      <div class="letterbar"><span class="tip">${th('letters.special')}</span>${['ä', 'ö', 'å', 'š', 'ž'].map((c) => `<button class="btn sm" data-act="slot-letter" data-letter="${esc(c)}">${esc(c)}</button>`).join('')}<span class="tip">${th('letters.paste')}</span></div>
      <div class="answer-row">
        <button class="btn sm" data-act="hint" ${fb || r.hintsUsed >= hintTexts.length ? 'disabled' : ''}>${th('letters.hintButton', { used: r.hintsUsed, total: hintTexts.length })}</button>
        <span class="spacer"></span>
        ${fb ? `<button class="btn primary" data-act="next">${th('letters.next')}</button>` : `<button class="btn primary" data-act="submit">${th('letters.submit')}</button>`}
      </div>
      <div class="hintbox">${hints || hintDefault}</div>
      <div class="stage-foot"><span class="tip">${foot}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">${th('common.pause')}</button></div>
    </div>`
  }

  function resultExtraText(r) {
    let text = ''
    if (r.extraKey === 'result.mismatch') text = t('result.mismatch', { n: r.extraCount })
    else if (r.extraKey === 'result.hinted') text = t('result.hinted', { n: r.extraCount })
    else if (r.extra) text = r.extra // legacy paused session
    return text ? th('result.scoreExtra', { text }) : ''
  }

  function renderResult(g) {
    const r = session.lastResult
    if (!r) return '<div class="stage"></div>'
    const listOf = (ids) => ids.map((id) => {
      const item = source(session.kind).get(id)
      const m = FI.itemMeaning(item, session.kind)
      return `<div class="wrong-item"><b>${esc(FI.itemLabel(item, session.kind))}</b><span>${meaningInline(m.zh, m.en)}</span><small>${th(r.wrongIds.includes(id) ? 'result.wrongTag' : 'result.hintTag')}</small></div>`
    }).join('')
    const reviewIds = r.retryIds
    const retryLabel = r.mode === 'dictation'
      ? th('result.retry.dictation', { n: reviewIds.length })
      : th('result.retry.other', { n: reviewIds.length })
    return `<div class="stage">
      <div class="stage-head"><h3>${th('result.title', { mode: modeLabel(r.mode) })}</h3><span class="pill ${r.perfect ? 'teal' : 'amber'}">${r.perfect ? th('result.perfect') : th('result.needWork', { n: reviewIds.length })}</span></div>
      <div class="score">
        <div class="score-ring" style="--pct:${r.percent}%"><i>${r.percent}%</i></div>
        <div class="score-txt"><h4>${th('result.score', { correct: r.correct, total: r.total })}${resultExtraText(r)}</h4><p>${th(r.perfect ? 'result.perfectTip' : 'result.imperfectTip')}${th('result.mistakeNote')}</p></div>
      </div>
      ${reviewIds.length ? `<p class="tip">${th('result.reviewTitle')}</p><div class="wrong-list">${listOf(reviewIds)}</div>` : ''}
      <div class="actions">
        <button class="btn primary" data-act="result-continue">${th('result.continue', { mode: nextModeLabel() })}</button>
        ${r.perfect ? '' : `<button class="btn" data-act="result-retry">${retryLabel}</button>`}
        <button class="btn ghost" data-act="pause">${th('common.pause')}</button>
      </div>
      ${session.retryCount >= 3 ? `<p class="tip" style="margin-top:12px">${th('result.afterThree')}</p>` : ''}
    </div>`
  }

  function renderComplete(g) {
    const next = FI.nextGroupId(groupIndex, g.id)
    const results = session.results ?? {}
    const grid = Object.entries(results).map(([mode, r]) =>
      `<div><span>${esc(modeShort(mode))}</span><b>${r.percent}%</b></div>`
    ).join('')
    return `<div class="stage">
      <div class="stage-head"><h3>${th('complete.title')}</h3><span class="pill teal">${th('complete.pill')}</span></div>
      <div class="complete-grid">${grid || `<div><span>${th('complete.grid.group')}</span><b>${th('complete.grid.done')}</b></div>`}<div><span>${th('complete.grid.retries')}</span><b>${session.retryCount}</b></div></div>
      <p class="tip">${th('complete.tip', { id: g.id, title: groupTitle(g) })}</p>
      <div class="actions">
        ${next ? `<button class="btn primary" data-act="complete-next" data-id="${esc(next)}">${th('complete.next', { id: next })}</button>` : `<button class="btn primary" data-act="complete-pause">${th('complete.last')}</button>`}
        <button class="btn ghost" data-act="complete-pause">${th('common.pause')}</button>
      </div>
    </div>`
  }

  function renderLearn() {
    const g = groupById.get(session.groupId)
    if (!g) { goHome(t('toast.groupInvalid')); return }
    const p = session.phase
    let stage
    if (p === 'memorize') stage = renderMemorize(g)
    else if (p === 'result') stage = renderResult(g)
    else if (p === 'complete') stage = renderComplete(g)
    else if (p === 'choice') stage = renderChoice(g)
    else if (p === 'listen' || p === 'findImage') stage = renderSelectWithImages(g, p)
    else if (p === 'match') stage = renderMatch(g)
    else if (LETTER_MODES.includes(p)) stage = renderLetters(g, p)
    else stage = renderComplete(g)
    const brandSub = th('learn.brandSub', { level: g.level, kind: groupKindName(g.kind), mode: modeLabel(p) })
    app.innerHTML = `<div class="wrap"><div class="topbar"><div class="brand"><div class="brand-mark">FL</div><div><h1>Finnish Learn</h1><p>${brandSub}</p></div></div></div>${renderHead(g)}${stage}</div>`
    if (LETTER_MODES.includes(p) && !session.round.feedback) focusNextEmpty(-1)
    autoSpeak()
  }

  function render() { ui.view === 'home' ? renderHome() : renderLearn() }

  /* ── import / export / modal ──────────────────────────────── */
  async function doExport() {
    const { text } = await FI.Store.buildExport(state)
    state.lastExportedAt = new Date().toISOString()
    FI.Store.save(state)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fi-progress-${ui.level}-${today().replace(/-/g, '')}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(t('toast.exported'))
    render()
  }
  function showModal(html) {
    modalRoot.innerHTML = `<div class="modal-mask"><div class="modal">${html}</div></div>`
    ui.modal = true
  }
  function closeModal() {
    FI.Bgm?.endPreview?.()
    modalRoot.innerHTML = ''
    ui.modal = false
    pendingImport = null
  }
  /** Only the preview buttons are repainted: a full modal re-render would
      discard unsaved radio choices the learner already made. */
  function refreshBgmPreviewUI() {
    const active = FI.Bgm?.previewTrack?.() ?? null
    modalRoot.querySelectorAll('[data-modal^="bgm-preview:"]').forEach((btn) => {
      const on = active === btn.dataset.modal.slice('bgm-preview:'.length)
      btn.textContent = t(on ? 'settings.bgm.stopPreview' : 'settings.bgm.preview')
      btn.classList.toggle('on', on)
    })
  }
  function showSettings() {
    const p = pref()
    const enabled = p.enabledModes
    const rows = FI.PRACTICE_MODES.map((m) => {
      const meta = FI.MODE_META[m]
      const scope = t(meta.word && meta.sentence ? 'settings.scope.both' : 'settings.scope.wordOnly')
      return `<label class="mode-row">
        <input type="checkbox" data-mode="${m}" ${enabled.includes(m) ? 'checked' : ''}>
        <span><b>${esc(modeLabel(m))}</b><small>${esc(modeDesc(m))}</small></span>
        <em class="tip">${scope}</em>
      </label>`
    }).join('')
    const segment = (name, list, labels, current) => `<div class="seg">${list.map((v) => `
      <label class="${v === current ? 'active' : ''}"><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}><span>${esc(labels[v])}</span></label>`).join('')}</div>`
    const labelsFor = (prefix, list) => Object.fromEntries(list.map((v) => [v, t(`${prefix}.${v}`)]))
    const itemCount = pack.words.length + pack.sentences.length
    const clipCount = [...pack.words, ...pack.sentences].filter((x) => x.audio?.path).length
    const voiceStatus = clipCount > 0
      ? th('settings.audio.clips', { n: clipCount, total: itemCount })
      : (finnishVoice() ? th('settings.audio.voiceOk') : th('settings.audio.voiceMissing'))
    showModal(`<h3>${th('settings.title')}</h3>
      <p>${th('settings.intro')}</p>

      <div class="pref-group">
        <div class="pref-title">${th('settings.ui.title')}</div>
        ${segment('uiLang', FI.UI_LANGS, FI.UI_LANG_LABEL, p.uiLang)}
        <p class="tip">${th('settings.ui.tip')}</p>
      </div>

      <div class="pref-group">
        <div class="pref-title">${th('settings.meaning.title')}</div>
        ${segment('meaningLang', FI.MEANING_LANGS, labelsFor('meaningLang', FI.MEANING_LANGS), p.meaningLang)}
        <p class="tip">${th('settings.meaning.tip')}</p>
      </div>

      <div class="pref-group">
        <div class="pref-title">${th('settings.theme.title')}</div>
        ${segment('theme', FI.THEMES, labelsFor('theme', FI.THEMES), p.theme)}
      </div>

      <div class="pref-group">
        <div class="pref-title">${th('settings.bgm.title')}</div>
        <label class="switch-row">
          <input type="checkbox" data-bgm ${p.bgm ? 'checked' : ''}>
          <span><b>${th('settings.bgm.label')}</b><small>${th('settings.bgm.desc')}</small></span>
        </label>
        <p class="tip" style="margin:8px 0 6px">${th('settings.bgm.trackTip')}</p>
        <div class="bgm-tracks">${FI.BGM_TRACKS.map((track) => `
          <div class="bgm-track ${p.bgmTrack === track.id ? 'active' : ''}" data-track="${esc(track.id)}">
            <label class="bgm-track-main">
              <input type="radio" name="bgmTrack" value="${esc(track.id)}" ${p.bgmTrack === track.id ? 'checked' : ''}>
              <span><b>${esc(bgmName(track.id))}</b><small>${esc(bgmDesc(track.id))}</small></span>
            </label>
            <button type="button" class="btn sm" data-modal="bgm-preview:${esc(track.id)}">${th('settings.bgm.preview')}</button>
          </div>`).join('')}</div>
      </div>

      <div class="pref-group">
        <div class="pref-title">${th('settings.audio.title')}</div>
        <p class="tip" style="margin:0 0 6px">${th('settings.audio.tip')}</p>
        <p class="tip" style="margin:0 0 6px">${th('settings.audio.autoplay')}</p>
        <p class="tip" style="margin:0">${voiceStatus}</p>
      </div>

      <div class="pref-title">${th('settings.flow.title')}</div>
      <p class="tip" style="margin:0 0 8px">${th('settings.flow.tip')}</p>
      <div class="mode-list">${rows}</div>
      <p class="tip" style="margin:10px 0">${th('settings.flow.note')}</p>
      <div class="actions">
        <button class="btn primary" data-modal="settings-save">${th('settings.save')}</button>
        <button class="btn sm" data-modal="preset-full">${th('settings.presetFull')}</button>
        <button class="btn sm" data-modal="preset-slim">${th('settings.presetSlim')}</button>
        <button class="btn ghost" data-modal="cancel">${th('common.cancel')}</button>
      </div>`)
  }
  async function handleImportFile(file) {
    const text = await file.text()
    const parsed = FI.Store.parseImport(text)
    if (!parsed.ok) { toast(parsed.errorKey ? t(parsed.errorKey, parsed.errorParams) : parsed.error); return }
    const valid = await FI.Store.verifyChecksum(parsed.file)
    if (!valid) { toast(t('toast.checksum')); return }
    pendingImport = parsed.file
    const d = FI.Store.diff(state, parsed.file)
    showModal(`<h3>${th('import.title')}</h3>
      <p>${th('import.source', { file: file.name, date: String(parsed.file.exportedAt).slice(0, 16).replace('T', ' ') })}</p>
      <div class="diff">
        ${th('import.diff', {
          newGroups: d.newGroups, upgraded: d.upgraded, conflicts: d.conflicts,
          newEvents: d.newEvents, mistakeItems: d.mistakeItems, incomingGroups: d.incomingGroups,
          mismatch: th(d.contentMismatch ? 'import.mismatch' : 'import.match'),
        })}
      </div>
      <p>${th('import.explain')}</p>
      <div class="actions">
        <button class="btn primary" data-modal="merge">${th('import.merge')}</button>
        <button class="btn danger" data-modal="overwrite">${th('import.overwrite')}</button>
        <button class="btn ghost" data-modal="cancel">${th('common.cancel')}</button>
      </div>`)
  }
  function confirmClear() {
    showModal(`<h3>${th('clear.title')}</h3><p>${th('clear.desc')}</p>
      <div class="actions"><button class="btn danger" data-modal="clear-yes">${th('clear.confirm')}</button><button class="btn ghost" data-modal="cancel">${th('common.cancel')}</button></div>`)
  }

  /* ── delegated events ─────────────────────────────────────── */
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]')
    if (!el || el.disabled) return
    const act = el.dataset.act
    switch (act) {
      case 'level': ui.level = el.dataset.level; persist(); render(); break
      case 'start-group': startGroup(el.dataset.id); break
      case 'settings': showSettings(); break
      case 'resume': {
        if (!state.session) break
        const g = groupById.get(state.session.groupId)
        if (!g || !Array.isArray(state.session.pipeline)) { state.session = null; persist(); render(); toast(t('toast.oldSession')); break }
        session = state.session
        session._spoken = null // replay the auto-read once on resume
        state.paused = false
        ui.view = 'learn'; ui.transition = false
        persist(); render()
        break
      }
      case 'discard': state.session = null; state.paused = false; persist(); render(); toast(t('toast.discarded')); break
      case 'pause': goHome(t('toast.paused')); break
      case 'mem-prev': {
        const r = session?.round
        if (r && r.index > 0) { r.index--; persist(); render() }
        break
      }
      case 'mem-next': memNext(); break
      case 'pick': pick(Number(el.dataset.idx)); break
      case 'match-left': matchPick('left', el.dataset.id); break
      case 'match-right': matchPick('right', el.dataset.id); break
      case 'hint': useHint(); break
      case 'submit': submitAnswer(); break
      case 'next': nextQuestion(); break
      case 'slot-letter': insertLetter(el.dataset.letter); break
      case 'result-continue': advance(); break
      case 'result-retry': retryRound(); break
      case 'complete-next': startGroup(el.dataset.id); break
      case 'complete-pause': goHome(t('toast.completePause')); break
      case 'speak': {
        const speed = el.dataset.speed === 'slow' ? 'slow' : 'normal'
        if (session?.round && ['listen', 'dictation'].includes(session.phase)) {
          session.round.speed = speed
          persist()
        }
        speak(el.dataset.text, speed, el.dataset.audio)
        break
      }
      case 'ui-toggle': {
        pref().uiLang = uiLang() === 'zh' ? 'en' : 'zh'
        applyUiLang(); persist(); render()
        toast(t('toast.uiLang', { name: uiName() }))
        break
      }
      case 'theme-toggle': {
        const i = FI.THEMES.indexOf(pref().theme)
        pref().theme = FI.THEMES[(i + 1) % FI.THEMES.length]
        applyTheme(); persist(); render()
        toast(t('toast.theme', { name: themeName(pref().theme) }))
        break
      }
      case 'bgm-toggle': {
        pref().bgm = !pref().bgm
        applyBgm(); persist(); render()
        toast(t(pref().bgm ? 'toast.bgmOn' : 'toast.bgmOff'))
        break
      }
      case 'export': doExport(); break
      case 'import': document.getElementById('import-file')?.click(); break
      case 'clear': confirmClear(); break
    }
  })
  app.addEventListener('error', (e) => {
    const img = e.target
    if (img?.tagName !== 'IMG' || img.dataset.motif === undefined) return
    const holder = document.createElement('div')
    holder.className = img.className
    holder.setAttribute('role', 'img')
    holder.setAttribute('aria-label', img.alt)
    holder.innerHTML = FI.motifSVG(img.dataset.motif, img.dataset.seed || img.alt)
    img.replaceWith(holder)
  }, true)
  app.addEventListener('focusin', (e) => {
    if (e.target?.dataset?.slot !== undefined) lastSlot = Number(e.target.dataset.slot)
  })
  app.addEventListener('input', (e) => {
    const el = e.target.closest?.('[data-slot]')
    if (!el || !session || !LETTER_MODES.includes(session.phase)) return
    const r = session.round
    if (r.feedback) return
    const i = Number(el.dataset.slot)
    const ch = FI.lettersOf(el.value).slice(-1)[0] ?? ''
    r.slots[i] = ch
    el.value = ch
    if (ch) focusNextEmpty(i)
    persist()
  })
  app.addEventListener('paste', (e) => {
    const el = e.target.closest?.('[data-slot]')
    if (!el || !session || !LETTER_MODES.includes(session.phase)) return
    const chars = FI.lettersOf(e.clipboardData?.getData('text') ?? '')
    if (chars.length <= 1) return
    e.preventDefault()
    const r = session.round
    if (r.feedback) return
    const q = r.questions[r.index]
    let pos = Number(el.dataset.slot)
    for (const ch of chars) {
      while (pos < q.letters.length && (q.reveal[pos] || r.hintRevealed.includes(pos))) pos++
      if (pos >= q.letters.length) break
      r.slots[pos] = ch
      pos++
    }
    persist(); render(); focusNextEmpty(-1)
  })
  app.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files?.[0]) {
      handleImportFile(e.target.files[0]).catch(() => toast(t('toast.fileRead')))
      e.target.value = ''
    }
  })
  modalRoot.addEventListener('click', (e) => {
    const el = e.target.closest('[data-modal]')
    if (!el) return
    const act = el.dataset.modal
    if (act === 'cancel') { closeModal(); return }
    if (act === 'clear-yes') {
      state = FI.Store.reset(); session = null; ui.view = 'home'
      FI.Store.save(state); applyPrefs(); closeModal(); render(); toast(t('toast.cleared')); return
    }
    if (act === 'settings-save') {
      const picked = [...modalRoot.querySelectorAll('[data-mode]')].filter((x) => x.checked).map((x) => x.dataset.mode)
      const meaningLang = modalRoot.querySelector('input[name="meaningLang"]:checked')?.value ?? 'both'
      const uiLangValue = modalRoot.querySelector('input[name="uiLang"]:checked')?.value ?? 'zh'
      const theme = modalRoot.querySelector('input[name="theme"]:checked')?.value ?? 'system'
      const bgm = modalRoot.querySelector('[data-bgm]')?.checked === true
      const bgmTrack = modalRoot.querySelector('input[name="bgmTrack"]:checked')?.value ?? FI.DEFAULT_BGM_TRACK
      state.preferences = FI.sanitizePrefs({
        ...state.preferences, enabledModes: picked, meaningLang, uiLang: uiLangValue, theme, bgm, bgmTrack,
      })
      applyPrefs(); persist(); closeModal(); render(); toast(t('toast.settingsSaved')); return
    }
    if (act === 'preset-full' || act === 'preset-slim') {
      state.preferences.enabledModes = (act === 'preset-full' ? FI.DEFAULT_MODES : FI.SLIM_MODES).slice()
      persist(); closeModal(); render(); toast(t(act === 'preset-full' ? 'toast.presetFull' : 'toast.presetSlim')); return
    }
    if (act.startsWith('bgm-preview:')) {
      FI.Bgm?.preview(act.slice('bgm-preview:'.length), refreshBgmPreviewUI)
      refreshBgmPreviewUI()
      return
    }
    if (!pendingImport) { closeModal(); return }
    if (act === 'merge') state = FI.Store.merge(state, pendingImport)
    else state = FI.Store.overwrite(state, pendingImport)
    state.preferences = FI.sanitizePrefs(state.preferences)
    applyPrefs(); persist(); closeModal(); render()
    toast(t(act === 'merge' ? 'toast.merged' : 'toast.overwritten'))
  })
  document.addEventListener('keydown', (e) => {
    if (ui.modal) { if (e.key === 'Escape') closeModal(); return }
    if (ui.view !== 'learn' || !session) return
    if (e.key === 'Escape') { goHome(t('toast.paused')); return }
    if (SELECT_MODES.includes(session.phase) && /^[1-9]$/.test(e.key)) { pick(Number(e.key) - 1); return }
    if (session.phase === 'memorize' && e.key === 'ArrowRight') { memNext(); return }
    if (e.target?.dataset?.slot !== undefined && e.key === 'Backspace' && !e.target.value) {
      const i = Number(e.target.dataset.slot)
      const q = session.round?.questions?.[session.round.index]
      for (let j = i - 1; j >= 0; j--) {
        if (q && !q.reveal[j] && !session.round.hintRevealed.includes(j)) { focusSlot(j); break }
      }
      return
    }
    if (LETTER_MODES.includes(session.phase) && e.key === 'Enter') {
      e.preventDefault()
      session.round.feedback ? nextQuestion() : submitAnswer()
      return
    }
    if (session.phase === 'result' && e.key === 'Enter') { advance(); return }
  })

  applyPrefs()
  render()
})()
