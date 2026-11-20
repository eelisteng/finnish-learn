/* Real-WebKit geometry probe for the practice option cards.
 *
 * Chrome passes the layout because Blink ignores `align-items` on a block
 * button. WebKit keeps an anonymous flex box inside every <button>, so an
 * inherited `align-items:center` shrink-wraps the face to the label width:
 * four words => four different card widths => four different 3:2 heights.
 * This harness runs the browser assertion pages inside a WKWebView (the
 * engine used by iOS Safari and WeChat's in-app browser). It is driven by
 * scripts/test-webkit.mjs, which compiles and parses it.
 *
 *   swiftc -O tests/webkit-find-image.swift -o /tmp/fi-webkit-probe
 *   /tmp/fi-webkit-probe 390 844 [--long]
 *   /tmp/fi-webkit-probe 390 844 --page=tests/mobile-all-modes.html --query=mode=choice
 *
 * Output is one line: RESULT {json}. A page that exposes
 * window.__WEBKIT_PROBE() is measured through that hook (all-modes page);
 * otherwise the original find-image before/after-tap flow is used.
 */
import AppKit
import WebKit

let width = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 390 : 390
let height = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 844 : 844
let isLong = CommandLine.arguments.contains("--long")
var root = URL(fileURLWithPath: "/Users/eelisteng/Workspaces/finnish-learn", isDirectory: true)

/* Allow the harness to live in a checkout at any path. */
let repoFromEnv = ProcessInfo.processInfo.environment["FI_REPO"]
if let repoFromEnv { root = URL(fileURLWithPath: repoFromEnv, isDirectory: true) }
let pageArg = CommandLine.arguments.first(where: { $0.hasPrefix("--page=") })?.dropFirst(7)
let queryArg = CommandLine.arguments.first(where: { $0.hasPrefix("--query=") })?.dropFirst(8)
let page = root.appendingPathComponent(pageArg.map(String.init) ?? "tests/mobile-find-image.html")
let defaultQuery = queryArg.map(String.init) ?? (isLong ? "long=1" : "")

let beforeJS = """
(function(){
  const rect = el => { const r = el.getBoundingClientRect(); return [+r.width.toFixed(2), +r.height.toFixed(2)] };
  const cards = [...document.querySelectorAll('.optcard')];
  const grid = document.querySelector('.optcards.find-image');
  const stage = document.querySelector('.stage');
  /* The listen (听选) grid shares .optcard with find-image. WebKit's button
     shrink-wrap used to make those cards 4px narrower than the grid track,
     so measure a temporary copy inside the very same .stage. */
  const probe = document.createElement('div');
  probe.className = 'optcards with-meaning';
  probe.innerHTML = [0,1,2,3].map(i =>
    '<button class="optcard"><span class="num">' + (i+1) + '</span>' +
    '<span class="optcard-pic"></span><span class="optcard-meaning">' +
    '<span class="om zh">商店</span><span class="om en">shop</span></span></button>').join('');
  stage.appendChild(probe);
  const listen = {
    cols: getComputedStyle(probe).gridTemplateColumns.split(/\\s+/).filter(Boolean).length,
    gridWidth: rect(probe)[0],
    cards: [...probe.querySelectorAll('.optcard')].map(c => ({
      box: rect(c), alignItems: getComputedStyle(c).alignItems })),
  };
  probe.remove();
  return JSON.stringify({
    innerWidth: window.innerWidth,
    phone: window.innerWidth <= 640,
    cols: getComputedStyle(grid).gridTemplateColumns.split(/\\s+/).filter(Boolean).length,
    supportsAspectRatio: CSS.supports('aspect-ratio', '3 / 2'),
    listen,
    cards: cards.map(c => {
      const f = c.querySelector('.flip-face'), i = c.querySelector('.flip-inner');
      return { box: rect(c), inner: rect(i), face: rect(f),
               alignItems: getComputedStyle(c).alignItems,
               aspectRatio: getComputedStyle(f).aspectRatio,
               label: c.querySelector('.optcard-label')?.textContent ?? '' };
    }),
    geometry: window.__geometry
  });
})()
"""

