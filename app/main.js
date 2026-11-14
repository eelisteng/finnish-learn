/* Learning flow controller.
   Configurable pipeline: 背词 → 选词 → 听选 → 找图片 → 匹配 → 填空 → 听写 → 完成.
   Every practice round ends with a result screen offering "继续下一个流程"
   or "重来 · 只练错词" (dictation also re-practises hint-assisted words).
   Display preferences (meaning language / theme / ambience) are local-only
   and part of the portable progress file. */
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
    if (pref().bgm) FI.Bgm.start()
    else FI.Bgm.stop()
  }
  function applyPrefs() { applyTheme(); applyBgm() }
  window.matchMedia?.('(prefers-color-scheme: dark)')
    ?.addEventListener?.('change', () => { if (pref().theme === 'system') applyTheme() })

  /** zh / en lines, filtered by the "只显示中文 / 只显示英文 / 都显示" setting. */
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
  const meaningName = () => FI.MEANING_LABEL[pref().meaningLang] ?? '中英文都显示'

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
  function picture(image, seed, cls, alt) {
    const label = esc(alt ?? image?.altZh ?? '示意图')
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
    return '<p class="hintline">⚠ 本机未检测到 fi-FI 语音，当前是系统合成音回退，长短音与 ä/ö/å 可能不准；可在设置里查看</p>'
  }
  function ttsSpeak(text, slow) {
    if (!window.speechSynthesis) { toast('当前浏览器不支持语音合成'); return }
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
  function autoSpeak() {
    if (FAST || !session || !['listen', 'dictation'].includes(session.phase)) return
    const r = session.round
    const q = r?.questions?.[r.index]
    if (!q?.audioText || r.feedback) return
    const key = `${session.phase}:${r.mode}:${r.attempt}:${r.index}`
    if (session._spoken === key) return
    session._spoken = key
    speak(q.audioText, r.speed ?? 'normal', q.audioFile)
  }

  /* ── session lifecycle ────────────────────────────────────── */
  function initSlots(q) {
    return q.letters.map((ch, i) => (q.reveal[i] ? ch : ''))
  }
  function makeRound(mode, scope, isRetry) {
    const g = groupById.get(session.groupId)
    const seed = FI.hash(session.groupId) + session.attempt * 101 + session.pipelineIndex * 31 + (isRetry ? 7 : 0)
    const r = {
      mode,
      scopeIds: scope.slice(),
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
      r.questions = FI.buildChoiceQuestions(g, pack, { scopeIds: scope, seed, optionCount: 4 })
    } else if (mode === 'listen' || mode === 'findImage') {
      r.questions = FI.buildSelectQuestions(g, pack, {
        scopeIds: scope,
        seed,
        optionCount: 4,
        textOnly: mode === 'findImage',
        hideLabel: mode === 'listen',
        meaningLang: pref().meaningLang,
      })
    } else if (mode === 'match') {
      r.pairs = FI.buildMatchPairs(g, pack, scope, seed, pref().meaningLang)
    } else if (LETTER_MODES.includes(mode)) {
      r.questions = FI.buildLetterQuestions(g, pack, scope, mode, pref().meaningLang)
      r.slots = initSlots(r.questions[0])
    }
    return r
  }

  function startGroup(groupId, opts = {}) {
    const g = groupById.get(groupId)
    if (!g) { toast('分组不存在'); return }
    stopTimers()
    ui.transition = false
    session = {
      groupId,
      level: g.level,
      kind: g.kind,
      itemIds: g.itemIds.slice(),
      pipeline: FI.buildPipeline(g.kind, state.preferences.enabledModes),
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
    return FI.modeLabel(session.pipeline[session.pipelineIndex + 1] ?? 'complete')
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
    let total, correct, wrongIds, hintIds, percent, extra = ''
    if (r.mode === 'match') {
      total = r.scopeIds.length
      correct = r.answers.length
      wrongIds = [...new Set(r.mismatches)]
      hintIds = []
      const attempts = correct + r.mismatches.length
      percent = attempts ? Math.round((correct / attempts) * 100) : 100
      extra = `错配 ${r.mismatches.length} 次`
    } else {
      total = r.answers.length
      correct = r.answers.filter((a) => a.correct).length
      wrongIds = [...new Set(r.answers.filter((a) => !a.correct).map((a) => a.itemId))]
      hintIds = [...new Set(r.answers.filter((a) => a.hintUsed).map((a) => a.itemId))]
      percent = total ? Math.round((correct / total) * 100) : 0
      if (r.mode === 'dictation') extra = `用过提示 ${hintIds.length} 个词`
    }
    const retryIds = r.mode === 'dictation'
      ? [...new Set([...wrongIds, ...hintIds])]
      : (r.mode === 'match' ? wrongIds : wrongIds)
    const result = {
      mode: r.mode,
      label: FI.modeLabel(r.mode),
      total, correct, wrongIds, hintIds, retryIds, percent, extra,
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
    toast(`只练 ${ids.length} 个词 · ${FI.modeLabel(mode)}`)
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
    if (outstanding) { toast('还有字母没填，或点「提示」露出一个字母'); return }
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
    const scope = session.scopeIds
    const r = session.round
    if (r.index < scope.length - 1) {
      r.index++
      persist()
      render()
    } else {
      ui.transition = true
      render()
      toast(`背词完成，自动进入${nextModeLabel()}…`)
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
    const wordPipeline = FI.buildPipeline('word', state.preferences.enabledModes).map(FI.modeShort).join(' → ')
    const sentencePipeline = FI.buildPipeline('sentence', state.preferences.enabledModes).map(FI.modeShort).join(' → ')

    const resume = state.session ? (() => {
      const s = state.session
      const g = groupById.get(s.groupId)
      if (!g || !Array.isArray(s.pipeline)) return ''
      const phase = FI.PHASE_LABEL[s.phase] ?? s.phase
      const total = s.round?.questions?.length || s.round?.pairs?.left.length || s.scopeIds.length
      const pos = s.phase === 'result' ? total : Math.min((s.round?.index ?? 0) + 1, total)
      return `<div class="resume">
        <p>🕘 ${state.paused ? '已暂停' : '上次学习中断'}：<strong>${esc(g.id)} · ${esc(g.title)}</strong>　${esc(phase)} ${pos}/${total}</p>
        <button class="btn primary sm" data-act="resume">继续学习</button>
        <button class="btn ghost sm" data-act="discard">放弃本组</button>
      </div>`
    })() : ''

    const levelTabs = FI.CEFR.map((l) => {
      const info = groupIndex.levels.find((x) => x.level === l)
      return `<button class="leveltab ${l === ui.level ? 'active' : ''}" data-act="level" data-level="${l}">${l}<span style="opacity:.7;font-size:11px"> · ${info.wordGroups}组</span></button>`
    }).join('')

    const card = (g) => {
      const p = state.groups[g.id] ?? {}
      const status = p.status ?? 'not-started'
      const label = status === 'completed' ? '已完成' : status === 'in-progress' ? '进行中' : '未开始'
      const items = g.itemIds.map((id) => {
        const item = source(g.kind).get(id)
        return `<span class="chip fi">${esc(FI.itemLabel(item, g.kind))}</span>`
      }).join('')
      return `<div class="gcard ${status === 'completed' ? 'done' : ''}">
        <div class="gcard-head"><span class="gid">${esc(g.id)}</span><span class="status ${status === 'completed' ? 'done' : status === 'in-progress' ? 'active' : ''}">${label}</span></div>
        <h4>${esc(g.title)}</h4>
        <div class="chips">${items}</div>
        <div class="gcard-foot">
          <small>${g.size} 条${p.bestScore ? ` · 最好 ${p.bestScore}%` : ''}${p.attempts ? ` · 练 ${p.attempts} 次` : ''}</small>
          <button class="btn sm primary" data-act="start-group" data-id="${esc(g.id)}">${status === 'completed' ? '重学' : status === 'in-progress' ? '继续' : '开始'}</button>
        </div>
      </div>`
    }

    app.innerHTML = `<div class="wrap">
      <div class="topbar">
        <div class="brand"><div class="brand-mark">FL</div><div><h1>Finnish Learn</h1><p>一词一图，一格一义 · 免登录 · 进度可导入导出</p></div></div>
        <button class="btn sm icon" data-act="theme-toggle" title="切换浅色 / 深色 / 跟随系统">${document.documentElement.dataset.theme === 'dark' ? '🌙 深色' : '☀️ 浅色'}</button>
        <button class="btn sm icon ${pref().bgm ? 'on' : ''}" data-act="bgm-toggle" title="开启 / 关闭背景音乐">音乐 ${pref().bgm ? '开' : '关'}</button>
        <button class="btn sm" data-act="settings">设置</button>
        <button class="btn sm" data-act="export">导出进度</button>
        <button class="btn sm" data-act="import">导入进度</button>
      </div>

      <div class="hero">
        <h2>按 CEFR 分级，每 5 条成一组</h2>
        <p>单词组：${esc(wordPipeline)}；句子组：${esc(sentencePipeline)}。学完一组可接着下一组，也可随时暂停，进度自动留在本机。</p>
        <div class="stats">
          <div class="stat"><span>已完成分组</span><b>${completed}<small> / ${groupIndex.groups.length}</small></b></div>
          <div class="stat"><span>学习条目总数</span><b>${pack.words.length + pack.sentences.length}<small> 词 / 句</small></b></div>
          <div class="stat"><span>今日记录</span><b>${todayEvents}<small> 条</small></b></div>
          <div class="stat"><span>错词本</span><b>${mistakes}<small> 条</small></b></div>
        </div>
      </div>

      ${state.contentMismatch ? `<div class="resume"><p>⚠️ 进度文件的内容版本与当前词包不一致（${esc(state.contentVersion)} → ${esc(pack.version)}）。已保留记录，但请核对分组。</p></div>` : ''}
      ${resume}

      <div class="leveltabs">${levelTabs}</div>
      <p class="levelhint">${esc(ui.level)}：${levelInfo.wordCount} 词 / ${levelInfo.sentenceCount} 句 · 单词 ${levelInfo.wordGroups} 组 / 句子 ${levelInfo.sentenceGroups} 组。每组严格 ${FI.GROUP_SIZE} 条，位于同一级别内。</p>

      <div class="section-head"><h3>单词分组</h3><span>背词显示音标、词性、单复数与${esc(meaningName())}；之后依次进入所选练习模式</span></div>
      <div class="group-grid">${wordGroups.map(card).join('')}</div>

      <div class="section-head"><h3>句子分组</h3><span>场景句 + 逐词对齐 + 格标记，自动跳过仅适用于单词的模式</span></div>
      ${sentenceGroups.length
        ? `<div class="group-grid">${sentenceGroups.map(card).join('')}</div>`
        : `<div class="empty">${esc(ui.level)} 的句子内容准备中（分组引擎已就绪，补齐 ${FI.GROUP_SIZE} 句即自动成组）。此级别单词分组可正常学习。</div>`}

      <div class="tools">
        <button class="btn sm" data-act="settings">设置（流程 / 释义 / 外观 / 音乐）</button>
        <button class="btn sm" data-act="export">导出进度 JSON</button>
        <button class="btn sm" data-act="import">导入并合并</button>
        <button class="btn sm danger" data-act="clear">清除本机数据</button>
      </div>
      <p class="footnote">
        当前显示：释义「${esc(meaningName())}」 · 主题「${esc(FI.THEME_LABEL[pref().theme])}」 · 背景音乐「${pref().bgm ? '开启' : '关闭'}」。<br>
        上次导出：${state.lastExportedAt ? esc(state.lastExportedAt.slice(0, 16).replace('T', ' ')) : '从未导出'} · 建议每 7 天导出一次，文件是跨设备迁移的唯一凭证。<br>
        示例词包的词形、IPA 与中文释义均为 <b>auto-derived 样例</b>，上线前须人工校对；3 张 AI 插画为样例，其余为几何占位图。发音使用浏览器芬兰语合成音（V1 兜底），听写可用虚拟字母条输入 ä / ö / å。
      </p>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
    </div>`
  }

  /* ── learning view ────────────────────────────────────────── */
  function renderHead(g) {
    const steps = session.pipeline.map((m, i) =>
      `<div class="step ${i === session.pipelineIndex ? 'on' : i < session.pipelineIndex ? 'past' : ''}">${i + 1}. ${esc(FI.modeShort(m))}</div>`
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
        <button class="btn sm ghost" data-act="pause">← 暂停</button>
        <h2>${esc(g.id)} · ${esc(g.title)}${session.attempt > 1 ? `　<span class="pill amber">只练错词 · 第 ${session.attempt} 轮</span>` : ''}</h2>
        <span class="counter">${esc(g.level)} · ${g.kind === 'word' ? '单词' : '句子'} · ${pos}/${total}</span>
      </div>
      <div class="steps">${steps}</div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
    </div>`
  }

  function memorizeWord(item) {
    const s = item.senses[0]
    const isVerb = item.pos === 'verb'
    const numberBlock = isVerb
      ? `<dt>单复数</dt><dd>不适用 · 动词按人称变位</dd>`
      : `<dt>单数</dt><dd class="fi">${esc(item.number.singular)}</dd><dt>复数</dt><dd class="fi">${esc(item.number.plural)}</dd>`
    const verbBadge = isVerb ? `<span class="badge amber">动词类型 ${item.verb.verbType}${item.verb.irregular ? ' · 不规则' : ''}</span>` : ''
    const more = isVerb
      ? `<details class="more"><summary>展开：动词类型 ${item.verb.verbType} 与变位</summary>
          <div class="vrow">
            <div><span>不定式词尾</span><b>${esc(item.verb.infinitiveEnding)}</b></div>
            <div><span>现在时词干</span><b>${esc(item.verb.presentStem)}</b></div>
            <div><span>1sg 现在</span><b>${esc(item.verb.present1sg)}</b></div>
            <div><span>3sg 过去</span><b>${esc(item.verb.past3sg)}</b></div>
            <div><span>NUT 分词</span><b>${esc(item.verb.nutParticiple)}</b></div>
          </div>
          <p style="color:var(--muted);margin:10px 0 0">Kotus 变位类 ${item.verb.kotusType ?? '—'} · 动词不显示格表。${esc(item.verb.note ?? '')}</p>
        </details>`
      : `<details class="more"><summary>展开：词干与 A1 六个基本格</summary>
          <div class="vrow">
            <div><span>强词干</span><b>${esc(item.nominal.stems.strong)}</b></div>
            <div><span>弱词干</span><b>${esc(item.nominal.stems.weak)}</b></div>
            <div><span>元音和谐</span><b>${esc(item.nominal.harmony)}</b></div>
            <div><span>变格类</span><b>Kotus ${item.nominal.kotusType ?? '—'}</b></div>
          </div>
          <table class="cases"><tr><th>格</th><th>形式</th><th>后缀</th><th>词干</th></tr>
          ${item.nominal.caseForms.map((f) => `<tr><td>${esc(f.label ?? f.case)}</td><td class="f">${esc(f.form)}</td><td class="f">${esc(f.suffix)}</td><td>${f.stemUsed === 'strong' ? '强' : '弱'}</td></tr>`).join('')}
          </table>
        </details>`
    return `<div class="mem">
      ${picture(s.image, item.id, 'mem-pic', s.image.altZh)}
      <div>
        <p class="lemma">${esc(item.lemma)}</p>
        <p class="ipa">${esc(item.ipa)} <button class="btn sm ghost" data-act="speak" data-text="${esc(item.lemma)}" data-audio="${esc(item.audio?.path ?? '')}" title="朗读">🔊 发音</button></p>
        <div class="badges"><span class="badge blue">${esc(item.cefr)}</span><span class="badge">${esc(item.posZh)}</span>${verbBadge}<span class="badge teal">auto-derived</span></div>
        <dl class="kv">${numberBlock}<dt>形态类</dt><dd>${isVerb ? `Kotus ${item.verb.kotusType ?? '—'}` : esc(item.nominal.declensionClass)}</dd></dl>
        <div class="gloss-box">${meaningLines(s.zh, s.en)}</div>
        ${more}
      </div>
    </div>`
  }

  function memorizeSentence(item) {
    const caseNames = { nom: '主格', gen: '属格', par: '部分格', ine: '内格', ela: '出格', ill: '入格', ade: '接格', abl: '离格', all: '向格', ess: '样格', tra: '转格', acc: '宾格', ins: '具格', abe: '欠格', com: '共格' }
    return `<div class="cloze-q" style="text-align:left">
        <div class="fi" style="font-size:26px">${esc(item.fiText)} <button class="btn sm ghost" data-act="speak" data-text="${esc(item.fiText)}" data-audio="${esc(item.audio?.path ?? '')}">🔊</button></div>
        ${meaningLines(item.zhText, item.enText)}
      </div>
      <div class="badges"><span class="badge blue">${esc(item.cefr)}</span>${item.grammarPoints.map((c) => `<span class="badge amber">${esc(caseNames[c] ?? c)}</span>`).join('')}</div>
      <p class="tip" style="margin:12px 0 6px">逐词对齐 gloss</p>
      <div class="chips">${item.gloss.map((g) => `<span class="chip fi">${esc(g.token)}${g.caseForm ? ` · ${esc(g.caseForm)}` : ''}</span>`).join('')}</div>`
  }

  function renderMemorize(g) {
    const index = session.round?.index ?? 0
    const item = source(session.kind).get(session.scopeIds[index])
    const body = ui.transition
      ? `<div style="text-align:center;padding:36px 0"><div class="pill teal">背词完成</div><h3 style="margin:14px 0 4px">正在自动进入${esc(nextModeLabel())}…</h3><p class="tip">本组 ${session.scopeIds.length} 条已全部背完</p></div>`
      : session.kind === 'word' ? memorizeWord(item) : memorizeSentence(item)
    return `<div class="stage">
      <div class="stage-head"><h3>① 背词模式</h3><span class="pill">${index + 1} / ${session.scopeIds.length}</span><span class="pill teal">音标 · 词性 · 单复数 · ${esc(meaningName())}</span></div>
      ${body}
      <div class="stage-foot">
        <button class="btn sm" data-act="mem-prev" ${index === 0 || ui.transition ? 'disabled' : ''}>← 上一个</button>
        <span class="spacer"></span><span class="tip">→ 键下一张</span>
        <button class="btn primary" data-act="mem-next" ${ui.transition ? 'disabled' : ''}>${index < session.scopeIds.length - 1 ? '下一个 →' : `完成背词 → 自动进入${esc(FI.modeShort(session.pipeline[1] ?? '完成'))}`}</button>
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
    const feedback = fb
      ? `<div class="feedback ${fb.correct ? 'ok' : 'no'}" role="status" aria-live="polite">${fb.correct ? '✓ 选对了，背景变绿' : `✗ 选错了，背景变红 · 正确答案：${esc(q.label)}`}</div>`
      : ''
    return `<div class="stage ${fb ? (fb.correct ? 'correct-flash' : 'wrong-flash') : ''}">
      <div class="stage-head"><h3>选词模式</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">看图与释义 · 4 选 1</span></div>
      <div class="quiz-prompt">
        ${picture(q.image, q.itemId, 'quiz-pic', q.image.altZh)}
        ${meaningLines(q.promptZh, q.promptEn)}
        <p class="hintline">从 4 个${session.kind === 'word' ? '单词' : '句子'}中选出正确的一项 · 按 1–4 键</p>
      </div>
      <div class="opts">${opts}</div>
      ${feedback}
      <div class="stage-foot"><span class="tip">选对 → 绿色；选错 → 红色并高亮正确答案</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">暂停</button></div>
    </div>`
  }

  function renderSelectWithImages(g, mode) {
    const r = session.round
    const q = r.questions[r.index]
    const fb = r.feedback
    const isListen = mode === 'listen'
    const cards = q.options.map((o, i) => {
      let cls = 'optcard'
      if (fb) {
        if (i === fb.idx) cls += fb.correct ? ' correct' : ' wrong'
        else if (!fb.correct && i === fb.correctIdx) cls += ' reveal'
      }
      // Listen: picture + meaning, never the Finnish word. Showing the word
      // would let learners match sound→spelling without understanding it.
      // Find-image: one picture lives in the prompt; options are plain words.
      const body = isListen
        ? `${picture(o.image, o.id, 'optcard-pic', o.image?.altZh ?? '')}${meaningOption(o.zh, o.en)}`
        : `<span class="optcard-label fi">${esc(o.label)}</span>`
      return `<button class="${cls}" data-act="pick" data-idx="${i}" ${fb ? 'disabled' : ''}>
        <span class="num">${i + 1}</span>${body}
      </button>`
    }).join('')
    const prompt = isListen
      ? `<div class="listen-hero">
          <div class="audio-big">🎧</div>
          <p class="tip">听发音，从下面 4 张「图片 + 释义」卡里选出对应的一项</p>
          <div class="audio-row">
            <button class="btn primary" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="normal" data-rate="${FI.SPEECH_RATE.normal}">🔊 正常语速</button>
            <button class="btn sm" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="slow" data-rate="${FI.SPEECH_RATE.slow}">🐢 慢速 · 0.5×${q.audioFile ? '' : ' + 音节停顿'}</button>
          </div>
          ${voiceHint(q.audioFile)}
          <p class="hintline">选项不显示芬兰语单词，只能靠听懂发音来判断 · 按 1–4 键作答</p>
        </div>`
      : `<div class="quiz-prompt">
          ${picture(q.image, q.itemId, 'quiz-pic', q.image?.altZh)}
          ${meaningLines(q.promptZh, q.promptEn)}
          <p class="hintline">看释义与配图，从 4 个纯文字单词里选出对应的一项 · 按 1–4 键</p>
        </div>`
    // In listen mode the correct word is deliberately never printed, even in
    // the feedback line; the correct card is highlighted instead.
    const feedback = fb
      ? `<div class="feedback ${fb.correct ? 'ok' : 'no'}" role="status" aria-live="polite">${fb.correct
        ? '✓ 选对了，背景变绿'
        : (isListen ? '✗ 选错了，背景变红 · 已高亮正确选项' : `✗ 选错了，背景变红 · 正确答案：${esc(q.label)}`)}</div>`
      : ''
    return `<div class="stage ${fb ? (fb.correct ? 'correct-flash' : 'wrong-flash') : ''}">
      <div class="stage-head"><h3>${isListen ? '听选模式' : '找图片模式'}</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">${isListen ? '听音选义 · 图片 + ' + esc(meaningName()) : '看义 + 图 · 4 个纯文字单词'}</span></div>
      ${prompt}
      <div class="optcards ${isListen ? 'with-meaning' : 'text-only'}">${cards}</div>
      ${feedback}
      <div class="stage-foot"><span class="tip">选对 → 绿色；选错 → 红色并高亮正确答案${isListen ? ' · 可反复播放、切换快慢速' : ' · 选项不带图，避免看图直接猜中'}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">暂停</button></div>
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
      <div class="stage-head"><h3>单词匹配模式</h3><span class="pill">已消失 ${r.matched.length} / ${r.scopeIds.length} 对</span><span class="pill teal">两排分别打乱 · 配对成功即消失</span></div>
      <p class="tip" style="margin:0 0 6px">上排：芬兰语${session.kind === 'word' ? '单词' : '句子'}</p>
      <div class="match-row">${alive('left').map((x) => tile('left', x)).join('') || '<span class="tip">全部已匹配</span>'}</div>
      <p class="tip" style="margin:14px 0 6px">下排：${esc(meaningName())}</p>
      <div class="match-row">${alive('right').map((x) => tile('right', x)).join('') || '<span class="tip">全部已匹配</span>'}</div>
      ${r.mismatches.length ? `<p class="tip" style="margin-top:12px;color:var(--no-text)">错配 ${r.mismatches.length} 次，配对不成立的卡片会保持原位并闪红</p>` : ''}
      ${done ? '<div class="feedback ok" role="status">✓ 所有单词和意思都消失了，正在进入结果…</div>' : ''}
      <div class="stage-foot"><span class="tip">先点上排或下排任意一张，再点另一排与它对应的一项</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">暂停</button></div>
    </div>`
  }

  /* Cloze and dictation share the underline-slot renderer. Cloze now shows
     the illustration alongside the meaning; dictation hides the meaning. */
  function renderLetters(g, mode) {
    const r = session.round
    const q = r.questions[r.index]
    const fb = r.feedback
    const isDictation = mode === 'dictation'
    const slots = q.letters.map((ch, i) => {
      const fixed = q.reveal[i] || r.hintRevealed.includes(i)
      if (fixed) return `<span class="slot fixed" aria-label="已给出的字母">${esc(ch)}</span>`
      return `<input class="slot ${fb ? (fb.correct ? 'ok' : 'no') : ''}" data-slot="${i}" maxlength="1" value="${esc(r.slots[i] ?? '')}" aria-label="第 ${i + 1} 个字母" autocomplete="off" autocapitalize="off" spellcheck="false" ${fb ? 'disabled' : ''}>`
    }).join('')
    // The third hint is rebuilt on each render so a language switch applies
    // to the current question rather than only to the next group.
    const hintTexts = [
      ...q.hints.slice(0, 2),
      `释义：${FI.formatMeaning(q.promptZh, q.promptEn, pref().meaningLang)}`,
    ]
    const hints = hintTexts.slice(0, r.hintsUsed).map((h) => `<div>· ${esc(h)}</div>`).join('')
    const audio = `<div class="audio-row">
        <button class="btn primary" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="normal" data-rate="${FI.SPEECH_RATE.normal}">🔊 正常语速</button>
        <button class="btn" data-act="speak" data-text="${esc(q.audioText)}" data-audio="${esc(q.audioFile ?? '')}" data-speed="slow" data-rate="${FI.SPEECH_RATE.slow}">🐢 慢速 · 0.5×</button>
      </div>${voiceHint(q.audioFile)}`
    const clozePrompt = `<div class="cloze-q cloze-with-pic">
        ${picture(q.image, q.itemId, 'cloze-pic', q.image?.altZh)}
        ${meaningLines(q.promptZh, q.promptEn)}
        ${q.fiLine ? `<div class="fi">${esc(q.fiLine).replace('______', '<span class="blank">______</span>')}</div>` : ''}
      </div>
      <p class="tip" style="text-align:center;margin:0 0 4px">${session.kind === 'word' ? '看图与释义，单词随机露出几个字母，把缺的字母填进下划线' : '结合句子语境与配图，把缺的字母填进下划线'}</p>`
    const prompt = isDictation
      ? `<div class="dictation-prompt">
          ${picture(q.image, q.itemId, 'quiz-pic', q.image?.altZh)}
          ${audio}
          <p class="tip">听发音、看图片，把每个字母填进下划线；一个字母都没给出，全部写对才通过</p>
        </div>`
      : clozePrompt
    const title = isDictation ? '听写模式' : '填空模式'
    const pill = isDictation ? '全字母下划线 · 严格判分' : '配图 + 释义 · 随机露出字母'
    const feedback = fb
      ? `<div class="feedback ${fb.correct ? 'ok' : 'no'}" role="status" aria-live="polite">${fb.correct ? '✓ 填写正确，全部字母都对' : `✗ 正确答案是 <b>${esc(fb.answer)}</b>${r.hintsUsed && isDictation ? ' · 本词用过提示，会进入重练范围' : ''}`}</div>`
      : ''
    const hintDefault = isDictation
      ? '提示会依次露出首字母、再露一个字母、显示释义'
      : '提示依次：首字母 → 露出下一个字母 → 释义'
    const foot = isDictation
      ? '必须逐字母全对（含 ä / ö / å）；用过提示的词即使答对也会进入重练范围'
      : '逐字母填空，随机露出的字母固定不变；判分宽容 ä / ö / å'
    return `<div class="stage ${fb ? (fb.correct ? 'correct-flash' : 'wrong-flash') : ''}">
      <div class="stage-head"><h3>${title}</h3><span class="pill">${r.index + 1} / ${r.questions.length}</span><span class="pill teal">${pill}</span></div>
      ${prompt}
      <div class="slots" id="slots">${slots}</div>
      <div class="letterbar"><span class="tip">芬兰语特殊字母：</span>${['ä', 'ö', 'å', 'š', 'ž'].map((c) => `<button class="btn sm" data-act="slot-letter" data-letter="${esc(c)}">${esc(c)}</button>`).join('')}<span class="tip">· 可直接粘贴整个单词</span></div>
      <div class="answer-row">
        <button class="btn sm" data-act="hint" ${fb || r.hintsUsed >= hintTexts.length ? 'disabled' : ''}>提示 ${r.hintsUsed}/${hintTexts.length}</button>
        <span class="spacer"></span>
        ${fb ? `<button class="btn primary" data-act="next">下一题 →</button>` : `<button class="btn primary" data-act="submit">提交答案</button>`}
      </div>
      <div class="hintbox">${hints || hintDefault}</div>
      ${feedback}
      <div class="stage-foot"><span class="tip">${foot}</span><span class="spacer"></span><button class="btn sm ghost" data-act="pause">暂停</button></div>
    </div>`
  }

  function renderResult(g) {
    const r = session.lastResult
    if (!r) return '<div class="stage"></div>'
    const listOf = (ids) => ids.map((id) => {
      const item = source(session.kind).get(id)
      const m = FI.itemMeaning(item, session.kind)
      return `<div class="wrong-item"><b>${esc(FI.itemLabel(item, session.kind))}</b><span>${meaningInline(m.zh, m.en)}</span><small>${r.wrongIds.includes(id) ? '答错 · 已计入错词本' : '用过提示 · 需巩固'}</small></div>`
    }).join('')
    const reviewIds = r.retryIds
    const retryLabel = r.mode === 'dictation'
      ? `重来 · 只练错词 / 用过提示的 ${reviewIds.length} 个词`
      : `重来 · 只练选错的 ${reviewIds.length} 个词`
    return `<div class="stage">
      <div class="stage-head"><h3>${esc(r.label)} · 本轮结果</h3><span class="pill ${r.perfect ? 'teal' : 'amber'}">${r.perfect ? '全部答对' : `需巩固 ${reviewIds.length} 个`}</span></div>
      <div class="score">
        <div class="score-ring" style="--pct:${r.percent}%"><i>${r.percent}%</i></div>
        <div class="score-txt"><h4>${r.correct} / ${r.total} 题正确${r.extra ? ` · ${esc(r.extra)}` : ''}</h4><p>${r.perfect ? '可直接进入下一个流程。' : '可以继续下一个流程，也可以只针对需要巩固的词重来一遍。'}　错误已自动写入错词本。</p></div>
      </div>
      ${reviewIds.length ? `<p class="tip">本轮需要巩固的词</p><div class="wrong-list">${listOf(reviewIds)}</div>` : ''}
      <div class="actions">
        <button class="btn primary" data-act="result-continue">继续下一个流程 · ${esc(nextModeLabel())} →</button>
        ${r.perfect ? '' : `<button class="btn" data-act="result-retry">${esc(retryLabel)}</button>`}
        <button class="btn ghost" data-act="pause">暂停</button>
      </div>
      ${session.retryCount >= 3 ? '<p class="tip" style="margin-top:12px">已重练 3 轮，建议继续下一个流程，之后可在分组列表重学本组。</p>' : ''}
    </div>`
  }

  function renderComplete(g) {
    const next = FI.nextGroupId(groupIndex, g.id)
    const results = session.results ?? {}
    const grid = Object.entries(results).map(([mode, r]) =>
      `<div><span>${esc(FI.modeShort(mode))}</span><b>${r.percent}%</b></div>`
    ).join('')
    return `<div class="stage">
      <div class="stage-head"><h3>本组完成</h3><span class="pill teal">进度已保存到本机</span></div>
      <div class="complete-grid">${grid || '<div><span>本组</span><b>完成</b></div>'}<div><span>错词重练</span><b>${session.retryCount}</b></div></div>
      <p class="tip">${esc(g.id)} · ${esc(g.title)} 已标记完成。你可以接着学下一组，也可以暂停，下次打开会从这里继续。</p>
      <div class="actions">
        ${next ? `<button class="btn primary" data-act="complete-next" data-id="${esc(next)}">下一组继续学 · ${esc(next)} →</button>` : `<button class="btn primary" data-act="complete-pause">已是最后一组 · 返回分组列表</button>`}
        <button class="btn ghost" data-act="complete-pause">暂停</button>
      </div>
    </div>`
  }

  function renderLearn() {
    const g = groupById.get(session.groupId)
    if (!g) { goHome('分组已失效，已返回列表'); return }
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
    app.innerHTML = `<div class="wrap"><div class="topbar"><div class="brand"><div class="brand-mark">FL</div><div><h1>Finnish Learn</h1><p>${esc(g.level)} · ${g.kind === 'word' ? '单词' : '句子'}组 · ${esc(FI.modeLabel(p))}</p></div></div></div>${renderHead(g)}${stage}</div>`
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
    toast('进度已导出，请妥善保管该文件')
    render()
  }
  function showModal(html) {
    modalRoot.innerHTML = `<div class="modal-mask"><div class="modal">${html}</div></div>`
    ui.modal = true
  }
  function closeModal() { modalRoot.innerHTML = ''; ui.modal = false; pendingImport = null }
  function showSettings() {
    const p = pref()
    const enabled = p.enabledModes
    const rows = FI.PRACTICE_MODES.map((m) => {
      const meta = FI.MODE_META[m]
      const scope = meta.word && meta.sentence ? '词 / 句通用' : '仅单词组'
      return `<label class="mode-row">
        <input type="checkbox" data-mode="${m}" ${enabled.includes(m) ? 'checked' : ''}>
        <span><b>${esc(meta.label)}</b><small>${esc(meta.desc)}</small></span>
        <em class="tip">${scope}</em>
      </label>`
    }).join('')
    const segment = (name, list, labels, current) => `<div class="seg">${list.map((v) => `
      <label class="${v === current ? 'active' : ''}"><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}><span>${esc(labels[v])}</span></label>`).join('')}</div>`
    const itemCount = pack.words.length + pack.sentences.length
    const clipCount = [...pack.words, ...pack.sentences].filter((x) => x.audio?.path).length
    const voiceStatus = clipCount > 0
      ? `词包已声明 ${clipCount} / ${itemCount} 条音频；其余条目仍走浏览器合成语音。`
      : (finnishVoice()
        ? '已检测到本机 fi-FI 语音，可用合成发音，但音质取决于系统语音；建议为词条补齐音频文件。'
        : '⚠ 本机未检测到 fi-FI 语音，合成发音会用其他语言的嗓音读芬兰语，长短音与 ä/ö/å 容易失真。词包目前也没有预录音频，补齐后会自动优先播放。')
    showModal(`<h3>设置</h3>
      <p>释义语言、外观与音乐的偏好都保存在本机，并随进度文件一起导出/导入。</p>

      <div class="pref-group">
        <div class="pref-title">释义显示语言</div>
        ${segment('meaningLang', FI.MEANING_LANGS, FI.MEANING_LABEL, p.meaningLang)}
        <p class="tip">作用于背词卡、选词/找图题干、听选选项、填空题干、匹配下排与错词本；与界面语言互不影响。</p>
      </div>

      <div class="pref-group">
        <div class="pref-title">主题背景</div>
        ${segment('theme', FI.THEMES, FI.THEME_LABEL, p.theme)}
      </div>

      <div class="pref-group">
        <div class="pref-title">背景音乐</div>
        <label class="switch-row">
          <input type="checkbox" data-bgm ${p.bgm ? 'checked' : ''}>
          <span><b>播放低音量环境音</b><small>由浏览器实时合成的五声音阶衬底，无需联网、无音频文件；默认关闭，浏览器要求首次点击后才可发声。</small></span>
        </label>
      </div>

      <div class="pref-group">
        <div class="pref-title">发音来源</div>
        <p class="tip" style="margin:0 0 6px">优先播放词包声明的预录音频（正常 1.0× / 慢速 0.5×，保持音高不失真）；没有音频的条目才回退到浏览器语音合成。</p>
        <p class="tip" style="margin:0">${voiceStatus}</p>
      </div>

      <div class="pref-title">练习流程</div>
      <p class="tip" style="margin:0 0 8px">背词固定为第一步，勾选的练习模式按顺序依次进行；每个模式结束后都能「继续下一个流程」或「只练错词重来」。句子组自动跳过仅适用于单词的模式。</p>
      <div class="mode-list">${rows}</div>
      <p class="tip" style="margin:10px 0">流程设置对下一组生效，正在进行的组保持原流程；其余偏好即时生效。</p>
      <div class="actions">
        <button class="btn primary" data-modal="settings-save">保存设置</button>
        <button class="btn sm" data-modal="preset-full">完整流程</button>
        <button class="btn sm" data-modal="preset-slim">精简流程</button>
        <button class="btn ghost" data-modal="cancel">取消</button>
      </div>`)
  }
  async function handleImportFile(file) {
    const text = await file.text()
    const parsed = FI.Store.parseImport(text)
    if (!parsed.ok) { toast(parsed.error); return }
    const valid = await FI.Store.verifyChecksum(parsed.file)
    if (!valid) { toast('校验和不匹配，文件可能已损坏或被改动，已拒绝导入'); return }
    pendingImport = parsed.file
    const d = FI.Store.diff(state, parsed.file)
    showModal(`<h3>导入进度 · 差异预览</h3>
      <p>来源：${esc(file.name)} · 导出于 ${esc(String(parsed.file.exportedAt).slice(0, 16).replace('T', ' '))}</p>
      <div class="diff">
        新增分组：<b>${d.newGroups}</b>　可提升状态：<b>${d.upgraded}</b>　分数冲突：<b>${d.conflicts}</b><br>
        新增事件：<b>${d.newEvents}</b>　错词条目：<b>${d.mistakeItems}</b>　来源共 ${d.incomingGroups} 个分组<br>
        ${d.contentMismatch ? '⚠️ 内容版本不同：按词条 ID 映射，映射不到的记录保留但不参与出题。' : '内容版本一致'}
      </div>
      <p>合并 = 分组取更进步的状态、事件按 (anonId, clientSeq) 去重；覆盖 = 用文件完全替换本机进度。</p>
      <div class="actions">
        <button class="btn primary" data-modal="merge">合并导入（推荐）</button>
        <button class="btn danger" data-modal="overwrite">覆盖导入</button>
        <button class="btn ghost" data-modal="cancel">取消</button>
      </div>`)
  }
  function confirmClear() {
    showModal(`<h3>清除本机全部学习数据？</h3><p>包括分组进度、错词本、事件日志与暂停中的学习会话。此操作不可撤销，建议先导出备份。</p>
      <div class="actions"><button class="btn danger" data-modal="clear-yes">确认清除</button><button class="btn ghost" data-modal="cancel">取消</button></div>`)
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
        if (!g || !Array.isArray(state.session.pipeline)) { state.session = null; persist(); render(); toast('旧版会话已失效，请重新开始本组'); break }
        session = state.session
        state.paused = false
        ui.view = 'learn'; ui.transition = false
        persist(); render()
        break
      }
      case 'discard': state.session = null; state.paused = false; persist(); render(); toast('已放弃该组的学习会话'); break
      case 'pause': goHome('已暂停，进度已保存'); break
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
      case 'complete-pause': goHome('本组已完成，进度已保存'); break
      case 'speak': {
        const speed = el.dataset.speed === 'slow' ? 'slow' : 'normal'
        if (session?.round && ['listen', 'dictation'].includes(session.phase)) {
          session.round.speed = speed
          persist()
        }
        speak(el.dataset.text, speed, el.dataset.audio)
        break
      }
      case 'theme-toggle': {
        const i = FI.THEMES.indexOf(pref().theme)
        pref().theme = FI.THEMES[(i + 1) % FI.THEMES.length]
        applyTheme(); persist(); render()
        toast(`主题：${FI.THEME_LABEL[pref().theme]}`)
        break
      }
      case 'bgm-toggle': {
        pref().bgm = !pref().bgm
        applyBgm(); persist(); render()
        toast(pref().bgm ? '背景音乐已开启' : '背景音乐已关闭')
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
      handleImportFile(e.target.files[0]).catch(() => toast('读取文件失败'))
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
      FI.Store.save(state); applyPrefs(); closeModal(); render(); toast('本机数据已清除'); return
    }
    if (act === 'settings-save') {
      const picked = [...modalRoot.querySelectorAll('[data-mode]')].filter((x) => x.checked).map((x) => x.dataset.mode)
      const meaningLang = modalRoot.querySelector('input[name="meaningLang"]:checked')?.value ?? 'both'
      const theme = modalRoot.querySelector('input[name="theme"]:checked')?.value ?? 'system'
      const bgm = modalRoot.querySelector('[data-bgm]')?.checked === true
      state.preferences = FI.sanitizePrefs({
        ...state.preferences, enabledModes: picked, meaningLang, theme, bgm,
      })
      applyPrefs(); persist(); closeModal(); render(); toast('设置已保存'); return
    }
    if (act === 'preset-full' || act === 'preset-slim') {
      state.preferences.enabledModes = (act === 'preset-full' ? FI.DEFAULT_MODES : FI.SLIM_MODES).slice()
      persist(); closeModal(); render(); toast(act === 'preset-full' ? '已切换为完整流程' : '已切换为精简流程'); return
    }
    if (!pendingImport) { closeModal(); return }
    if (act === 'merge') state = FI.Store.merge(state, pendingImport)
    else state = FI.Store.overwrite(state, pendingImport)
    state.preferences = FI.sanitizePrefs(state.preferences)
    applyPrefs(); persist(); closeModal(); render()
    toast(act === 'merge' ? '已合并导入' : '已覆盖导入')
  })
  document.addEventListener('keydown', (e) => {
    if (ui.modal) { if (e.key === 'Escape') closeModal(); return }
    if (ui.view !== 'learn' || !session) return
    if (e.key === 'Escape') { goHome('已暂停，进度已保存'); return }
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
