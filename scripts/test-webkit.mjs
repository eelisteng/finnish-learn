/* Real-WebKit regression for every practice mode's option cards.
 *
 * scripts/test-mobile.mjs drives headless Chrome/Blink through CDP, which
 * hides WebKit-only button layout bugs. This runner compiles
 * tests/webkit-find-image.swift into a WKWebView probe (the engine behind
 * iOS Safari and WeChat in-app WebViews) and runs two suites:
 *   1. the deep find-image suite: six viewports, the four 1:1 option boxes
 *      before/after the flip, the listen grid and cross-viewport parity;
 *   2. the all-modes suite: choice / listen / findImage / match / cloze /
 *      dictation at 390 / 360 / 320px, plus dark-theme illustration variants.
 *      tests/mobile-all-modes.html owns the per-mode assertions and a real
 *      interaction so a painted-but-dead card cannot pass.
 *
 *   node scripts/test-webkit.mjs
 *   FI_REPO=/path/to/checkout node scripts/test-webkit.mjs
 *
 * macOS + the Command Line Tools (swiftc) are required. On any other
 * platform it prints SKIP and exits 0 so CI outside macOS stays green.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SWIFTC = '/usr/bin/swiftc'
if (process.platform !== 'darwin' || !existsSync(SWIFTC)) {
  console.log('SKIP WebKit regression: needs macOS with the Swift Command Line Tools')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'fi-webkit-'))
const bin = join(tmp, 'webkit-find-image')
function cleanup(code) {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temp dir */ }
  process.exit(code)
}

try {
  execFileSync(SWIFTC, ['-O', join(ROOT, 'tests/webkit-find-image.swift'), '-o', bin],
    { stdio: 'pipe', timeout: 180000 })
} catch (err) {
  console.error('FAIL WebKit regression: could not compile the WKWebView probe')
  console.error(String(err.stderr ?? err.message).slice(0, 800))
  cleanup(1)
}

const CASES = [
  { width: 1280, height: 900, desktop: true },
  { width: 641, height: 900, long: true, name: ' (4-column breakpoint)' },
  { width: 390, height: 844 },
  { width: 390, height: 844, long: true },
  { width: 360, height: 740, long: true },
  { width: 320, height: 700, long: true },
]

let totalPass = 0, totalFail = 0
const close = (a, b, tol = 0.02) => Math.abs(a - b) <= tol
const ratio = ([w, h]) => w / h
const results = []