let afterJS = """
(function(){
  const rect = el => { const r = el.getBoundingClientRect(); return [+r.width.toFixed(2), +r.height.toFixed(2)] };
  const cards = [...document.querySelectorAll('.optcard')];
  const assertions = window.__afterTap ? window.__afterTap() : 'FAIL harness: no __afterTap';
  return JSON.stringify({
    assertions,
    cards: cards.map(c => {
      const f = c.querySelector('.flip-face'), i = c.querySelector('.flip-inner');
      return { box: [f.offsetWidth, f.offsetHeight], rect: rect(f),
               transform: getComputedStyle(i).transform, cls: c.className };
    })
  });
})()
"""

final class Probe: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let window: NSWindow
    let width: Int
    let height: Int
    let isLong: Bool

    init(width: Int, height: Int, isLong: Bool) {
        self.width = width; self.height = height; self.isLong = isLong
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: cfg)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                          styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        super.init()
        web.navigationDelegate = self
        window.contentView = web
        /* Near-transparent so the test never flashes a window on screen, but
           still attached to a real window so WebKit performs layout. */
        window.alphaValue = 0.02
        window.makeKeyAndOrderFront(nil)
        web.layoutSubtreeIfNeeded()
    }

    func eval(_ js: String, _ done: @escaping (String) -> Void) {
        web.evaluateJavaScript(js) { out, err in
            if let err = err { done("{\"error\":\(Self.quote(err.localizedDescription))}") }
            else if let s = out as? String { done(s) }
            else { done("{\"error\":\"non-string result\"}") }
        }
    }

    static func quote(_ s: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [s], options: [])
        let json = String(data: data, encoding: .utf8)!
        return String(json.dropFirst().dropLast())
    }

    func emit(_ extra: String) {
        print("RESULT {\"width\":\(width),\"height\":\(height),\"long\":\(isLong),\(extra)}")
        fflush(stdout)
        window.close()
        DispatchQueue.main.async { NSApplication.shared.terminate(nil) }
    }

    func fail(_ reason: String) { emit("\"error\":\(Self.quote(reason))") }

    func start() {
        let target = URL(string: "file://\(page.path)\(defaultQuery.isEmpty ? "" : "?\(defaultQuery)")")!
        web.loadFileURL(target, allowingReadAccessTo: root)
        waitReady(attempt: 0)
    }

    func emitRaw(_ json: String) {
        print("RESULT \(json)")
        fflush(stdout)
        window.close()
        DispatchQueue.main.async { NSApplication.shared.terminate(nil) }
    }

    func generic() {
        eval("window.__WEBKIT_PROBE()") { json in
            self.emitRaw(json)
        }
    }

    func waitReady(attempt: Int) {
        eval("(function(){try{return String(document.getElementById('out')?.textContent ?? '')}catch(e){return 'ERR'}})()") { r in
            if r.contains("WAITING_FOR_PROBE") { self.generic() }
            else if r.contains("WAITING_FOR_TAP") { self.before() }
            else if r.contains("FAIL ") { self.fail("harness: \(r)") }
            else if attempt < 100 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.waitReady(attempt: attempt + 1) }
            } else { self.fail("harness timed out waiting for the tap stage") }
        }
    }

    func before() {
        eval(beforeJS) { before in
            let clickJS = "(function(){const c=document.querySelectorAll('.optcard')[window.__correctIdx]; c.click(); return 'clicked'})()"
            self.eval(clickJS) { _ in
                /* DELAY.flipReward is 1500ms outside FAST_TEST; 700ms lands
                   after the 420ms reveal and before the next question. */
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                    self.eval(afterJS) { after in
                        self.emit("\"before\":\(before),\"after\":\(after)")
                    }
                }
            }
        }
    }
}

let app = NSApplication.shared
let probe = Probe(width: width, height: height, isLong: isLong)
probe.start()
app.run()
