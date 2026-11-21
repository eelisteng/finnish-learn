/* Mobile + aspect-ratio regression for the find-image (找图) cards.
 *
 * Plain --window-size in headless Chrome has a 500px floor, so it cannot
 * reproduce a 320-390px phone. This runner uses the DevTools Protocol to
 * override device metrics and dispatch REAL touch events, then reads the
 * assertions from tests/mobile-find-image.html. A 1280px desktop case is
 * measured first, and every phone card ratio (before and after the flip)
 * must match that desktop 1:1 reference.
 *
 *   node scripts/test-mobile.mjs
 *   CHROME=/path/to/chrome node scripts/test-mobile.mjs
 *
 * Requires Node >= 22 (global WebSocket) and a local Chrome/Chromium.
 * Absent either, it prints SKIP and exits 0 so other environments still work.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PAGE = `file://${join(ROOT, 'tests/mobile-find-image.html')}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function chromeBinary() {
  if (process.env.CHROME) return process.env.CHROME
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  return candidates.find(existsSync) ?? null
}

if (typeof WebSocket === 'undefined' || !chromeBinary()) {
  console.log('SKIP mobile regression: needs Node >= 22 with WebSocket and a local Chrome/Chromium')
  process.exit(0)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'fi-mobile-'))
const proc = spawn(chromeBinary(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' })

function cleanup(code) {
  try { proc.kill() } catch { /* already gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* temp dir */ }
  process.exit(code)
}

let port = null
for (let i = 0; i < 80; i++) {
  const f = join(userDataDir, 'DevToolsActivePort')
  if (existsSync(f)) { port = Number(readFileSync(f, 'utf8').split('\n')[0]); break }
  await sleep(150)
}
if (!port) { console.error('FAIL mobile regression: Chrome DevTools port never came up'); cleanup(1) }

let ws
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
} catch (err) {
  console.error('FAIL mobile regression: ' + err.message)
  cleanup(1)
}

let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

const CASES = [
  // Desktop is the reference geometry: square cards. The phone cases below
  // must measure the same ratio, not just a plausible one.
  { width: 1280, height: 900, long: false, desktop: true },
  // Just above the 640px breakpoint: still 4 columns, but the cards are only
  // 132px wide, so long lemmas must still fit inside the square face.
  { width: 641, height: 900, long: true, desktop: true, name: ' (4-column breakpoint)' },
  { width: 390, height: 844, long: false },
  { width: 390, height: 844, long: true },
  { width: 360, height: 740, long: true },
  { width: 320, height: 700, long: true },
]

let totalPass = 0, totalFail = 0, harnessFail = 0
const geometry = []
for (const c of CASES) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: c.width, height: c.height, deviceScaleFactor: c.desktop ? 1 : 3,
    mobile: !c.desktop, screenWidth: c.width, screenHeight: c.height,
  })
  await evaluate('localStorage.clear(); sessionStorage.clear(); "cleared"')
  await send('Page.navigate', { url: `${PAGE}${c.long ? '?long=1' : ''}` })

  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      const txt = (await evaluate('document.getElementById("out")?.textContent ?? ""')) || ''
      if (txt.includes('WAITING_FOR_TAP')) { ready = true; break }
      if (txt.includes('FAIL ')) { console.log(txt); harnessFail++; break }
    } catch { /* navigation in progress */ }
    await sleep(150)
  }
  if (!ready) { console.log(`FAIL ${c.width}px: harness never reached the tap stage`); harnessFail++; continue }

  geometry.push(await evaluate('window.__geometry'))
  const target = await evaluate('window.__prepareTap()')
  await sleep(120)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: target.x, y: target.y, id: 1 }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // Let the 420ms reveal animation settle before measuring the illustration.
  await sleep(620)
  const text = (await evaluate('window.__afterTap()')) || ''
  const pass = (text.match(/^PASS /gm) || []).length
  const fail = (text.match(/^FAIL /gm) || []).length
  totalPass += pass; totalFail += fail
  const label = c.name ?? (c.desktop ? ' (desktop reference)' : c.long ? ' (long Finnish lemmas)' : '')
  console.log(`\n── ${c.width} x ${c.height}px${label} : ${pass} passed, ${fail} failed ──`)
  console.log(text.split('\n').filter((l) => l.startsWith('FAIL') ||
    l.startsWith('PASS ratio: every face') || l.startsWith('PASS card: no label')).join('\n') || '(all assertions passed)')
}

/* Cross-viewport parity: the phone cards must be the desktop card scaled
   down, not a taller/portrait variant. Compare each phone face ratio with
   the desktop face ratio measured in the very same browser session. */
const desktop = geometry.find((g) => g && g.width === 1280 && !g.phone)
if (desktop) {
  for (const g of geometry.filter((x) => x && x.phone)) {
    const ref = desktop.faceRatios[0]
    const same = g.faceRatios.length === 4 && g.faceRatios.every((r) => Math.abs(r - ref) <= 0.02)
    if (same) totalPass++; else totalFail++
    console.log(`${same ? 'PASS' : 'FAIL'} parity: ${g.width}px phone ratio ${g.faceRatios.map((r) => r.toFixed(3)).join(', ')} matches desktop ${ref.toFixed(3)}`)
  }
} else {
  totalFail++
  console.log('FAIL parity: desktop reference geometry was never captured')
}

ws.close()
console.log(`\nMobile + ratio regression: ${totalPass} passed, ${totalFail + harnessFail} failed`)
cleanup(totalFail + harnessFail ? 1 : 0)
