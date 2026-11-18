/* Real-WebKit regression for the find-image (找图) option cards.
 *
 * scripts/test-mobile.mjs drives headless Chrome/Blink through CDP, which
 * hides WebKit-only button layout bugs. This runner compiles
 * tests/webkit-find-image.swift into a WKWebView probe (the engine behind
 * iOS Safari and WeChat in-app WebViews), measures the four option boxes at
 * desktop and phone widths, taps the correct card, and compares every ratio
 * with the desktop 3:2 reference.
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
  ok('all four faces are 3:2',
    before.length === 4 && before.every((x) => close(ratio(x.face), 1.5)),
    JSON.stringify(before.map((x) => +ratio(x.face).toFixed(3))))
  ok('all four flipped/word faces keep one identical box',
    after.length === 4 && after.every((x) => close(x.box[0], after[0].box[0], 1) && close(x.box[1], after[0].box[1], 1)),
    JSON.stringify(after.map((x) => x.box)))
  ok('all four boxes stay 3:2 after the reveal',
    after.length === 4 && after.every((x) => close(ratio(x.box), 1.5)),
    JSON.stringify(after.map((x) => +ratio(x.box).toFixed(3))))
  ok('the reveal is opacity-only (no 3D/squashing transform)',
    after.length === 4 && after.every((x) => x.transform === 'none'),
    JSON.stringify(after.map((x) => x.transform)))

  totalPass += pass; totalFail += fail
  console.log(`── ${label} : ${pass} passed, ${fail} failed ──`)
  results.push({ ...c, data })
}

/* Cross-engine parity: phone cards must be a scaled 3:2 desktop card. */
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

console.log(`\nWebKit find-image regression: ${totalPass} passed, ${totalFail} failed`)
cleanup(totalFail ? 1 : 0)
