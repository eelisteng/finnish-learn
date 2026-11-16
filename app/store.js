/* Local-first progress store. No account, no backend: the browser is the
   source of truth and a versioned JSON file is the only migration protocol. */
(function () {
  const FI = (window.FI = window.FI || {})
  const KEY = 'finnish-learn:v1'
  const RANK = { 'not-started': 0, 'in-progress': 1, completed: 2 }

  let memoryFallback = null
  const uuid = () => (window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  function defaults() {
    return {
      schema: 1,
      anonId: uuid(),
      contentVersion: window.FI_DATA?.pack?.version ?? 'unknown',
      preferences: {
        targetLevel: 'A1',
        enabledModes: ['choice', 'listen', 'findImage', 'match', 'cloze', 'dictation'],
        meaningLang: 'both',
        uiLang: 'zh',
        theme: 'system',
        bgm: false,
        bgmTrack: FI.DEFAULT_BGM_TRACK ?? 'mist',
      },
      groups: {},
      mistakes: {},
      eventLog: [],
      clientSeq: 0,
      lastExportedAt: null,
      session: null,
      paused: false,
    }
  }

  function load() {
    let raw = null
    try { raw = localStorage.getItem(KEY) } catch { /* private mode */ }
    if (!raw && memoryFallback) return memoryFallback
    let state
    try { state = raw ? JSON.parse(raw) : defaults() } catch { state = defaults() }
    const base = defaults()
    state = { ...base, ...state, preferences: { ...base.preferences, ...(state.preferences ?? {}) } }
    state.groups = state.groups ?? {}
    state.mistakes = state.mistakes ?? {}
    state.eventLog = Array.isArray(state.eventLog) ? state.eventLog : []
    if (!state.anonId) state.anonId = base.anonId
    state.preferences = FI.sanitizePrefs
      ? FI.sanitizePrefs(state.preferences)
      : base.preferences
    // Paused sessions written by the old three-step flow cannot be resumed
    // under the configurable pipeline; drop them, keep all other progress.
    if (state.session && !Array.isArray(state.session.pipeline)) {
      state.session = null
      state.paused = false
    }
    // A paused session referencing a mode that no longer exists (e.g. the
    // removed 拼写 mode) has stale round data. Drop the session, keep all
    // other progress (groups, mistakes, events).
    if (state.session && state.session.pipeline.some((m) =>
      m !== 'memorize' && m !== 'complete' && !(FI.PRACTICE_MODES ?? []).includes(m))) {
      state.session = null
      state.paused = false
    }
    // Practice modes used to be shuffled per group. Re-order a paused session
    // from that era into the fixed easy-to-hard sequence without losing the
    // learner's current round. Rebuild from the session's OWN stages (not the
    // current preferences, which may have changed since it was started), and
    // remap pipelineIndex via round.mode — that also works on a result screen,
    // where phase is "result" rather than the stage that produced it.
    if (state.session && FI.buildPipeline) {
      const s = state.session
      const kind = s.kind === 'sentence' ? 'sentence' : 'word'
      const canonical = FI.buildPipeline(kind, s.pipeline.slice(1, -1))
      if (canonical.join(',') !== s.pipeline.join(',')) {
        const currentMode = s.round?.mode ?? s.phase
        const idx = canonical.indexOf(currentMode)
        s.pipeline = canonical
        s.pipelineIndex = Math.max(0, Math.min(
          idx >= 0 ? idx : (s.pipelineIndex ?? 0), canonical.length - 1,
        ))
      }
    }
    // A session paused in the old whole-word cloze has no letters/reveal
    // arrays. Drop it instead of crashing the underline-slot renderer.
    const letterPhase = ['cloze', 'dictation'].includes(state.session?.phase)
    if (letterPhase && state.session?.round?.questions?.length &&
        !Array.isArray(state.session.round.questions[0].letters)) {
      state.session = null
      state.paused = false
    }
    state.contentMismatch = Boolean(window.FI_DATA && state.contentVersion !== window.FI_DATA.pack.version)
    return state
  }

  function save(state) {
    memoryFallback = state
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true } catch { return false }
  }

  function reset() {
    memoryFallback = null
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    return defaults()
  }

  function event(state, type, payload) {
    state.clientSeq = (state.clientSeq ?? 0) + 1
    state.eventLog.push({
      id: `${state.anonId}:${state.clientSeq}`,
      anonId: state.anonId,
      type,
      payload,
      clientSeq: state.clientSeq,
      createdAt: new Date().toISOString(),
    })
    if (state.eventLog.length > 2000) state.eventLog = state.eventLog.slice(-2000)
    return state
  }

  function touchGroup(state, groupId, patch) {
    const prev = state.groups[groupId] ?? { status: 'not-started', bestScore: 0, attempts: 0, completedAt: null, wrongIds: [] }
    state.groups[groupId] = { ...prev, ...patch }
    return state
  }

  /** Shared bookkeeping for every practice round. Wrong answers feed the
      mistake book; a retry round never lowers the best full-group score. */
  function applyRound(state, session, r) {
    for (const id of r.wrongIds) {
      const m = state.mistakes[id] ?? { count: 0, lastWrongAt: null, groupId: session.groupId }
      state.mistakes[id] = { ...m, count: m.count + 1, lastWrongAt: new Date().toISOString(), groupId: session.groupId }
    }
    const prev = state.groups[session.groupId] ?? {}
    touchGroup(state, session.groupId, {
      status: 'in-progress',
      attempts: (prev.attempts ?? 0) + 1,
      bestScore: r.fullRound ? Math.max(prev.bestScore ?? 0, r.percent) : (prev.bestScore ?? 0),
      wrongIds: r.wrongIds,
    })
    event(state, `${r.mode}_round`, {
      groupId: session.groupId,
      attempt: session.attempt,
      total: r.total,
      correct: r.correct,
      wrongIds: r.wrongIds,
    })
    return { total: r.total, correct: r.correct, wrongIds: r.wrongIds, percent: r.percent }
  }

  /** Kept for the domain test harness and the legacy three-step flow. */
  function recordChoice(state, session) {
    const total = session.choiceAnswers.length
    const correct = session.choiceAnswers.filter((a) => a.correct).length
    const wrongIds = [...new Set(session.choiceAnswers.filter((a) => !a.correct).map((a) => a.itemId))]
    return applyRound(state, session, {
      mode: 'choice', total, correct, wrongIds,
      percent: Math.round((correct / total) * 100),
      fullRound: session.scopeIds.length === session.itemIds.length,
    })
  }

  /** One event per completed round of any mode. */
  function recordRound(state, session, result) {
    return applyRound(state, session, result)
  }

  function recordComplete(state, session) {
    const choiceBest = state.groups[session.groupId]?.bestScore ?? 0
    const perMode = session.results ?? {}
    const percents = Object.values(perMode).map((r) => Number(r.percent ?? 0))
    touchGroup(state, session.groupId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      bestScore: Math.max(choiceBest, session.clozePercent ?? 0, ...percents),
      wrongIds: session.lastWrongIds ?? [],
    })
    event(state, 'group_completed', {
      groupId: session.groupId,
      choicePercent: perMode.choice?.percent ?? session.choicePercent ?? 0,
      clozePercent: perMode.cloze?.percent ?? session.clozePercent ?? 0,
      retries: session.retryCount ?? 0,
      modes: Object.fromEntries(Object.entries(perMode).map(([k, v]) => [k, v.percent])),
    })
    state.session = null
    state.paused = false
    return state
  }

  /* ── portable progress file ───────────────────────────────── */
  function portableData(state) {
    return {
      preferences: state.preferences,
      groups: state.groups,
      mistakes: state.mistakes,
      eventLog: state.eventLog,
      clientSeq: state.clientSeq,
    }
  }
  async function checksum(text) {
    const bytes = new TextEncoder().encode(text)
    if (window.crypto?.subtle?.digest) {
      try {
        const buf = await window.crypto.subtle.digest('SHA-256', bytes)
        return `sha256:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
      } catch { /* fall through */ }
    }
    let h = 2166136261
    for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619) }
    return `fnv1a:${(h >>> 0).toString(16)}`
  }
  async function buildExport(state) {
    const data = portableData(state)
    const canonical = JSON.stringify(data)
    const file = {
      format: 'finnish-learn-progress',
      schema: 1,
      exportedAt: new Date().toISOString(),
      contentVersion: state.contentVersion,
      anonId: state.anonId,
      checksum: await checksum(canonical),
      data,
    }
    return { file, text: `${JSON.stringify(file, null, 2)}\n` }
  }
  function parseImport(text) {
    // `errorKey` is resolved through the interface dictionary in main.js;
    // `error` keeps the legacy Chinese text for callers without i18n.
    const fail = (key, legacy) => ({ ok: false, errorKey: key, error: legacy })
    let file
    try { file = JSON.parse(text) } catch { return fail('import.err.notJson', '不是合法的 JSON 文件') }
    if (file.format !== 'finnish-learn-progress') return fail('import.err.format', '不是本产品的进度文件（format 不匹配）')
    if (!file.data || typeof file.data !== 'object') return fail('import.err.noData', '缺少 data 字段')
    for (const key of ['groups', 'mistakes', 'eventLog']) {
      if (!file.data[key] || typeof file.data[key] !== 'object') {
        return { ok: false, errorKey: 'import.err.noField', errorParams: { key }, error: `缺少 data.${key}` }
      }
    }
    return { ok: true, file }
  }
  async function verifyChecksum(file) {
    if (!file.checksum) return true
    const got = await checksum(JSON.stringify(file.data))
    return got === file.checksum
  }
  function diff(state, file) {
    const incoming = file.data.groups ?? {}
    const events = Array.isArray(file.data.eventLog) ? file.data.eventLog : []
    const seen = new Set(state.eventLog.map((e) => e.id ?? `${e.anonId}:${e.clientSeq}`))
    let upgraded = 0, conflicts = 0, newGroups = 0
    for (const [id, g] of Object.entries(incoming)) {
      const local = state.groups[id]
      if (!local) { newGroups++; continue }
      if (RANK[g.status] > RANK[local.status]) upgraded++
      else if (g.bestScore !== local.bestScore) conflicts++
    }
    return {
      newGroups,
      upgraded,
      conflicts,
      incomingGroups: Object.keys(incoming).length,
      newEvents: events.filter((e) => !seen.has(e.id ?? `${e.anonId}:${e.clientSeq}`)).length,
      mistakeItems: Object.keys(file.data.mistakes ?? {}).length,
      contentMismatch: file.contentVersion !== state.contentVersion,
    }
  }
  function merge(state, file) {
    const data = file.data
    for (const [id, g] of Object.entries(data.groups ?? {})) {
      const local = state.groups[id]
      if (!local) { state.groups[id] = { ...g }; continue }
      const winner = RANK[g.status] >= RANK[local.status] ? g : local
      const other = winner === g ? local : g
      state.groups[id] = {
        ...winner,
        bestScore: Math.max(Number(local.bestScore ?? 0), Number(g.bestScore ?? 0)),
        attempts: Math.max(Number(local.attempts ?? 0), Number(g.attempts ?? 0)),
        completedAt: [local.completedAt, g.completedAt].filter(Boolean).sort()[0] ?? null,
        wrongIds: [...new Set([...(local.wrongIds ?? []), ...(g.wrongIds ?? []), ...(other.wrongIds ?? [])])],
      }
    }
    for (const [id, m] of Object.entries(data.mistakes ?? {})) {
      const local = state.mistakes[id]
      state.mistakes[id] = local
        ? { ...local, count: Math.max(Number(local.count ?? 0), Number(m.count ?? 0)), lastWrongAt: [local.lastWrongAt, m.lastWrongAt].filter(Boolean).sort().pop() ?? null }
        : { ...m }
    }
    const seen = new Set(state.eventLog.map((e) => e.id ?? `${e.anonId}:${e.clientSeq}`))
    for (const e of data.eventLog ?? []) {
      const key = e.id ?? `${e.anonId}:${e.clientSeq}`
      if (!seen.has(key)) { state.eventLog.push(e); seen.add(key) }
    }
    state.eventLog.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    for (const e of state.eventLog) state.clientSeq = Math.max(state.clientSeq ?? 0, Number(e.clientSeq ?? 0))
    return state
  }
  function overwrite(state, file) {
    const data = file.data
    state.groups = JSON.parse(JSON.stringify(data.groups ?? {}))
    state.mistakes = JSON.parse(JSON.stringify(data.mistakes ?? {}))
    state.eventLog = JSON.parse(JSON.stringify(Array.isArray(data.eventLog) ? data.eventLog : []))
    state.clientSeq = state.eventLog.reduce((m, e) => Math.max(m, Number(e.clientSeq ?? 0)), 0)
    // The imported file carries display preferences too, but the level the
    // learner is currently browsing stays local.
    state.preferences = FI.sanitizePrefs
      ? FI.sanitizePrefs({ ...state.preferences, ...(data.preferences ?? {}), targetLevel: state.preferences.targetLevel })
      : state.preferences
    state.session = null
    state.paused = false
    return state
  }

  FI.Store = { KEY, load, save, reset, event, touchGroup, recordChoice, recordRound, recordComplete, buildExport, parseImport, verifyChecksum, diff, merge, overwrite }
})()
