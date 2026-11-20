/**
 * Replace the app's illustrations with higher-quality WebP art from the
 * sibling Word Atlas project (word-atlas-main/public/atlas/img, CC BY 4.0).
 *
 * The source art is keyed by ENGLISH word (house.webp, car.webp ...), while
 * this workbook is keyed by FINNISH lemma (talo, auto ...). There is no
 * literal same-name overlap, so images are matched by meaning through a
 * deterministic resolution chain:
 *
 *   1. explicit per-word overrides (curated; 101 words with no literal match)
 *   2. English gloss -> exact source filename (normalised)
 *   3. English gloss -> de-"to" / singular / de-parenthesis variant
 *   4. motif fallback
 *   5. Chinese gloss -> exact Word Atlas Chinese sense -> its English id
 *
 * All 980 words receive a distinct WebP (function words, numerals and
 * grammatical terms use the closest available image), each file is copied to
 * assets/illustrations/<word-id>.webp so the runtime path pattern is stable,
 * and words.csv is rewritten with the new provenance columns.
 *
 *   node scripts/import-atlas-images.mjs            # import + rewrite CSV
 *   node scripts/import-atlas-images.mjs --check    # verify determinism, write nothing
 *
 * Re-running with unchanged inputs is byte-stable: no timestamps, no random
 * numbers, sorted iteration. import-a1-b1.mjs resets the image columns, so
 * the rebuild order is: import-a1-b1 -> import-atlas-images -> build-content
 * -> build-groups.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORD_COLS, readCsvFiles, serializeCSV } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORDS_CSV = join(root, 'data', 'words.csv')
const ATLAS_IMG = join(root, '..', 'word-atlas-main', 'public', 'atlas', 'img')
const ATLAS_THUMB = join(root, '..', 'word-atlas-main', 'public', 'atlas', 'thumb')
const ATLAS_DATA = join(root, '..', 'word-atlas-main', 'data', 'word-atlas.json')
const OUT_DIR = join(root, 'assets', 'illustrations')
const IMAGE_DIR = 'assets/illustrations/'
const REPORT = join(root, 'data', 'import', 'atlas-image-report.json')
const REVIEW = join(root, 'tools', 'illustration-review.html')

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')

const sha = (s) => createHash('sha256').update(s).digest('hex')
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const norm = (s) => String(s ?? '').toLowerCase().trim()
  .replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+$/, '')
const singular = (s) => {
  if (/ies$/.test(s)) return s.replace(/ies$/, 'y')
  if (/(ches|shes|sses|xes|zes)$/.test(s)) return s.replace(/es$/, '')
  if (/s$/.test(s) && !/ss$/.test(s)) return s.replace(/s$/, '')
  return s
}

/* Distinct alternates for concepts whose best image is already taken by a
   synonym. Order matters: each word gets the first free name from its list. */
