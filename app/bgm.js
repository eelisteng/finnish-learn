/* Optional background ambience.
   No audio file, no network, no licence: a very quiet pentatonic pad is
   synthesised with the Web Audio API so the site stays fully offline.
   Default OFF. Browsers block autoplay, so a suspended context is resumed
   on the first real user gesture. */
(function () {
  const FI = (window.FI = window.FI || {})
  const Ctor = window.AudioContext || window.webkitAudioContext
  let ctx = null
  let master = null
  let timer = null
  let step = 0

  // C major pentatonic, one octave apart. Soft sine tones, no percussion.
  const HZ = [261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66]

  function tone(freq, at, duration, volume) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.55)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(gain)
    gain.connect(master)
    osc.start(at)
    osc.stop(at + duration + 0.05)
  }

  function tick() {
    if (!ctx) return
    const at = ctx.currentTime + 0.04
    tone(HZ[step % HZ.length], at, 2.7, 0.32)
    if (step % 4 === 0) tone(HZ[(step + 2) % HZ.length] / 2, at, 3.3, 0.16)
    step++
  }

  function unlock() {
    const resume = () => {
      try { ctx?.resume() } catch { /* ignore */ }
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
    }
    document.addEventListener('pointerdown', resume)
    document.addEventListener('keydown', resume)
  }

  function start() {
    if (ctx) return true
    if (!Ctor) return false
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.setValueAtTime(0.0001, ctx.currentTime)
      master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.4)
      master.connect(ctx.destination)
      step = 0
      tick()
      timer = setInterval(tick, 2400)
      if (ctx.state === 'suspended') {
        try { ctx.resume() } catch { /* ignore */ }
        unlock()
      }
      return true
    } catch {
      stop()
      return false
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
    const old = ctx
    ctx = null
    master = null
    if (old) { try { old.close() } catch { /* ignore */ } }
  }

  FI.Bgm = {
    available: Boolean(Ctor),
    start,
    stop,
    isOn: () => Boolean(ctx),
  }
})()
