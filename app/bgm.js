/* Optional background music — five offline generative ambient tracks.
   No audio files, no network, no licence: every sound is rendered live by
   the Web Audio API from the recipes in FI.BGM_TRACKS (app/grouping.js).
   All tracks are slow, quiet and wordless; they differ in scale, register,
   voicing, envelope, reverb, and in whether a wind bed or a low drone is
   layered underneath. Default OFF. Browsers block autoplay, so a suspended
   context is resumed on the first real user gesture. One AudioContext is
   reused for the page lifetime; switching tracks only rebuilds the graph. */
(function () {
  const FI = (window.FI = window.FI || {})
  const Ctor = window.AudioContext || window.webkitAudioContext
  const HZ = (midi) => 440 * Math.pow(2, (midi - 69) / 12)
  const PREVIEW_MS = 12000

  let ctx = null
  let graph = null
  let timer = null
  let nextAt = 0
  let step = 0
  let running = false
  let currentId = FI.DEFAULT_BGM_TRACK ?? 'mist'
  let previewState = null
  let unlockAttached = false

  function unlock() {
    if (unlockAttached) return
    unlockAttached = true
    const resume = () => {
      try { ctx?.resume() } catch { /* ignore */ }
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
      unlockAttached = false
    }
    document.addEventListener('pointerdown', resume)
    document.addEventListener('keydown', resume)
  }

  function ensureCtx() {
    if (!Ctor) return null
    if (!ctx) {
      try { ctx = new Ctor() } catch { return null }
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume() } catch { /* ignore */ }
      unlock()
    }
    return ctx
  }

  /* A decaying-noise impulse response gives the airy "room" without
     shipping a WAV file. Wetter presets get a longer tail. */
  function impulse(seconds) {
    const rate = ctx.sampleRate
    const len = Math.max(1, Math.floor(rate * seconds))
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
      }
    }
    return buf
  }

  /* Brown-ish noise is much softer than white noise: a distant wind bed. */
  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.2
    }
    return buf
  }

  function buildGraph(track) {
    const now = ctx.currentTime
    const g = { sources: [] }

    g.master = ctx.createGain()
    g.master.gain.setValueAtTime(0.0001, now)
    g.master.gain.linearRampToValueAtTime(track.master, now + 2.2)
    g.master.connect(ctx.destination)

    g.filter = ctx.createBiquadFilter()
    g.filter.type = 'lowpass'
    g.filter.frequency.value = track.cutoff
    g.filter.Q.value = 0.4
    g.filter.connect(g.master)

    g.dry = ctx.createGain()
    g.dry.gain.value = 1 - track.reverb * 0.45
    g.dry.connect(g.filter)

    g.wet = ctx.createGain()
    g.wet.gain.value = track.reverb
    g.verb = ctx.createConvolver()
    g.verb.buffer = impulse(1.8 + track.reverb * 2.6)
    g.wet.connect(g.verb)
    g.verb.connect(g.filter)

    if (track.air > 0) {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(4)
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = track.airCutoff
      const level = ctx.createGain()
      level.gain.setValueAtTime(0.0001, now)
      level.gain.linearRampToValueAtTime(track.air, now + 3)
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.045
      const lfoAmt = ctx.createGain()
      lfoAmt.gain.value = track.air * 0.4
      lfo.connect(lfoAmt)
      lfoAmt.connect(level.gain)
      src.connect(lp)
      lp.connect(level)
      level.connect(g.master)
      src.start(now)
      lfo.start(now)
      g.sources.push({ src, lfo })
    }

    if (Array.isArray(track.bass) && track.bass.length) {
      track.bass.forEach((midi, i) => {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = HZ(midi)
        const level = ctx.createGain()
        level.gain.setValueAtTime(0.0001, now)
        level.gain.linearRampToValueAtTime(track.droneGain, now + 4)
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 0.035 + i * 0.012
        const lfoAmt = ctx.createGain()
        lfoAmt.gain.value = track.droneGain * 0.4
        lfo.connect(lfoAmt)
        lfoAmt.connect(level.gain)
        osc.connect(level)
        level.connect(g.dry)
        level.connect(g.wet)
        osc.start(now)
        lfo.start(now)
        g.sources.push({ src: osc, lfo })
      })
    }
    return g
  }

  function tone(track, freq, at, dur, volume, panValue) {
    const osc = ctx.createOscillator()
    osc.type = track.wave
    osc.frequency.value = freq
    if (track.detune) osc.detune.value = (Math.random() * 2 - 1) * track.detune
    const level = ctx.createGain()
    level.gain.setValueAtTime(0.0001, at)
    level.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + track.attack)
    level.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    let tail = level
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, panValue))
      level.connect(pan)
      tail = pan
    }
    osc.connect(level)
    tail.connect(graph.dry)
    tail.connect(graph.wet)
    osc.start(at)
    osc.stop(at + dur + 0.06)
  }

  function playStep(track, at) {
    const n = track.scale.length
    const root = step % n
    for (let v = 0; v < track.voices; v++) {
      const midi = track.scale[(root + v * track.voiceStep) % n] + (v > 1 ? 12 : 0)
      const pan = ((step + v) % 2 ? 1 : -1) * track.pan
      tone(track, HZ(midi), at + v * 0.12, track.duration, track.gain / (v + 1), pan)
    }
    if (track.sparkle > 0 && Math.random() < track.sparkle) {
      const midi = track.scale[(root + 3) % n] + 24
      tone(track, HZ(midi), at + track.stepSec * 0.55,
        track.duration * 0.7, track.gain * 0.45, -track.pan)
    }
  }

  /* Look-ahead scheduling: notes are queued against the audio clock, so a
     busy main thread cannot make the pad stutter. */
  function schedule() {
    if (!running || !ctx || !graph) return
    const track = FI.bgmTrack(currentId)
    const horizon = ctx.currentTime + 1.0
    while (nextAt < horizon) {
      playStep(track, nextAt)
      const jitter = 1 + (Math.random() * 2 - 1) * track.jitter
      nextAt += Math.max(0.5, track.stepSec * jitter)
      step++
    }
  }

  function teardown() {
    if (timer) { clearInterval(timer); timer = null }
    running = false
    const g = graph
    graph = null
    if (!g || !ctx) return
    const now = ctx.currentTime
    try {
      g.master.gain.cancelScheduledValues(now)
      g.master.gain.setTargetAtTime(0.0001, now, 0.07)
    } catch { /* ignore */ }
    setTimeout(() => {
      for (const s of g.sources) {
        try { s.src?.stop() } catch { /* already stopped */ }
        try { s.lfo?.stop() } catch { /* already stopped */ }
      }
      for (const node of [g.dry, g.wet, g.verb, g.filter, g.master]) {
        try { node?.disconnect() } catch { /* ignore */ }
      }
    }, 340)
  }

  function begin(id) {
    const track = FI.bgmTrack(id)
    if (!ensureCtx()) return false
    try {
      graph = buildGraph(track)
      step = 0
      nextAt = ctx.currentTime + 0.08
      currentId = track.id
      running = true
      schedule()
      timer = setInterval(schedule, 220)
      return true
    } catch {
      teardown()
      return false
    }
  }

  function cancelPreview() {
    if (!previewState) return
    clearTimeout(previewState.timer)
    previewState = null
  }

  /** Audition a track for 12s. It never changes the saved preference: when
      it ends, the previous track (or silence) is restored automatically. */
  function preview(id, onEnd) {
    const wanted = FI.bgmTrack(id).id
    if (previewState && previewState.id === wanted) { endPreview(); return }
    if (!previewState) {
      previewState = { id: wanted, savedId: currentId, wasOn: running, timer: null, onEnd: null }
    }
    previewState.id = wanted
    if (typeof onEnd === 'function') previewState.onEnd = onEnd
    teardown()
    begin(wanted)
    clearTimeout(previewState.timer)
    previewState.timer = setTimeout(endPreview, PREVIEW_MS)
  }

  function endPreview() {
    if (!previewState) return
    const p = previewState
    clearTimeout(p.timer)
    previewState = null
    teardown()
    if (p.wasOn) begin(p.savedId)
    else currentId = p.savedId
    try { p.onEnd?.() } catch { /* ignore */ }
  }

  function start(id) {
    cancelPreview()
    const wanted = FI.bgmTrack(id ?? currentId).id
    if (running && wanted === currentId) return true
    teardown()
    return begin(wanted)
  }

  function stop() {
    cancelPreview()
    teardown()
  }

  function setTrack(id) {
    const wanted = FI.bgmTrack(id).id
    if (previewState) return
    if (running && wanted !== currentId) { teardown(); begin(wanted) }
    else currentId = wanted
  }

  FI.Bgm = {
    available: Boolean(Ctor),
    start,
    stop,
    setTrack,
    preview,
    endPreview,
    isOn: () => running,
    isPreviewing: () => Boolean(previewState),
    previewTrack: () => previewState?.id ?? null,
    currentTrack: () => currentId,
  }
})()