const ALTERNATES = {
  house: ['home', 'housing', 'household', 'residence', 'building'],
  home: ['household', 'housing', 'residence', 'house', 'family'],
  asua: ['resident', 'residence', 'dwelling', 'live'],
  eye: ['eyesight', 'eyebrow', 'eyelid', 'vision'],
  name: ['rename', 'nameless', 'label', 'title'],
  age: ['elderly', 'aging', 'adult', 'senior'],
  morning: ['sunrise', 'dawn', 'breakfast', 'am'],
  second: ['minute', 'hour', 'moment', 'clock'],
  many: ['numerous', 'plenty', 'abundant', 'several'],
  half: ['quarter', 'portion', 'fraction', 'split'],
  orange: ['tangerine', 'citrus', 'orange-juice', 'fruit'],
  light: ['lamp', 'lighting', 'brightness', 'sunlight', 'daylight'],
  hand: ['handful', 'finger', 'handy', 'palm'],
  like: ['favorite', 'enjoy', 'love', 'prefer'],
  job: ['work', 'worker', 'employment', 'occupation', 'labor'],
  understand: ['comprehend', 'grasp', 'realize', 'know'],
  station: ['terminal', 'platform', 'depot', 'stop'],
  stop: ['halt', 'pause', 'end', 'station'],
  person: ['human', 'someone', 'individual', 'people'],
  that: ['those', 'these', 'this', 'which'],
  nearby: ['near', 'vicinity', 'around', 'close'],
  happy: ['joy', 'cheerful', 'delighted', 'happiness'],
  fear: ['afraid', 'fright', 'terror', 'anxiety'],
  angry: ['anger', 'furious', 'mad', 'rage'],
  health: ['healthy', 'wellness', 'fitness', 'medicine'],
  arrive: ['arrival', 'reach', 'land', 'enter'],
  break: ['broken', 'fracture', 'crack', 'smash'],
  bank: ['banker', 'banking', 'account', 'money'],
  because: ['reason', 'cause', 'therefore', 'since'],
  notice: ['attention', 'observe', 'remark', 'announcement'],
  book: ['bookshop', 'reading', 'novel', 'paperback'],
  work: ['working', 'workplace', 'task', 'labor'],
  study: ['student', 'studying', 'learning', 'education'],
  travel: ['journey', 'trip', 'tour', 'tourist'],
  food: ['meal', 'cuisine', 'dish', 'nutrition'],
  family: ['relative', 'household', 'parents', 'kin'],
  body: ['physique', 'figure', 'human', 'anatomy'],
  weather: ['climate', 'forecast', 'rain', 'sunny'],
  number: ['numerous', 'amount', 'quantity', 'count'],
  calendar: ['date', 'schedule', 'month', 'year'],
  emotion: ['feeling', 'mood', 'sentiment', 'passion'],
  thought: ['thinking', 'idea', 'mind', 'consider'],
  sport: ['athlete', 'exercise', 'game', 'fitness'],
  clothes: ['clothing', 'garment', 'fashion', 'outfit'],
  art: ['artist', 'paint', 'gallery', 'creative'],
  media: ['news', 'journalism', 'broadcast', 'press'],
  finance: ['money', 'economy', 'banking', 'investment'],
  city: ['urban', 'town', 'downtown', 'municipal'],
  country: ['nation', 'national', 'citizen', 'homeland'],
  water: ['liquid', 'river', 'ocean', 'drink'],
  fire: ['flame', 'burn', 'fireman', 'blaze'],
  earth: ['soil', 'ground', 'planet', 'land'],
  air: ['oxygen', 'breeze', 'atmosphere', 'wind'],
  flower: ['blossom', 'bloom', 'petal', 'garden'],
  tree: ['forest', 'wood', 'branch', 'leaf'],
  summer: ['heat', 'sun', 'vacation', 'season'],
  winter: ['snow', 'cold', 'season', 'ice'],
  spring: ['blossom', 'bloom', 'season', 'growth'],
  autumn: ['fall', 'harvest', 'season', 'leaf'],
  time: ['clock', 'hour', 'moment', 'schedule'],
  money: ['cash', 'currency', 'coin', 'wealth'],
  shop: ['store', 'shopping', 'market', 'mall'],
  transport: ['vehicle', 'bus', 'train', 'bicycle'],
  bicycle: ['bike', 'cycling', 'ride', 'bicycle'],
  bus: ['coach', 'vehicle', 'transport', 'stop'],
  train: ['railway', 'station', 'locomotive', 'transport'],
  airplane: ['flight', 'airport', 'aircraft', 'travel'],
  road: ['street', 'highway', 'path', 'route'],
  street: ['road', 'sidewalk', 'avenue', 'neighborhood'],
  building: ['construction', 'architecture', 'tower', 'house'],
  restaurant: ['dining', 'cafe', 'meal', 'menu'],
  hotel: ['accommodation', 'room', 'resort', 'lodging'],
  cafe: ['coffee', 'restaurant', 'drink', 'shop'],
  library: ['books', 'reading', 'librarian', 'study'],
  museum: ['gallery', 'exhibit', 'art', 'history'],
  market: ['shopping', 'sale', 'bazaar', 'trade'],
  hospital: ['clinic', 'doctor', 'medicine', 'patient'],
  pharmacy: ['medicine', 'drug', 'chemist', 'health'],
  park: ['garden', 'recreation', 'green', 'outdoor'],
  forest: ['woods', 'trees', 'nature', 'jungle'],
  beach: ['coast', 'sand', 'sea', 'shore'],
  mountain: ['hill', 'peak', 'climb', 'landscape'],
  river: ['stream', 'water', 'bank', 'flow'],
  lake: ['water', 'pond', 'reservoir', 'nature'],
  sea: ['ocean', 'waves', 'coast', 'marine'],
  island: ['coast', 'beach', 'ocean', 'land'],
  farm: ['agriculture', 'farmer', 'crop', 'field'],
  kitchen: ['cooking', 'cook', 'meal', 'stove'],
  bedroom: ['bed', 'sleep', 'room', 'home'],
  bathroom: ['bath', 'shower', 'room', 'clean'],
  garden: ['flowers', 'park', 'plant', 'nature'],
  father: ['dad', 'parent', 'family', 'man'],
  mother: ['mom', 'parent', 'family', 'woman'],
  child: ['kid', 'children', 'baby', 'family'],
  brother: ['sibling', 'family', 'man', 'sister'],
  sister: ['sibling', 'family', 'woman', 'brother'],
  friend: ['companion', 'buddy', 'relationship', 'people'],
  neighbor: ['neighbour', 'neighborhood', 'resident', 'community'],
  baby: ['infant', 'child', 'newborn', 'family'],
  adult: ['grown-up', 'mature', 'person', 'elderly'],
  man: ['male', 'gentleman', 'person', 'human'],
  woman: ['female', 'lady', 'person', 'human'],
  boy: ['child', 'male', 'kid', 'student'],
  girl: ['child', 'female', 'kid', 'student'],
  teacher: ['teaching', 'school', 'instructor', 'education'],
  doctor: ['physician', 'medicine', 'hospital', 'patient'],
  nurse: ['hospital', 'care', 'medicine', 'patient'],
  driver: ['driving', 'vehicle', 'car', 'license'],
  farmer: ['farm', 'agriculture', 'crop', 'field'],
  artist: ['art', 'creative', 'paint', 'gallery'],
  singer: ['song', 'music', 'voice', 'concert'],
  writer: ['writing', 'book', 'author', 'novel'],
  scientist: ['science', 'research', 'laboratory', 'experiment'],
  engineer: ['technology', 'design', 'construction', 'machine'],
  manager: ['management', 'office', 'business', 'leader'],
  customer: ['client', 'shopping', 'buyer', 'sale'],
  patient: ['hospital', 'doctor', 'medicine', 'care'],
  citizen: ['nationality', 'country', 'community', 'law'],
  tourist: ['travel', 'tourism', 'sightseeing', 'visitor'],
  stranger: ['unknown', 'outsider', 'person', 'unfamiliar'],
  relative: ['family', 'kin', 'relationship', 'parent'],
  colleague: ['worker', 'office', 'team', 'coworker'],
  guest: ['visitor', 'host', 'invite', 'hospitality'],
  host: ['guest', 'invite', 'hospitality', 'entertain'],
  owner: ['property', 'possession', 'business', 'landlord'],
  visitor: ['guest', 'tourist', 'arrival', 'visit'],
  member: ['membership', 'group', 'club', 'organization'],
  partner: ['couple', 'relationship', 'team', 'business'],
  crowd: ['people', 'audience', 'mass', 'gathering'],
  audience: ['crowd', 'concert', 'theater', 'spectator'],
  team: ['group', 'sport', 'player', 'collaboration'],
  group: ['team', 'crowd', 'organization', 'community'],
  club: ['member', 'group', 'organization', 'social'],
  organization: ['company', 'business', 'institution', 'management'],
  company: ['business', 'office', 'corporation', 'firm'],
  factory: ['industrial', 'manufacture', 'worker', 'production'],
  office: ['work', 'business', 'desk', 'company'],
  law: ['legal', 'court', 'justice', 'rule'],
  court: ['law', 'judge', 'justice', 'legal'],
  police: ['officer', 'law', 'security', 'patrol'],
  officer: ['police', 'military', 'official', 'authority'],
  soldier: ['army', 'military', 'war', 'uniform'],
  fireman: ['fire', 'rescue', 'uniform', 'emergency'],
}