for (const c of CASES) {
  const label = `${c.width} x ${c.height}px${c.name ?? (c.desktop ? ' (desktop reference)' : c.long ? ' (long Finnish lemmas)' : '')}`
  const args = [String(c.width), String(c.height), ...(c.long ? ['--long'] : [])]
  let raw
  try {
    raw = execFileSync(bin, args, {
      encoding: 'utf8', timeout: 90000, env: { ...process.env, FI_REPO: ROOT },
    })
  } catch (err) {
    console.log(`FAIL ${label}: probe did not finish :: ${err.message}`)
    totalFail++
    continue
  }
  const line = raw.split('\n').find((l) => l.startsWith('RESULT '))
  let data
  try { data = JSON.parse(line.slice('RESULT '.length)) } catch {
    console.log(`FAIL ${label}: malformed probe output :: ${raw.slice(0, 300)}`)
    totalFail++
    continue
  }

  let pass = 0, fail = 0
  const ok = (name, cond, detail = '') => {
    if (cond) { pass++ } else { fail++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`) }
  }
  const assertions = (data.after?.assertions ?? '').split('\n')
  for (const a of assertions) {
    if (a.startsWith('PASS ')) pass++
    else if (a.startsWith('FAIL ')) { fail++; console.log(`  ${a}`) }
  }
  ok('probe returned both measurements', !data.error && Boolean(data.before?.cards) && Boolean(data.after?.cards),
    data.error ?? JSON.stringify(data).slice(0, 200))

  const before = data.before?.cards ?? []
  const after = data.after?.cards ?? []
  const listen = data.before?.listen
  ok('four option cards measured before the tap', before.length === 4, `got ${before.length}`)
  ok('four option cards measured after the tap', after.length === 4, `got ${after.length}`)
  ok('grid columns match the viewport class',
    data.before?.cols === (data.before?.phone ? 2 : 4), `cols=${data.before?.cols}`)
  /* The listen grid shares .optcard; its cards must not shrink-wrap either. */
  ok('listen grid measured inside the same stage', Boolean(listen) && listen.cards?.length === 4,
    JSON.stringify(listen))
  ok('listen cards reset the WebKit button alignment',
    Boolean(listen) && listen.cards.every((x) => x.alignItems === 'stretch'),
    JSON.stringify(listen?.cards.map((x) => x.alignItems)))
  ok('listen cards all share one identical width',
    Boolean(listen) && listen.cards.every((x) => close(x.box[0], listen.cards[0].box[0], 1)),
    JSON.stringify(listen?.cards.map((x) => x.box[0])))
  ok('listen cards fill the same column as find-image cards',
    Boolean(listen) && before.length === 4 && close(listen.cards[0].box[0], before[0].box[0], 1),
    `listen=${listen?.cards[0]?.box[0]} findImage=${before[0]?.box[0]}`)
  /* The exact WebKit bug: the anonymous flex box inside <button> inherits
     align-items:center, so .flip-inner shrink-wraps to the label width. */
  ok('WebKit button alignment is reset to stretch',
    before.length === 4 && before.every((x) => x.alignItems === 'stretch'),
    JSON.stringify(before.map((x) => x.alignItems)))
  ok('every inner box fills the whole card width',
    before.length === 4 && before.every((x) => close(x.inner[0], x.box[0], 1)),
    JSON.stringify(before.map((x) => [x.inner[0], x.box[0]])))
  ok('every face fills the whole card width',
    before.length === 4 && before.every((x) => close(x.face[0], x.box[0], 1)),
    JSON.stringify(before.map((x) => [x.face[0], x.box[0]])))
  ok('all four faces share one identical box',
    before.length === 4 && before.every((x) => close(x.face[0], before[0].face[0], 1) && close(x.face[1], before[0].face[1], 1)),
    JSON.stringify(before.map((x) => x.face)))
  ok('all four faces are 1:1 squares',
    before.length === 4 && before.every((x) => close(ratio(x.face), 1)),
    JSON.stringify(before.map((x) => +ratio(x.face).toFixed(3))))
  ok('all four flipped/word faces keep one identical box',
    after.length === 4 && after.every((x) => close(x.box[0], after[0].box[0], 1) && close(x.box[1], after[0].box[1], 1)),
    JSON.stringify(after.map((x) => x.box)))
  ok('all four boxes stay 1:1 after the reveal',
    after.length === 4 && after.every((x) => close(ratio(x.box), 1)),
    JSON.stringify(after.map((x) => +ratio(x.box).toFixed(3))))
  ok('the reveal is opacity-only (no 3D/squashing transform)',
    after.length === 4 && after.every((x) => x.transform === 'none'),
    JSON.stringify(after.map((x) => x.transform)))

  totalPass += pass; totalFail += fail
  console.log(`── ${label} : ${pass} passed, ${fail} failed ──`)
  results.push({ ...c, data })
}

/* Cross-engine parity: phone cards must be a scaled 1:1 desktop square. */
const desktop = results.find((r) => r.desktop)
if (desktop?.data?.before?.cards?.length === 4) {
  const ref = ratio(desktop.data.before.cards[0].face)
  for (const r of results.filter((x) => x.data?.before?.phone)) {
    const own = r.data.before.cards.map((x) => ratio(x.face))
    const same = own.length === 4 && own.every((v) => close(v, ref))
    if (same) totalPass++; else totalFail++
    console.log(`${same ? 'PASS' : 'FAIL'} parity: ${r.width}px WebKit ratio ${own.map((v) => v.toFixed(3)).join(', ')} matches desktop ${ref.toFixed(3)}`)
  }
} else {
  totalFail++
  console.log('FAIL parity: desktop reference geometry was never captured')
}

/* ── all six practice modes in the same WebKit engine ─────────────────
   The find-image bug was invisible to a Chrome-only suite; the other five
   modes had no WebKit coverage at all. tests/mobile-all-modes.html seeds a
   paused session directly in one mode and exposes __WEBKIT_PROBE(). */
const MODES = ['choice', 'listen', 'findImage', 'match', 'cloze', 'dictation']
const modeCases = []
for (const mode of MODES) {
  for (const width of [390, 360, 320]) {
    modeCases.push({ width, height: width === 390 ? 844 : width === 360 ? 740 : 700,
      mode, long: width === 320 })
  }
}
modeCases.push({ width: 390, height: 844, mode: 'choice', dark: true })
modeCases.push({ width: 390, height: 844, mode: 'listen', dark: true })
modeCases.push({ width: 390, height: 844, mode: 'findImage', dark: true })

console.log('\n── all practice modes in WKWebView ──')
const modeResults = []
for (const c of modeCases) {
  const label = `${c.mode} @ ${c.width}px${c.dark ? ' (dark)' : c.long ? ' (long words)' : ''}`
  const query = `mode=${c.mode}${c.long ? '&long=1' : ''}${c.dark ? '&dark=1' : ''}`
  const args = [String(c.width), String(c.height),
    '--page=tests/mobile-all-modes.html', `--query=${query}`]
  let raw
  try {
    raw = execFileSync(bin, args, {
      encoding: 'utf8', timeout: 90000, env: { ...process.env, FI_REPO: ROOT },
    })
  } catch (err) {
    console.log(`FAIL ${label}: probe did not finish :: ${err.message}`)
    totalFail++
    continue
  }
  const line = raw.split('\n').find((l) => l.startsWith('RESULT '))
  let data
  try { data = JSON.parse(line.slice('RESULT '.length)) } catch {
    console.log(`FAIL ${label}: malformed probe output :: ${raw.slice(0, 300)}`)
    totalFail++
    continue
  }
  const checks = Array.isArray(data.checks) ? data.checks : []
  const pass = checks.filter((x) => x.pass).length
  let fail = checks.filter((x) => !x.pass).length
  for (const x of checks.filter((x) => !x.pass)) {
    console.log(`  FAIL [${label}] ${x.name}${x.detail ? ' :: ' + x.detail : ''}`)
  }
  if (data.error || !checks.length) { fail++; console.log(`  FAIL [${label}] probe returned no checks :: ${data.error ?? 'empty'}`) }
  if (data.mode !== c.mode) { fail++; console.log(`  FAIL [${label}] wrong mode :: ${data.mode}`) }
  if (data.innerWidth !== c.width) { fail++; console.log(`  FAIL [${label}] wrong viewport :: ${data.innerWidth}`) }
  if (data.dark !== Boolean(c.dark)) { fail++; console.log(`  FAIL [${label}] wrong theme flag :: ${data.dark}`) }

  totalPass += pass; totalFail += fail
  modeResults.push({ ...c, data })
  console.log(`── ${label} : ${pass} passed, ${fail} failed ──`)
}

/* Every mode must be green at every phone width, and the dark suite must
   actually have exercised WebP illustrations. */
for (const mode of MODES) {
  const own = modeResults.filter((r) => r.mode === mode && !r.dark)
  const green = own.length === 3 && own.every((r) => r.data?.fail === 0 && r.data?.checks?.length > 0)
  if (green) totalPass++; else totalFail++
  console.log(`${green ? 'PASS' : 'FAIL'} coverage: ${mode} is green at 390 / 360 / 320px in WebKit`)
}
const darkCases = modeResults.filter((r) => r.dark)
if (darkCases.length === 3 && darkCases.every((r) => r.data?.theme === 'dark' && r.data?.fail === 0)) {
  totalPass++
  console.log('PASS coverage: dark-theme WebP illustrations render in WebKit')
} else {
  totalFail++
  console.log('FAIL coverage: dark-theme WebP illustrations were not verified')
}
/* A vacuous pass is impossible: both light and dark cases must show real
   WebP srcs, and no case may show a theme-dependent variant. */
const srcsOf = (r) => r.data?.geometry?.imgSrcs ?? []
const webpSrcs = (r) => srcsOf(r).filter((s) => /\.webp$/i.test(s))
const darkWebpSeen = darkCases.some((r) => webpSrcs(r).length > 0)
const lightWebpSeen = modeResults.filter((r) => !r.dark)
  .some((r) => webpSrcs(r).length > 0)
if (darkWebpSeen) totalPass++; else totalFail++
console.log(`${darkWebpSeen ? 'PASS' : 'FAIL'} coverage: a WebP src was actually rendered in dark theme`)
if (lightWebpSeen) totalPass++; else totalFail++
console.log(`${lightWebpSeen ? 'PASS' : 'FAIL'} coverage: a WebP src was actually rendered in light theme`)
const badThemePaths = modeResults.flatMap((r) => srcsOf(r)
  .filter((s) => /\.dark\./i.test(s) || !/\.webp$/i.test(s)))
if (badThemePaths.length === 0) totalPass++; else totalFail++
console.log(`${badThemePaths.length === 0 ? 'PASS' : 'FAIL'} coverage: every illustration path is a theme-neutral WebP :: ${JSON.stringify(badThemePaths.slice(0, 5))}`)

console.log(`\nWebKit full-mode regression: ${totalPass} passed, ${totalFail} failed`)
cleanup(totalFail ? 1 : 0)