/* Curated source image for every Finnish word whose gloss has no literal
   English source image. Every value was checked against the atlas image
   inventory. Abstract words use a concrete, visually closest image. */
const OVERRIDES = {
  'xw-etunimi': 'name', 'xw-sukunimi': 'surname', 'xw-puhelinnumero': 'telephone',
  'xw-suomi': 'flag', 'xw-toukokuu': 'blossom',
  // numerals: the atlas has only a partial set of cardinal images
  'xw-kaksi': 'pair', 'xw-kolme': 'triangle', 'xw-viisi': 'hand', 'xw-kuusi': 'half',
  'xw-seitseman': 'seventh', 'xw-kahdeksan': 'eighth', 'xw-kymmenen': 'tenth',
  'xw-yksitoista': 'dozen', 'xw-kolmetoista': 'teenager', 'xw-neljatoista': 'fortnight',
  'xw-viisitoista': 'quarter', 'xw-kaksikymmenta': 'score',
  // household / places
  'xw-pesukone': 'laundry', 'xw-rautatieasema': 'station', 'xw-bussipysakki': 'stop',
  'xw-liikennevalo': 'traffic', 'xw-kaukana': 'far', 'xw-suoraan': 'ahead',
  // verbs
  'xw-menna': 'depart', 'xw-pelata': 'game', 'xw-palauttaa': 'refund',
  'xw-tuulla': 'wind', 'xw-suuttua': 'angry', 'xw-huolehtia': 'care',
  'xw-kiinnostua': 'interest', 'xw-myohastya': 'late',
  // pronouns / function words
  'xw-mina': 'myself', 'xw-sina': 'yourself', 'xw-han': 'person', 'xw-me': 'our',
  'xw-te': 'your', 'xw-tama': 'that', 'xw-kuka': 'someone', 'xw-missa': 'location',
  'xw-mista': 'wherever', 'xw-mihin': 'destination', 'xw-miten': 'question',
  'xw-kuinka': 'question', 'xw-joo': 'agreement', 'xw-taalla': 'nearby',
  'xw-ulos': 'outside', 'xw-kanssa': 'together', 'xw-itse': 'yourself',
  'xw-silloin': 'since', 'xw-varten': 'purpose', 'xw-jotta': 'purpose',
  'xw-eli': 'definition', 'xw-toisaalta': 'side', 'xw-ainakin': 'minimum',
  'xw-samalla': 'meanwhile',
  // work / education / shopping / services
  'xw-ammattikoulu': 'school', 'xw-tentti': 'exam', 'xw-tavu': 'spelling',
  'xw-tyosopimus': 'labor', 'xw-tyohaastattelu': 'interview', 'xw-vuorotyo': 'job',
  'xw-tyottomyys': 'unemployed', 'xw-myyja': 'salesman', 'xw-kauppias': 'seller',
  'xw-ostoslista': 'list', 'xw-karry': 'shopping', 'xw-pankkikortti': 'bank',
  'xw-luottokortti': 'credit', 'xw-seteli': 'cash', 'xw-parturi': 'barber',
  'xw-kampaamo': 'hairdresser', 'xw-korjaamo': 'garage',
  // emotion / daily / objects
  'xw-onnellinen': 'happiness', 'xw-arki': 'routine', 'xw-imuri': 'vacuum',
  'xw-paistinpannu': 'pan', 'xw-salama': 'thunder',
  // society / abstract B1
  'xw-maahanmuuttaja': 'immigration', 'xw-maahanmuutto': 'immigration',
  'xw-kotoutuminen': 'society', 'xw-viranomainen': 'government',
  'xw-pankkitili': 'account', 'xw-arvonlisavero': 'tax', 'xw-talouskasvu': 'growth',
  'xw-kannattava': 'profit', 'xw-verkkosivu': 'internet',
  'xw-sosiaalinen-media': 'community', 'xw-tietoturva': 'information',
  'xw-matkakohde': 'purpose', 'xw-huonevaraus': 'room',
  'xw-henkilollisyystodistus': 'identity', 'xw-matkavakuutus': 'travel',
  'xw-hyvinvointi': 'health', 'xw-liikunta': 'exercise', 'xw-mielenterveys': 'mental',
  'xw-diagnoosi': 'diagnose', 'xw-ravitseva': 'nutrition', 'xw-passiivinen': 'idle',
  'xw-syva': 'depth', 'xw-laadukas': 'quality', 'xw-osoittautua': 'prove',
}

const splitZh = (s) => String(s ?? '').split(/[；;，,、\/\s（）()]+/).map((x) => x.trim()).filter(Boolean)

function buildIndex(sourceNames, atlas) {
  const enNames = new Set(sourceNames)
  const zhExact = new Map()
  for (const w of atlas) {
    if (!enNames.has(w.id)) continue
    for (const sense of w.senses ?? []) {
      for (const z of splitZh(sense.zh)) {
        if (z.length < 2) continue
        if (!zhExact.has(z)) zhExact.set(z, [])
        if (!zhExact.get(z).includes(w.id)) zhExact.get(z).push(w.id)
      }
    }
  }
  return { enNames, zhExact }
}

function enCandidates(row) {
  const out = []
  const add = (x) => { const n = norm(x); if (n && !out.includes(n)) out.push(n) }
  for (const e of String(row.sense_en ?? '').split(/[,;/]/)) {
    const t = e.trim()
    add(t)
    add(t.replace(/^to\s+/i, ''))
    add(singular(t.replace(/^to\s+/i, '')))
    add(t.replace(/\s*\([^)]*\)/g, ''))
    add(singular(t.replace(/\s*\([^)]*\)/g, '')))
  }
  add(row.motif)
  add(singular(norm(row.motif)))
  return out
}

function resolve(row, index) {
  const override = OVERRIDES[row.id]
  if (override && index.enNames.has(override)) return { name: override, method: 'override' }
  for (const n of enCandidates(row)) {
    if (index.enNames.has(n)) return { name: n, method: 'en-gloss' }
  }
  for (const z of splitZh(row.sense_zh)) {
    const ids = index.zhExact.get(z)
    if (ids?.length) return { name: ids[0], method: 'zh-sense' }
  }
  throw new Error(`No image mapping for ${row.id} (${row.lemma})`)
}

function verifyFiles(wordRows, mappings, shared = []) {
  const problems = []
  const used = new Map()
  for (const s of shared) problems.push(`shared image ${s.name}: ${s.id}`)
  for (const row of wordRows) {
    const m = mappings.get(row.id)
    const src = join(ATLAS_IMG, `${m.name}.webp`)
    if (!existsSync(src)) problems.push(`missing source ${m.name}.webp for ${row.id}`)
    if (used.has(m.name)) problems.push(`shared image ${m.name}: ${used.get(m.name)} + ${row.id}`)
    used.set(m.name, row.id)
    const dest = join(root, `${IMAGE_DIR}${row.id}.webp`)
    if (existsSync(dest)) {
      const head = readFileSync(dest).subarray(0, 12)
      if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WEBP') {
        problems.push(`not a webp ${row.id}.webp`)
      }
    }
  }
  return { count: used.size, problems }
}

function renderReview(wordRows, mappings) {
  const items = wordRows.map((row) => {
    const m = mappings.get(row.id)
    // The review gallery only needs to show meaning, so inline the 256px
    // thumbnails: a full-res gallery would be ~33MB of base64 and render
    // slowly in preview panels. Shipped art stays 512x512.
    const data = readFileSync(join(ATLAS_THUMB, `${m.name}.webp`)).toString('base64')
    return { id: row.id, lemma: row.lemma, zh: row.sense_zh, en: row.sense_en,
      source: m.name, method: m.method, src: `data:image/webp;base64,${data}` }
  })
  const counts = {}
  items.forEach((i) => { counts[i.method] = (counts[i.method] ?? 0) + 1 })
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebP 插画审阅 · Word Atlas CC BY 4.0</title>
<style>
:root{--bg:#f4f7fa;--surface:#fff;--line:#e1e8ef;--text:#1c2b3a;--muted:#6b7c8d}
*{box-sizing:border-box}
body{margin:0;padding:18px;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
h1{font-size:20px;margin:0 0 6px}
.note{font-size:12px;color:var(--muted);max-width:900px;margin:0 0 12px}
.count{color:var(--muted);font-size:12px;margin:0 0 10px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
input,select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);font-size:14px}
input{flex:1;min-width:220px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center}
.card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:var(--bg)}
.fi{font-family:ui-monospace,Menlo,monospace;font-weight:600;margin-top:7px;word-break:break-word}
.zh{font-size:13px}.en{font-size:11px;color:var(--muted)}
.meta{font-size:10px;color:var(--muted);margin-top:4px;word-break:break-word}
</style></head><body>
<h1>WebP 插画审阅 / Illustration review</h1>
<p class="note">980 张图全部来自 <b>Word Atlas</b> (<code>word-atlas-main/public/atlas/img</code>)，512×512 WebP，按词义匹配芬兰语词条。许可：<b>CC BY 4.0</b>，署名 Word Atlas contributors；原图复制并按芬兰语词 id 重命名，未做视觉修改。每个词条一张、互不重复；数字 / 功能词使用最接近的近似图。图片以 base64 内嵌，本页完全自包含，可离线 / <code>file://</code> 打开。匹配统计：${esc(JSON.stringify(counts))}。</p>
<div class="bar"><input id="q" type="search" placeholder="搜索芬兰语 / 中文 / English / 源图名…" aria-label="search">
<select id="m"><option value="">全部匹配方式</option></select><span class="count" id="c"></span></div>
<div class="grid" id="grid"></div>
<script>
const DATA=${JSON.stringify(items).replace(/</g, '\\u003c')};
const m=document.getElementById('m');
[...new Set(DATA.map(d=>d.method))].sort().forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;m.appendChild(o)});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function draw(){const q=document.getElementById('q').value.trim().toLowerCase(),mv=m.value;
  const list=DATA.filter(d=>(!mv||d.method===mv)&&(!q||[d.lemma,d.zh,d.en,d.source,d.id].join(' ').toLowerCase().includes(q)));
  document.getElementById('c').textContent='显示 '+list.length+' / '+DATA.length;
  document.getElementById('grid').innerHTML=list.map(d=>'<div class="card"><img src="'+d.src+'" alt="'+esc(d.lemma)+'"><div class="fi">'+esc(d.lemma)+'</div><div class="zh">'+esc(d.zh)+'</div><div class="en">'+esc(d.en)+'</div><div class="meta">'+esc(d.source)+' · '+esc(d.method)+'</div></div>').join('');
}
document.getElementById('q').addEventListener('input',draw);m.addEventListener('change',draw);draw();
</script></body></html>\n`
}

/* ── main ───────────────────────────────────────────────────────────────── */
if (!existsSync(ATLAS_IMG) || !existsSync(ATLAS_DATA)) {
  console.error('Word Atlas source not found:', ATLAS_IMG, ATLAS_DATA)
  process.exit(1)
}
const { wordRows } = readCsvFiles()
const atlas = JSON.parse(readFileSync(ATLAS_DATA, 'utf8'))
const sourceNames = readdirSync(ATLAS_IMG).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort()
const index = buildIndex(sourceNames, atlas)
/* Deterministic greedy assignment: primary match wins, then curated
   alternates in order; a name is handed out only once. Word order is the CSV
   order, so the result is byte-stable across runs. */
const mappings = new Map()
const usedNames = new Set()
const shared = []
for (const r of wordRows) {
  const primary = resolve(r, index)
  let chosen = primary
  if (usedNames.has(primary.name)) {
    const alternates = ALTERNATES[primary.name] ?? []
    const free = alternates.find((a) => index.enNames.has(a) && !usedNames.has(a))
    if (free) {
      chosen = { name: free, method: 'alternate' }
    } else {
      // Last resort: any semantically related synonym from Word Atlas whose
      // image is still free, keyed by the primary English name.
      const related = atlas.find((w) => w.id === primary.name)
      const pool = [...(related?.syn ?? []), ...(related?.fam ?? [])]
        .map((s) => norm(String(s).replace(/\s*\([^)]*\)/g, '')))
        .filter((s) => index.enNames.has(s) && !usedNames.has(s))
      if (pool.length) {
        chosen = { name: pool[0], method: 'related' }
      } else {
        // Final fallbacks narrow from same topic+level, to same level, to any
        // free image. Atlas order is fixed, so this stays deterministic and
        // guarantees all 980 words receive a distinct picture.
        const pick = (pred) => atlas.find((w) => pred(w)
          && index.enNames.has(w.id) && !usedNames.has(w.id))?.id
        const name = pick((w) => w.topic === r.topicId && w.cefr === r.cefr)
          ?? pick((w) => w.cefr === r.cefr)
          ?? pick(() => true)
        if (name) chosen = { name, method: 'topic' }
        else shared.push({ id: r.id, name: primary.name })
      }
    }
  }
  mappings.set(r.id, chosen)
  usedNames.add(chosen.name)
}
const stats = verifyFiles(wordRows, mappings, shared)
const methodCounts = {}
mappings.forEach((m) => { methodCounts[m.method] = (methodCounts[m.method] ?? 0) + 1 })
const hashes = {}
for (const r of wordRows) hashes[r.id] = sha(readFileSync(join(ATLAS_IMG, `${mappings.get(r.id).name}.webp`)).toString('base64'))

const report = {
  source: {
    project: 'word-atlas-main',
    imageDir: 'public/atlas/img',
    license: 'CC BY 4.0',
    attribution: 'Word Atlas contributors — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    modifications: 'Images copied and renamed to <finnish-word-id>.webp; no visual edits.',
  },
  matching: {
    words: wordRows.length, sourceImages: sourceNames.length,
    mappedImages: stats.count, unique: stats.count === wordRows.length,
    methods: methodCounts,
    note: 'English gloss exact/variant -> Word Atlas Chinese sense -> curated override. Function words and numerals use the closest available image.',
  },
  problems: stats.problems,
  words: wordRows.map((r) => ({ id: r.id, lemma: r.lemma, zh: r.sense_zh,
    image: `${IMAGE_DIR}${r.id}.webp`, source: `${mappings.get(r.id).name}.webp`,
    method: mappings.get(r.id).method, sha256: hashes[r.id] })),
}
const reportText = `${JSON.stringify(report, null, 2)}\n`

if (CHECK_ONLY) {
  const drift = []
  if (!existsSync(REPORT) || reportText !== readFileSync(REPORT, 'utf8')) drift.push('atlas-image-report.json')
  for (const r of wordRows) {
    const rel = `${IMAGE_DIR}${r.id}.webp`
    const dest = join(root, rel)
    if (!existsSync(dest)) { drift.push(`missing ${rel}`); continue }
    if (sha(readFileSync(dest).toString('base64')) !== hashes[r.id]) drift.push(rel)
  }
  console.log(`Check: ${wordRows.length} words, ${stats.count} unique WebP, ${stats.problems.length} problem(s)`)
  console.log(`  methods: ${JSON.stringify(methodCounts)}`)
  console.log(`  ${drift.length} file(s) drifted`)
  for (const p of [...stats.problems, ...drift.map((d) => `drift ${d}`)]) console.log('  ERROR ' + p)
  if (stats.problems.length || drift.length) process.exitCode = 1
} else {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(dirname(REPORT), { recursive: true })
  for (const r of wordRows) {
    copyFileSync(join(ATLAS_IMG, `${mappings.get(r.id).name}.webp`), join(root, `${IMAGE_DIR}${r.id}.webp`))
    r.image_path = `${IMAGE_DIR}${r.id}.webp`
    r.image_status = 'ready'
    r.image_source = 'word-atlas'
    r.image_license = 'CC-BY-4.0'
    r.image_reviewStatus = 'pending'
    // motif is an INPUT to matching (enCandidates), so it must never be
    // overwritten here — otherwise a second run resolves different images.
  }
  writeFileSync(WORDS_CSV, serializeCSV(WORD_COLS, wordRows.map((r) => WORD_COLS.map((c) => r[c] ?? ''))), 'utf8')
  writeFileSync(REPORT, reportText, 'utf8')
  writeFileSync(REVIEW, renderReview(wordRows, mappings), 'utf8')
  console.log(`Imported ${stats.count} unique WebP illustrations for ${wordRows.length} words`)
  console.log(`  methods: ${JSON.stringify(methodCounts)}`)
  console.log(`  problems: ${stats.problems.length}`)
  console.log(`  wrote ${WORDS_CSV}, ${REPORT}, ${REVIEW}`)
  if (stats.problems.length) { for (const p of stats.problems) console.error('  ERROR ' + p); process.exitCode = 1 }
}
