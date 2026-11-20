/**
 * Generate one distinct, meaning-related SVG illustration for every word that
 * does not have one yet.
 *
 *   node scripts/generate-illustrations.mjs            # generate + update CSV
 *   node scripts/generate-illustrations.mjs --check    # verify, write nothing
 *
 * Design goals (from the product request):
 *   1. Every word gets a picture; the 3 existing AI sample PNGs are kept.
 *   2. No two pictures are identical (verified by SHA-256 + visual signature).
 *   3. Every picture is exactly 100 x 100 with the same frame and stroke.
 *   4. The picture concisely reflects the word's meaning.
 *
 * The pictograms come from the vendored Lucide icon set (ISC licence, see
 * data/import/LUCIDE-NOTICE.txt). Only a closed, curated universe of real
 * depictions (CANON) is eligible: UI/editor/brand glyphs and modifier
 * variants such as file-x, percent-square, clock-arrow-left or scan-box can
 * never be used, because they depict nothing.
 *
 * Each word resolves its own meaning through a deterministic chain
 * (pinned override -> Chinese gloss -> English gloss -> motif -> topic), so
 * one word never pushes another onto an unrelated leftover icon. Glyphs may
 * be shared by a few synonyms; every card is still a distinct picture because
 * it also carries its own Chinese meaning label, accent, pattern and badge.
 * Numbers, months, weekdays, ordinals, colours and seasons get bespoke cards
 * (a numeral / a calendar / a colour swatch) because those meanings are exact.
 *
 * Output is deterministic: no timestamps, no randomness, sorted iteration.
 * Re-running this script on unchanged input produces byte-identical files.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORD_COLS, readCsvFiles, serializeCSV } from './csv-pack.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICON_JSON = join(root, 'data', 'import', 'lucide-icons.json')
const WORDS_CSV = join(root, 'data', 'words.csv')
const SENTENCES_CSV = join(root, 'data', 'sentences.csv')
const OUT_DIR = join(root, 'assets', 'illustrations')
const REPORT = join(root, 'data', 'import', 'illustration-report.json')
const SHEET = join(root, 'tools', 'illustration-review.html')
const IMAGE_DIR = 'assets/illustrations/'

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')

/* ── small helpers ─────────────────────────────────────────────────────── */
const sha = (s) => createHash('sha256').update(s).digest('hex')
const hashInt = (s, salt = '') => parseInt(sha(`${salt}:${s}`).slice(0, 8), 16)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const uniq = (a) => [...new Set(a)]

/* ── 1. icon index ─────────────────────────────────────────────────────── */
const ICONS = JSON.parse(readFileSync(ICON_JSON, 'utf8'))
const ICON_NAMES = Object.keys(ICONS).sort()
const SEGMENTS = new Map(ICON_NAMES.map((n) => [n, n.split(/[-0-9]+/).filter(Boolean)]))
const TOKEN_INDEX = new Map()
for (const [name, segs] of SEGMENTS) {
  for (const s of uniq(segs)) {
    if (s.length < 3) continue
    if (!TOKEN_INDEX.has(s)) TOKEN_INDEX.set(s, [])
    TOKEN_INDEX.get(s).push(name)
  }
}
// Very common icon-name fragments are weak evidence of meaning.
const IDF = new Map([...TOKEN_INDEX].map(([t, list]) => [t, 1 / Math.sqrt(list.length)]))
/* A CLOSED universe of depictions. Lucide ships 2,401 names, but most of the
   multi-segment ones are toolbar states (file-x, percent-square, scan-box,
   clock-arrow-left, badge-euro) that say nothing about a Finnish word. Old
   builds scored against the whole set, so the 900th word received whatever
   unrelated glyph was still free. Here only real objects / actions / symbols
   are eligible, and a word never falls outside its own meaning chain. */
const JUNK_SINGLE = new Set(`ad airplay ampersand ampersands asterisk asterism astroid atom badge barcode baseline binary biohazard bitcoin bluetooth bold braces brackets captions code cog columns command component contrast copy copyleft copyright crop crosshair cuboid cylinder delete diameter diff disc divide dna dock dot edit eject ellipse ellipsis filter focus form forward frame fullscreen grip heading hexagon highlighter import indent info italic lambda layout ligature loader margin menu merge nfc omega opacity option orbit outdent phi pi pilcrow radical radius ratio redo regex rss scaling section settings sigma slash slice sliders space spline squircle strikethrough subscript subtitles summary superscript tangent terminal touchpad transgender underline undo ungroup unlink unplug usb variable verified vibrate webhook worm wrap`.split(' '))
/* Multi-segment depictions that the dictionaries and topic themes rely on.
   Every name is checked against the vendored icon set below. */
const DICT_ICONS = `accessibility activity anchor app-window apple archive armchair arrow-down arrow-left arrow-left-right arrow-right arrow-up baby badge-check ban banknote banknote-arrow-down battery-charging bike book book-open brain brick-wall briefcase briefcase-business building-2 calendar calendar-check calendar-days calendar-search camera car-taxi-front carrot chart-bar chart-column-decreasing chart-line chart-pie check-check cherry circle-check circle-help circle-pause circle-question-mark circle-user circle-x citrus clipboard-check clipboard-list clock cloud-fog cloud-rain cookie cooking-pot credit-card croissant cup-soda door-open droplet drumstick eye factory file-text flag flask-conical folder footprints frown gift git-branch git-fork globe graduation-cap grid-3x3 hammer hand hand-coins handshake hard-hat hash heart heart-handshake heart-pulse house id-card key-round landmark languages leafy-green library-big lightbulb link list-checks log-in log-out luggage mail map-pin megaphone message-square message-square-quote message-square-reply messages-square mic moon mouse-pointer-2 mouse-pointer-click move-horizontal network package palette parking-circle party-popper paw-print percent person-standing piggy-bank plane printer quote refresh-cw rotate-ccw rotate-cw route scale scan-eye scan-face search shield-check shield-x shirt shopping-bag shopping-cart shower-head signpost snowflake sparkles split stethoscope store tag target thumbs-up tickets-plane timer train-front trash tree-deciduous tree-pine trees trending-down trending-up triangle-alert trophy user user-group user-plus user-round user-round-check user-search users users-2 users-round utensils volume-2 vote workflow wrench zap`.split(' ')
const EXTRA_DEPICTIONS = `alarm-clock arrow-up-right arrow-down-right bed-double book-open-text bus-front cake-slice car-front chart-area chart-column chef-hat circle-check-big circle-dollar-sign clock-3 cloud-sun cloud-snow door-closed egg-fried flower-2 folder-open glass-water hand-heart heart-crack house-plus ice-cream-bowl lamp-desk layers-2 map-pinned message-circle message-circle-question-mark message-square-text monitor-smartphone moon-star notebook-pen package-open receipt-text repeat-2 shopping-basket square-check-big thermometer train-front-tunnel tree-palm utensils-crossed washing-machine cloud-lightning cloud-drizzle cloud-moon cloud-sun-rain`.split(' ')
const CANON = new Set([
  ...ICON_NAMES.filter((n) => !n.includes('-') && !JUNK_SINGLE.has(n)),
  ...DICT_ICONS, ...EXTRA_DEPICTIONS,
].filter((n) => ICONS[n]))
const GOOD = CANON
for (const n of [...DICT_ICONS, ...EXTRA_DEPICTIONS]) {
  if (!ICONS[n]) console.warn(`  warning: unknown icon ${n} (ignored)`)
}

/* If two words in one learning group want the same glyph, the second must
   fall back to a CLOSELY RELATED depiction, not to a random topic icon.
   Families keep 父亲 -> user-round instead of 父亲 -> house. */
const ICON_FAMILY = {
  user: ['user', 'user-round', 'person-standing', 'contact', 'users', 'users-round', 'baby', 'accessibility'],
  heart: ['heart', 'heart-pulse', 'heart-handshake', 'smile', 'frown', 'laugh', 'meh', 'angry'],
  shirt: ['shirt', 'user-round', 'person-standing', 'tag', 'shopping-bag', 'handbag', 'crown', 'umbrella'],
  footprints: ['footprints', 'bike', 'activity', 'person-standing', 'dumbbell', 'route'],
  glasses: ['glasses', 'watch', 'crown', 'user-round', 'shirt'],
  house: ['house', 'home', 'door-open', 'key-round', 'lock', 'app-window', 'grid-3x3', 'brick-wall'],
  book: ['book', 'book-open', 'file-text', 'clipboard-list', 'notebook-pen', 'graduation-cap', 'school', 'library-big'],
  clock: ['clock', 'calendar', 'calendar-days', 'timer', 'hourglass', 'alarm-clock', 'watch', 'repeat'],
  car: ['car', 'bus', 'train-front', 'plane', 'bike', 'ship', 'sailboat', 'route', 'map', 'signpost'],
  utensils: ['apple', 'cherry', 'grape', 'banana', 'citrus', 'carrot', 'salad', 'cake', 'cookie', 'croissant', 'sandwich', 'egg', 'milk', 'cup-soda', 'soup', 'utensils', 'cooking-pot'],
  stethoscope: ['stethoscope', 'pill', 'thermometer', 'cross', 'syringe', 'hospital', 'ambulance', 'bandage'],
  dumbbell: ['dumbbell', 'activity', 'bone', 'footprints', 'bike', 'heart-pulse', 'weight'],
  brain: ['brain', 'eye', 'ear', 'scan-face', 'lightbulb', 'circle-help'],
  cloud: ['cloud', 'cloud-rain', 'cloud-snow', 'cloud-sun', 'cloud-drizzle', 'cloud-lightning', 'sun', 'snowflake', 'wind', 'tree-deciduous', 'leaf', 'sprout', 'flower', 'mountain', 'waves', 'flame', 'droplet', 'star', 'moon', 'rainbow'],
  laptop: ['laptop', 'smartphone', 'monitor', 'tv', 'keyboard', 'database', 'server'],
  newspaper: ['newspaper', 'book-open', 'file-text', 'mic', 'megaphone', 'radio'],
  image: ['image', 'camera', 'film', 'video', 'printer'],
  banknote: ['banknote', 'coins', 'wallet', 'chart-line', 'chart-pie', 'trending-up', 'trending-down', 'percent', 'receipt', 'tag', 'piggy-bank', 'calculator'],
  landmark: ['landmark', 'scale', 'gavel', 'shield', 'flag', 'vote', 'id-card', 'users', 'building-2'],
  bed: ['bed', 'sofa', 'armchair', 'bath', 'lamp', 'refrigerator', 'washing-machine', 'broom', 'trash', 'archive'],
  briefcase: ['briefcase', 'building-2', 'factory', 'hammer', 'wrench', 'hard-hat', 'clipboard-list', 'target'],
  link: ['link', 'git-branch', 'git-fork', 'split', 'plus', 'arrow-right', 'arrow-left', 'network', 'workflow'],
  lightbulb: ['lightbulb', 'sparkles', 'brain', 'circle-help', 'circle-question-mark', 'quote', 'search'],
  circlecheck: ['circle-check', 'badge-check', 'clipboard-check', 'shield-check', 'check-check', 'list-checks'],
  ban: ['ban', 'circle-x', 'circle-pause', 'shield-x', 'x', 'minus'],
  store: ['store', 'shopping-cart', 'shopping-bag', 'shopping-basket', 'tag', 'package', 'receipt', 'coins'],
  pawprint: ['paw-print', 'dog', 'cat', 'rabbit', 'squirrel', 'turtle', 'bird', 'fish', 'bug'],
  mappin: ['map-pin', 'map', 'route', 'signpost', 'compass', 'navigation', 'globe', 'flag'],
  ruler: ['ruler', 'maximize', 'minimize', 'expand', 'shrink', 'move-horizontal', 'layers', 'palette'],
  scissors: ['scissors', 'shirt', 'handbag', 'user-round', 'tag'],
  megaphone: ['megaphone', 'mic', 'radio', 'newspaper', 'tv', 'speech'],
  microwave: ['microwave', 'refrigerator', 'washing-machine', 'cooking-pot', 'flame', 'archive'],
  sunrise: ['sunrise', 'sun', 'sunset', 'moon', 'clock', 'calendar-days', 'hourglass'],
  feather: ['feather', 'weight', 'wind', 'droplet', 'arrow-down', 'minimize'],
  award: ['award', 'star', 'medal', 'trophy', 'badge-check', 'thumbs-up'],
  hand: ['hand', 'hand-coins', 'hand-heart', 'handshake', 'hand-helping', 'hand-platter'],
  moneyout: ['banknote-arrow-down', 'banknote', 'coins', 'wallet', 'receipt', 'trending-down', 'chart-line'],
}
const FAMILY_OF = new Map()
for (const [, members] of Object.entries(ICON_FAMILY)) {
  const valid = members.filter((n) => CANON.has(n))
  for (let i = 0; i < valid.length; i++) {
    // Rotate so the intended glyph is first and its closest neighbours
    // follow: 草莓 -> cherry, grape, banana ... not utensils, cooking-pot.
    if (!FAMILY_OF.has(valid[i])) FAMILY_OF.set(valid[i], [...valid.slice(i), ...valid.slice(0, i)])
  }
}

/* ── 2. meaning dictionaries ──────────────────────────────────────────── */
/* Chinese gloss -> English search tokens. Longest keys are matched first. */
const ZH_TO_EN = {
  '身份证': 'id card identification', '护照': 'passport id card', '驾照': 'id card car',
  '地址': 'map pin address', '电话号码': 'phone number', '电子邮件': 'mail email', '名字': 'user name',
  '房子': 'house home', '房屋': 'house home', '住宅': 'house home', '公寓': 'building apartment',
  '房间': 'door room', '厨房': 'cooking pot', '客厅': 'sofa', '卧室': 'bed', '浴室': 'bath shower',
  '厕所': 'toilet', '门': 'door', '窗户': 'window app', '墙': 'brick wall', '地板': 'floor grid',
  '屋顶': 'house roof', '天花板': 'ceiling house', '桌子': 'table', '椅子': 'armchair chair',
  '沙发': 'sofa armchair', '床': 'bed', '柜子': 'cabinet archive', '架子': 'shelf library',
  '灯': 'lamp lightbulb', '钥匙': 'key', '锁': 'lock', '镜子': 'mirror',
  '书': 'book', '书本': 'book', '报纸': 'newspaper', '杂志': 'book open magazine',
  '信': 'mail letter', '邮件': 'mail email', '明信片': 'mail', '包裹': 'package box',
  '汽车': 'car', '公交车': 'bus', '公共汽车': 'bus', '火车': 'train', '自行车': 'bike bicycle',
  '飞机': 'plane', '船': 'ship sailboat', '地铁': 'train underground', '出租': 'car taxi',
  '街道': 'route road signpost', '城市': 'building city', '商店': 'store shop', '店铺': 'store shop',
  '市场': 'store shopping', '银行': 'landmark bank', '医院': 'hospital cross', '学校': 'school graduation',
  '大学': 'graduation school', '办公室': 'briefcase building', '工厂': 'factory', '图书馆': 'library',
  '教堂': 'church', '车站': 'train station', '机场': 'plane', '桥': 'route',
  '水': 'droplet water', '咖啡': 'coffee', '牛奶': 'milk', '面包': 'croissant bread',
  '食物': 'utensils food', '饭菜': 'utensils', '水果': 'apple fruit', '蔬菜': 'carrot',
  '肉': 'beef', '鱼': 'fish', '蛋': 'egg', '糖': 'candy', '盐': 'salt shaker',
  '零食': 'cookie snack', '米饭': 'utensils', '汤': 'soup', '茶': 'coffee cup',
  '钱': 'banknote coins', '现金': 'banknote', '卡': 'credit card', '信用卡': 'credit card',
  '票': 'ticket', '价格': 'tag price', '付款': 'banknote pay', '账单': 'receipt file',
  '衣服': 'shirt', '鞋': 'footprints shoe', '帽子': 'hat', '裤子': 'shirt', '外套': 'shirt',
  '裙子': 'shirt', '手套': 'hand', '围巾': 'shirt', '包': 'bag shopping', '伞': 'umbrella',
  '时间': 'clock', '钟': 'clock', '日历': 'calendar', '年份': 'calendar', '月份': 'calendar',
  '周': 'calendar days', '小时': 'clock hour', '分钟': 'clock timer', '秒': 'timer',
  '早晨': 'sunrise', '上午': 'sunrise', '下午': 'sun', '晚上': 'moon', '夜': 'moon',
  '春天': 'sprout flower', '夏天': 'sun', '秋天': 'leaf', '冬天': 'snowflake',
  '天气': 'cloud sun', '雨': 'cloud rain', '雪': 'snowflake', '风': 'wind', '太阳': 'sun',
  '云': 'cloud', '山': 'mountain', '海': 'waves', '河': 'waves', '树': 'tree pine',
  '花': 'flower', '草': 'leaf sprout', '森林': 'tree forest', '空气': 'wind',
  '狗': 'dog', '猫': 'cat', '鸟': 'bird', '动物': 'paw print', '马': 'horse',
  '人': 'user', '朋友': 'users', '家庭': 'users', '家人': 'users', '男人': 'user',
  '女人': 'user', '孩子': 'baby child', '婴儿': 'baby', '母亲': 'user heart', '父亲': 'user',
  '父母': 'users', '兄弟': 'users', '姐妹': 'users', '邻居': 'users house', '医生': 'stethoscope',
  '护士': 'stethoscope', '老师': 'graduation', '学生': 'graduation', '警察': 'shield',
  '顾客': 'user shopping', '游客': 'luggage', '司机': 'car', '工人': 'hard hat',
  '手': 'hand', '脚': 'footprints', '眼睛': 'eye', '耳朵': 'ear', '嘴': 'mouth',
  '头': 'brain head', '心': 'heart', '身体': 'accessibility', '头发': 'user',
  '电话': 'phone', '手机': 'smartphone', '电脑': 'laptop', '电视': 'tv', '相机': 'camera',
  '收音机': 'radio', '网络': 'wifi globe', '电脑程序': 'code', '网站': 'globe',
  '音乐': 'music', '歌': 'music', '电影': 'film', '图片': 'image', '照片': 'image camera',
  '视频': 'video', '新闻': 'newspaper', '报纸': 'newspaper', '杂志': 'book open',
  '广告': 'megaphone', '节目': 'tv', '下载': 'download', '上传': 'upload', '保存': 'save',
  '工作': 'briefcase', '劳动': 'briefcase', '会议': 'users meeting', '合同': 'file text contract',
  '简历': 'file text', '申请': 'file text clipboard', '表格': 'clipboard list form',
  '公司': 'building', '老板': 'briefcase user', '同事': 'users', '面试': 'users message',
  '问题': 'circle help', '答案': 'check', '语言': 'languages', '词': 'type', '句子': 'text',
  '语法': 'book', '发音': 'volume audio', '翻译': 'languages', '考试': 'clipboard check',
  '研究': 'search', '调查': 'search', '概念': 'lightbulb idea', '现象': 'eye',
  '影响': 'zap', '原因': 'link', '结果': 'chart', '机会': 'sparkles door',
  '跑': 'footprints', '走': 'footprints', '来': 'arrow right', '去': 'arrow right',
  '回': 'arrow left', '出': 'log out', '入': 'log in', '吃': 'utensils', '喝': 'cup soda',
  '说': 'message speech', '讲': 'message speech', '听': 'ear', '看': 'eye', '读': 'book open',
  '写': 'pen', '学习': 'book open', '教': 'graduation', '问': 'circle help', '答': 'message',
  '买': 'shopping cart', '卖': 'store', '开': 'door open', '关': 'lock', '爱': 'heart',
  '想': 'brain', '知道': 'brain', '记得': 'brain', '忘记': 'brain off', '觉得': 'heart',
  '高兴': 'smile', '快乐': 'smile', '生气': 'frown angry', '伤心': 'frown', '害怕': 'frown',
  '惊讶': 'smile plus', '兴奋': 'smile', '平静': 'smile', '紧张': 'frown', '失望': 'frown',
  '累': 'battery low', '病': 'stethoscope', '疼': 'heart pulse', '药': 'pill',
  '呼吸': 'wind', '睡觉': 'bed moon', '起床': 'arrow up', '洗澡': 'shower',
  '大': 'maximize', '小': 'minimize', '高': 'arrow up', '低': 'arrow down',
  '长': 'move horizontal', '短': 'minimize', '快': 'zap', '慢': 'turtle',
  '新': 'sparkles', '旧': 'clock', '热': 'thermometer', '冷': 'snowflake',
  '多': 'layers', '少': 'minus', '半': 'percent', '所有': 'layers', '每一个': 'list checks',
  '因为': 'link', '所以': 'arrow right', '但是': 'split', '和': 'plus', '或者': 'split',
  '如果': 'git branch', '虽然': 'split', '而且': 'plus', '没有': 'x', '不': 'x',
  '现在': 'clock', '今天': 'calendar', '明天': 'calendar', '昨天': 'calendar',
  '经常': 'repeat', '总是': 'repeat', '有时': 'clock', '从不': 'x', '已经': 'check',
  '这里': 'map pin', '那里': 'map pin', '哪里': 'map pin', '什么': 'circle help',
  '谁': 'user', '怎么': 'circle help', '为什么': 'circle help', '多少': 'hash',
  '是': 'check', '有': 'plus', '可以': 'check', '必须': 'alert', '应该': 'check',
  '上': 'arrow up', '下': 'arrow down', '里': 'box', '外': 'log out',
  '前': 'arrow left', '后': 'arrow right', '左': 'arrow left', '右': 'arrow right',
  '中': 'circle dot', '旁边': 'move horizontal', '之间': 'move horizontal',
  '政府': 'landmark', '法律': 'scale', '法院': 'scale', '国家': 'flag', '社会': 'users globe',
  '安全': 'shield', '警察': 'shield', '犯罪': 'shield alert', '税': 'banknote percent',
  '经济': 'chart', '质量': 'award', '发展': 'trending up', '减少': 'trending down',
  '增加': 'trending up', '改变': 'refresh', '开始': 'play', '结束': 'square',
  '停止': 'square', '继续': 'play', '帮助': 'circle help', '用': 'wrench',
  '做': 'wrench', '给': 'hand', '拿': 'hand', '放': 'hand', '等': 'clock',
  '找': 'search', '看见': 'eye', '听见': 'ear', '感觉': 'heart', '希望': 'sparkles',
  '住': 'house', '睡': 'bed', '坐': 'armchair', '站': 'user', '穿': 'shirt',
  '洗': 'droplet', '打扫': 'sparkles', '做饭': 'cooking pot', '修': 'wrench',
  '借': 'hand', '还': 'rotate ccw', '存': 'piggy bank', '取消': 'x',
  '检查': 'clipboard check', '试': 'flask conical', '决定': 'check',
  '选择': 'list checks', '同意': 'check', '拒绝': 'x', '要求': 'clipboard',
  '评估': 'chart', '描述': 'text', '论证': 'message square', '深思': 'brain',
  '到达': 'map pin', '出发': 'arrow right', '离开': 'log out', '返回': 'arrow left',
  '旅行': 'plane luggage', '住宿': 'bed hotel', '行李': 'luggage', '预订': 'calendar check',
  '保险': 'shield', '保修': 'shield check', '损坏': 'triangle alert',
  '运动': 'dumbbell', '球': 'circle', '游戏': 'gamepad', '玩': 'gamepad',
  '比赛': 'trophy', '赢': 'trophy', '输': 'trending down', '队': 'users',
  '颜色': 'palette', '红色': 'circle', '蓝色': 'circle', '绿色': 'circle',
  '黄色': 'circle', '黑色': 'circle', '白色': 'circle', '灰色': 'circle',
  '棕色': 'circle', '橙色': 'circle', '紫色': 'circle', '粉': 'circle',
  '声音': 'volume', '光': 'lightbulb', '暗': 'moon', '火': 'flame', '电': 'zap',
  '纸': 'file', '笔': 'pen', '地图': 'map', '旗': 'flag', '礼物': 'gift',
  '数字': 'hash', '数': 'hash', '部分': 'pie chart', '全部': 'layers',
  '第一': 'award', '第二': 'award', '第三': 'award', '最后': 'flag',
  '交通': 'bus', '路': 'route', '十字路口': 'signpost', '停车': 'parking circle',
  '环境': 'leaf recycle', '垃圾': 'trash', '自然': 'tree', '污染': 'cloud fog',
  '生日': 'cake', '年龄': 'calendar', '节日': 'party popper', '假期': 'palmtree',
  '咖啡馆': 'coffee', '餐馆': 'utensils', '酒店': 'bed', '博物馆': 'landmark',
  '农场': 'wheat', '花园': 'flower', '公园': 'tree', '操场': 'dumbbell',
  '电脑': 'laptop', '键盘': 'keyboard', '鼠标': 'mouse', '屏幕': 'monitor',
  '电池': 'battery', '充电': 'battery charging', '信号': 'signal', '密码': 'key lock',
  '饮料': 'cup soda', '果汁': 'cup soda apple', '土豆': 'carrot', '浆果': 'cherry grape',
  '黄瓜': 'salad carrot', '胡椒': 'utensils', '油': 'droplet', '午餐': 'utensils soup',
  '晚餐': 'utensils soup', '饥饿': 'utensils', '口渴': 'cup soda', '连衣裙': 'shirt',
  '围巾': 'shirt', '毛巾': 'bath shower', '锅': 'cooking pot', '盘子': 'utensils',
  '蚊子': 'bug', '疫苗': 'syringe', '接种': 'syringe', '冰': 'snowflake droplet',
  '湖': 'waves', '毛衣': 'shirt', '衬衫': 'shirt', '上衣': 'shirt', '裙子': 'shirt',
  '情感': 'heart', '感觉': 'heart', '平静': 'smile', '勇敢': 'shield', '懒惰': 'bed',
  '疼痛': 'heart pulse', '血': 'droplet heart', '微笑': 'smile', '哭泣': 'droplet frown',
  '盘子': 'utensils', '叉子': 'utensils', '刀': 'utensils', '勺': 'utensils',
  '杯子': 'cup soda', '瓶子': 'bottle wine', '早餐': 'coffee croissant',
  '总统': 'landmark flag', '权利': 'scale', '税收': 'banknote percent', '账户': 'banknote',
  '简历': 'file text', '上司': 'briefcase user', '员工': 'briefcase user', '雇主': 'briefcase',
  '项目': 'clipboard list', '工资': 'banknote', '休息': 'bed pause', '失业': 'briefcase',
  '经理': 'briefcase user', '销售员': 'store', '清洁工': 'sparkles', '计划': 'clipboard list',
  '普通': 'circle', '不同': 'shuffle', '知名': 'award star', '清楚': 'eye', '深': 'arrow down',
  '也许': 'circle help', '因为': 'link', '由于': 'link', '也': 'plus', '和': 'plus',
  '文件': 'file text', '节目': 'tv', '程序': 'code', '导游': 'map', '指南': 'book open',
  '迟到': 'clock', '锻炼': 'dumbbell', '因素': 'list', '声称': 'message square',
  '最好': 'award', '真实': 'badge check', '足够': 'check', '必不可少': 'star',
  '移民': 'globe', '国际': 'globe flag', '标题': 'type', '消息': 'message square',
  '住宿': 'bed hotel', '折扣': 'tag percent', '现金': 'banknote', '申请': 'clipboard list',
  '修理': 'wrench', '找到': 'search', '看': 'eye', '做': 'wrench', '练习': 'pen',
  '会议': 'users', '秘书': 'clipboard', '集市': 'store', '更换': 'refresh',
  '预订': 'calendar check', '学校': 'school', '纸': 'file text', '手': 'hand',
  '盘子': 'utensils', '装满': 'box', '填写': 'pen', '宠物': 'paw print',
}
/* Direct Chinese gloss -> depiction. Long, hand-reviewed compound words that
   have no same-named Lucide glyph (冰箱, 护士, 电视, 膝盖 ...). Values are
   icon names, not search tokens, so the meaning chain stays exact. */
const ZH_TO_ICON = {
  // family / people / roles
  '父亲': 'user', '母亲': 'user', '男孩': 'baby', '女孩': 'baby', '姐妹': 'users',
  '女人': 'user-round', '祖母': 'user-round', '祖父': 'user', '堂表兄弟姐妹': 'users',
  '成年人': 'user-round', '名字': 'user-round', '姓': 'user-round', '名': 'user-round',
  '学生': 'graduation-cap', '校长': 'graduation-cap', '老师': 'graduation-cap',
  '客户': 'user-round', '员工': 'briefcase', '雇主': 'briefcase', '同事': 'users',
  '经理': 'briefcase', '工程师': 'wrench', '厨师': 'chef-hat', '店主': 'store',
  '收银台': 'banknote', '记者': 'mic', '导游': 'map', '游客': 'luggage',
  '用户': 'user-round', '居民': 'users', '人口': 'users', '纳税人': 'user-round',
  '护士': 'stethoscope', '乘客': 'users', '任何人': 'user-search', '任何东西': 'circle-help',
  // language / study
  '芬兰语': 'languages', '英语': 'languages', '中文': 'languages',
  '语法': 'book', '词典': 'book', '音节': 'type', '成绩': 'award',
  '学位': 'graduation-cap', '毕业': 'graduation-cap', '复习': 'repeat',
  '解释': 'message-square', '课程': 'book-open', '课时': 'clock', '班级': 'users',
  '黑板': 'presentation', '家庭作业': 'clipboard-list', '职业学校': 'school',
  '大学': 'graduation-cap', '学校': 'school', '练习': 'pen',
  // home / household
  '地毯': 'grid-3x3', '窗帘': 'app-window', '炉灶': 'flame', '洗衣机': 'washing-machine',
  '洗碗机': 'washing-machine', '烤箱': 'microwave', '冷冻柜': 'refrigerator',
  '冰箱': 'refrigerator', '煎锅': 'cooking-pot', '盘子': 'utensils', '碗': 'soup',
  '玻璃杯': 'glass-water', '马克杯': 'cup-soda', '勺子': 'utensils', '刀': 'utensils',
  '肥皂': 'bubbles', '洗发水': 'droplet', '洗涤剂': 'droplet', '吸尘器': 'broom',
  '垃圾桶': 'trash', '回收': 'recycle', '家务': 'broom', '打扫': 'sparkles',
  '待洗衣物': 'shirt', '熨烫': 'shirt', '弄干': 'wind', '清空': 'trash',
  '修理': 'wrench', '干净的': 'sparkles', '脏的': 'trash', '整洁的': 'sparkles',
  '凌乱的': 'shapes', '租金': 'banknote',
  // food
  '黄油': 'milk', '鸡蛋': 'egg', '意大利面': 'utensils', '草莓': 'cherry',
  '番茄': 'salad', '洋葱': 'carrot', '胡椒': 'leafy-green', '晚餐': 'utensils',
  '饥饿': 'soup', '午餐': 'soup',
  // clothing / body
  '上衣': 'shirt', 'T恤': 'shirt', '裤子': 'shirt', '连衣裙': 'shirt',
  '裙子': 'shirt', '外套': 'shirt', '毛衣': 'shirt', '袜子': 'footprints',
  '靴子': 'footprints', '腰带': 'shirt', '头发': 'user-round', '脸': 'scan-face',
  '鼻子': 'scan-face', '牙齿': 'smile', '脖子': 'person-standing',
  '肩膀': 'person-standing', '手指': 'hand', '肚子': 'accessibility',
  '膝盖': 'accessibility', '皮肤': 'hand', '手套': 'hand',
  // health / wellbeing
  '疾病': 'stethoscope', '药店': 'pill', '发烧': 'thermometer', '咳嗽': 'thermometer',
  '过敏': 'pill', '感冒': 'thermometer', '身心健康': 'heart', '生活方式': 'activity',
  '营养学': 'salad', '营养': 'salad', '饮食': 'salad', '体育锻炼': 'dumbbell',
  '体能': 'activity', '耐力': 'dumbbell', '力量': 'dumbbell', '肌肉': 'dumbbell',
  '骨头': 'bone', '呼吸': 'wind', '睡眠': 'bed', '失眠': 'moon',
  '恢复': 'heart-pulse', '心理健康': 'brain', '抑郁': 'frown', '焦虑': 'frown',
  '成瘾': 'pill', '疫苗': 'syringe', '症状': 'thermometer', '诊断': 'stethoscope',
  '处方': 'file-text', '止痛药': 'pill', '健康的': 'heart', '不健康的': 'circle-x',
  '有营养的': 'salad', '积极的': 'trending-up', '被动的': 'minus',
  '伸展': 'activity', '康复': 'heart-pulse', '预防': 'shield',
  // transport / travel
  '有轨电车': 'train-front', '小船': 'sailboat', '交通': 'bus', '红绿灯': 'signpost',
  '附近': 'map-pin', '远处': 'map-pin', '直行': 'arrow-up', '到外面': 'log-out',
  '进入里面': 'log-in', '在那里': 'map-pin', '到哪里': 'map-pin', '谁': 'user-search',
  '怎样': 'circle-help', '但是': 'split', '行李箱': 'luggage', '护照': 'id-card',
  '身份证件': 'id-card', '取消': 'circle-x', '延误': 'clock', '迟到': 'clock',
  '误点': 'clock', '过夜': 'bed', '登记': 'clipboard-list', '出发': 'arrow-right',
  '到达': 'map-pin', '登机口': 'door-open', '航站楼': 'building-2',
  '拥挤的': 'users', '预订': 'calendar-check', '住宿': 'bed', '青年旅舍': 'bed',
  '房间预订': 'bed', '前台': 'user-round',
  // society / public
  '政府': 'landmark', '议会': 'landmark', '选举': 'vote', '规则': 'clipboard-list',
  '权利': 'scale', '义务': 'clipboard-list', '责任': 'shield-check', '安全': 'shield',
  '许可': 'badge-check', '公共的': 'users', '私人的': 'lock', '当地的': 'map-pin',
  '国际的': 'globe', '促进': 'trending-up', '保护': 'shield', '遵守': 'clipboard-check',
  '违反': 'circle-x', '允许': 'circle-check', '禁止': 'ban', '要求': 'clipboard-list',
  '提供': 'gift', '市镇': 'building-2', '城区': 'building-2', '首都': 'landmark',
  '移民事务': 'globe', '机关': 'landmark',
  // economy / shops
  '财务': 'wallet', '银行账户': 'landmark', '账户': 'wallet', '债务': 'banknote',
  '税收': 'banknote', '增值税': 'percent', '税': 'banknote', '收入': 'trending-up',
  '支出': 'banknote-arrow-down', '市场': 'store', '经济增长': 'trending-up',
  '有利可图的': 'chart-line', '融资': 'banknote', '偿还': 'hand-coins',
  '负债': 'trending-down', '增长': 'trending-up', '增加': 'trending-up',
  '超市': 'store', '优惠': 'tag', '购买物': 'shopping-bag', '篮子': 'shopping-basket',
  '尺寸': 'ruler', '款式': 'shirt', '退货': 'package-open', '纸币': 'banknote',
  '服务': 'handshake', '理发店': 'scissors', '美发店': 'scissors',
  '订购': 'clipboard-list', '退还': 'package-open', '贵的': 'banknote',
  '便宜的': 'tag', '免费的': 'gift', '挣钱': 'banknote',
  // media / tech
  '媒体': 'newspaper', '新闻节目': 'newspaper', '报纸': 'newspaper', '杂志': 'book-open',
  '文章': 'file-text', '采访': 'mic', '广告宣传': 'megaphone', '电视': 'tv',
  '节目': 'tv', '系列': 'layers', '图片': 'image', '软件': 'laptop',
  '应用程序': 'smartphone', '网页': 'globe', '网站': 'globe', '互联网': 'globe',
  '社交媒体': 'users', '信息安全': 'shield', '隐私': 'lock', '文件': 'file-text',
  '更新': 'refresh-cw', '通知': 'bell', '发布': 'send', '删除': 'trash',
  // nature / animals
  '天空': 'cloud', '暴风雨': 'cloud-lightning', '雷雨': 'cloud-lightning',
  '闪电': 'zap', '温度': 'thermometer', '海': 'waves', '河': 'waves',
  '岛': 'waves', '海滩': 'umbrella', '岸边': 'umbrella', '奶牛': 'milk',
  '羊': 'paw-print', '熊': 'paw-print', '狼': 'paw-print', '狐狸': 'paw-print',
  '照耀': 'sun', '刮风': 'wind', '融化': 'droplet',
  // emotions
  '恐惧': 'frown', '希望': 'sparkles', '担忧': 'frown', '压力': 'activity',
  '平静': 'smile', '心情': 'smile', '情感': 'heart', '想法': 'lightbulb',
  '梦想': 'sparkles', '幸福的': 'smile', '高兴的': 'smile', '害怕的': 'frown',
  '平静的': 'smile', '兴奋的': 'laugh', '失望的': 'frown', '骄傲的': 'award',
  '害羞的': 'meh', '诚实的': 'badge-check', '勤奋的': 'clock', '懒惰的': 'bed',
  '乐于助人的': 'handshake', '有礼貌的': 'handshake', '有耐心的': 'hourglass',
  '可靠的': 'shield-check', '享受': 'smile', '担心': 'frown', '生气': 'angry',
  // descriptions / abstract but depictable
  '大的': 'maximize', '高的': 'maximize', '短的': 'ruler', '宽的': 'move-horizontal',
  '窄的': 'minimize', '深的': 'arrow-down', '薄的': 'minimize', '厚的': 'layers',
  '轻的': 'feather', '强的': 'dumbbell', '弱的': 'feather', '强烈的': 'zap',
  '明亮的': 'sun', '黑暗的': 'moon', '清楚的': 'eye', '不清楚的': 'circle-help',
  '简单的': 'circle-check', '复杂的': 'workflow', '可能的': 'circle-help',
  '不可能的': 'ban', '普通的': 'circle', '相似的': 'layers-2', '普遍的': 'globe',
  '罕见的': 'star', '受欢迎的': 'heart', '著名的': 'award', '知名的': 'award',
  '未知的': 'circle-help', '有用的': 'wrench', '必要的': 'star',
  '必不可少的': 'star', '高质量的': 'award', '更好的': 'trending-up',
  '比较': 'git-fork', '对比': 'git-fork', '决定': 'circle-check',
  '最终成为': 'flag', '查明': 'search', '检查': 'clipboard-check', '察觉': 'eye',
  '描述': 'file-text', '声称': 'message-square', '包含': 'package',
  '有关': 'link', '集中': 'target', '继续': 'play', '形成': 'shapes',
  '创造': 'lightbulb', '减少': 'trending-down', '考虑到': 'brain',
  '看待': 'eye', '处理': 'clipboard-list', '同意': 'circle-check',
  '信任': 'handshake', '失望': 'frown', '兴奋': 'laugh', '同时': 'clock',
  '所以': 'arrow-right', '因为': 'link', '也就是说': 'quote', '以及': 'plus',
  // common verbs / adverbs
  '去/访问': 'arrow-right', '拿/取': 'hand', '爱': 'heart', '听': 'ear',
  '学会': 'book-open', '寻找': 'search', '打开': 'door-open', '关闭': 'lock',
  '等待': 'clock', '理解': 'lightbulb', '知道': 'brain', '认识': 'handshake',
  '思考': 'brain', '相信': 'circle-check', '许多': 'layers', '所有': 'layers',
  '天/白天': 'sun', '上午': 'sunrise', '夜晚': 'moon', '应用': 'workflow',
  '运用': 'workflow', '会议': 'users', '轮班工作': 'clock', '兼职': 'clock',
  '全职': 'briefcase', '失业': 'trending-down', '安排': 'calendar-check',
  '职业': 'briefcase', '公司': 'building-2', '仅仅': 'minus', '相当': 'gauge',
  '非常': 'zap', '真的': 'badge-check', '大约': 'percent', '总共': 'layers',
  '那时': 'clock', '还是': 'split', '通常': 'repeat', '尤其': 'star',
  '尽管如此': 'split', '因此': 'arrow-right', '此外': 'plus', '另一方面': 'split',
  '例如': 'list', '至少': 'minus', '很可能': 'circle-help', '可能地': 'circle-help',
  '以便': 'arrow-right', '情况': 'layers', '问题': 'circle-help',
  '解决办法': 'lightbulb', '挑战': 'target', '意义': 'quote', '目的': 'target',
  '差异': 'git-fork', '经历': 'clock', '事情': 'box', '方面': 'layers',
  '因素': 'list', '特征': 'tag', '特点': 'tag', '数量': 'hash',
  '水平': 'chart-line', '依据': 'clipboard-list', '例子': 'list',
  '现实': 'eye', '结果': 'flag', '后果': 'flag', '结果/后果': 'flag',
  '微波炉': 'microwave', '重的': 'weight', '最好的': 'award',
  '过于': 'maximize', '嗯': 'circle-check', '矮的': 'minimize',
  '真的/非常': 'badge-check', '如何': 'circle-help', '即': 'quote',
}
const ZH_ICON_KEYS = Object.keys(ZH_TO_ICON).sort((a, b) => b.length - a.length)
const ZH_KEYS = Object.keys(ZH_TO_EN).sort((a, b) => b.length - a.length)

/* English concept -> the ONE Lucide glyph that depicts it. Only the 101
   concepts without a same-named glyph need an entry; the rest resolve to
   themselves. This closes the Chinese-gloss -> English-concept -> exact
   picture chain and is what makes "胡萝卜" show a carrot, not a sandwich. */
const EN_TO_ICON = {
  address: 'map-pin', alert: 'triangle-alert', apartment: 'building-2', app: 'app-window',
  arrow: 'arrow-right', audio: 'volume-2', bag: 'shopping-bag', bank: 'landmark',
  bicycle: 'bike', branch: 'git-branch', bread: 'croissant', brick: 'brick-wall',
  cabinet: 'archive', card: 'id-card', cart: 'shopping-cart', ccw: 'rotate-ccw',
  ceiling: 'house', chair: 'armchair', charging: 'battery-charging', chart: 'chart-line',
  checks: 'list-checks', child: 'baby', city: 'building-2', conical: 'flask-conical',
  contract: 'file-text', cooking: 'cooking-pot', credit: 'credit-card', cup: 'cup-soda',
  days: 'calendar-days', door: 'door-open', down: 'arrow-down', email: 'mail',
  flask: 'flask-conical', floor: 'grid-3x3', fog: 'cloud-fog', food: 'utensils',
  forest: 'trees', fruit: 'apple', git: 'git-branch', graduation: 'graduation-cap',
  hard: 'hard-hat', hat: 'hard-hat', head: 'brain', help: 'circle-help',
  horizontal: 'move-horizontal', horse: 'paw-print', hour: 'clock', id: 'id-card',
  idea: 'lightbulb', identification: 'id-card', in: 'log-in', left: 'arrow-left',
  letter: 'mail', log: 'log-in', low: 'arrow-down', magazine: 'book-open',
  meeting: 'users', message: 'message-square', mirror: 'scan-face', name: 'user-round',
  number: 'hash', off: 'circle-x', open: 'door-open', out: 'log-out',
  parking: 'parking-circle', party: 'party-popper', passport: 'id-card', paw: 'paw-print',
  pay: 'banknote', pie: 'chart-pie', piggy: 'piggy-bank', pine: 'tree-pine',
  popper: 'party-popper', pot: 'cooking-pot', price: 'tag', print: 'printer',
  pulse: 'heart-pulse', rain: 'cloud-rain', refresh: 'refresh-cw', right: 'arrow-right',
  roof: 'house', room: 'door-open', rotate: 'rotate-cw', salt: 'utensils',
  shaker: 'utensils', shelf: 'library-big', shoe: 'footprints', shop: 'store',
  shopping: 'shopping-cart', shower: 'shower-head', snack: 'cookie', soda: 'cup-soda',
  station: 'train-front', taxi: 'car-taxi-front', tree: 'tree-deciduous',
  trending: 'trending-up', underground: 'train-front', up: 'arrow-up',
  wall: 'brick-wall', water: 'droplet', window: 'app-window',
}

/* English token -> extra, related search tokens (concept expansion). */
const SYNONYMS = {
  street: ['road', 'route', 'signpost', 'map'], road: ['route', 'signpost', 'traffic'],
  bread: ['croissant', 'wheat', 'sandwich', 'chef'], food: ['utensils', 'cooking', 'meal'],
  water: ['droplet', 'glass', 'waves'], coffee: ['cup', 'mug'], milk: ['carton', 'glass'],
  car: ['vehicle', 'steering', 'fuel'], bus: ['vehicle', 'transport'], train: ['railway', 'tram'],
  plane: ['airplane', 'flight', 'send'], ship: ['sailboat', 'anchor'], bicycle: ['bike', 'cycling'],
  house: ['home', 'building', 'door'], home: ['house', 'door'], apartment: ['building', 'house'],
  room: ['door', 'house'], kitchen: ['cooking', 'pot', 'chef'], bedroom: ['bed', 'moon'],
  bathroom: ['bath', 'shower', 'droplet'], door: ['house', 'key'], window: ['app', 'square'],
  table: ['grid', 'layout'], chair: ['armchair'], bed: ['moon', 'sleep'], sofa: ['armchair'],
  book: ['library', 'reading', 'open'], school: ['graduation', 'backpack'], university: ['graduation'],
  student: ['graduation', 'backpack'], teacher: ['graduation', 'presentation'],
  study: ['book', 'graduation'], learn: ['book', 'graduation'], research: ['search', 'flask'],
  work: ['briefcase', 'building'], job: ['briefcase'], office: ['briefcase', 'building'],
  meeting: ['users', 'presentation'], contract: ['file', 'signature'], resume: ['file', 'user'],
  application: ['clipboard', 'file'], form: ['clipboard', 'list'], interview: ['users', 'message'],
  money: ['banknote', 'coins', 'wallet'], bank: ['landmark', 'banknote'], account: ['banknote', 'user'],
  price: ['tag', 'banknote'], pay: ['banknote', 'credit'], debt: ['banknote', 'trending'],
  shop: ['store', 'shopping'], store: ['shopping', 'bag'], market: ['shopping', 'store'],
  city: ['building', 'map'], town: ['building', 'map'], country: ['flag', 'globe'],
  nation: ['flag', 'globe'], language: ['languages', 'message'], word: ['type', 'text'],
  sentence: ['text', 'quote'], grammar: ['book', 'text'], pronunciation: ['volume', 'audio'],
  friend: ['users', 'heart'], family: ['users', 'baby'], people: ['users', 'user'],
  person: ['user', 'contact'], human: ['user', 'accessibility'], child: ['baby', 'user'],
  baby: ['child', 'user'], mother: ['user', 'heart'], father: ['user', 'heart'],
  man: ['user'], woman: ['user'], doctor: ['stethoscope', 'cross'], nurse: ['stethoscope', 'cross'],
  hospital: ['cross', 'stethoscope'], health: ['heart', 'pulse'], medicine: ['pill', 'cross'],
  sick: ['stethoscope', 'thermometer'], pain: ['heart', 'pulse'], breathe: ['wind', 'lungs'],
  hand: ['pointer', 'grab'], eye: ['view', 'scan'], ear: ['volume', 'audio'],
  heart: ['pulse', 'activity'], brain: ['head', 'lightbulb'], head: ['user', 'brain'],
  time: ['clock', 'watch'], clock: ['timer', 'hourglass'], calendar: ['days', 'date'],
  year: ['calendar', 'days'], month: ['calendar', 'days'], week: ['calendar', 'days'],
  hour: ['clock', 'timer'], minute: ['timer', 'clock'], morning: ['sunrise', 'sun'],
  evening: ['sunset', 'moon'], night: ['moon', 'star'], today: ['calendar', 'sun'],
  tomorrow: ['calendar', 'sunrise'], yesterday: ['calendar', 'history'],
  weather: ['cloud', 'sun'], rain: ['cloud', 'droplet', 'umbrella'], snow: ['snowflake', 'cloud'],
  wind: ['tornado', 'cloud'], sun: ['sunrise', 'sunny'], cloud: ['fog', 'sky'],
  mountain: ['hills', 'terrain'], sea: ['waves', 'anchor'], river: ['waves', 'droplet'],
  tree: ['pine', 'forest'], flower: ['sprout', 'rose'], leaf: ['sprout', 'plant'],
  dog: ['paw', 'pet'], cat: ['paw', 'pet'], bird: ['feather', 'wing'], animal: ['paw', 'pet'],
  phone: ['smartphone', 'call'], smartphone: ['phone', 'mobile'], computer: ['laptop', 'monitor'],
  laptop: ['monitor', 'keyboard'], camera: ['image', 'aperture'], radio: ['volume', 'signal'],
  music: ['audio', 'headphones'], song: ['music', 'mic'], film: ['video', 'clapperboard'],
  photo: ['image', 'camera'], video: ['film', 'play'], news: ['newspaper', 'megaphone'],
  newspaper: ['news', 'article'], magazine: ['book', 'article'], download: ['arrow', 'save'],
  upload: ['arrow', 'cloud'], save: ['floppy', 'bookmark'], internet: ['globe', 'wifi'],
  email: ['mail', 'send'], message: ['speech', 'chat'], speech: ['message', 'mic'],
  speak: ['message', 'mic'], talk: ['message', 'chat'], tell: ['message', 'speech'],
  ask: ['help', 'question'], answer: ['message', 'check'], question: ['help', 'circle'],
  eat: ['utensils', 'plate'], drink: ['cup', 'glass'], cook: ['cooking', 'pot'],
  run: ['footprints', 'activity'], walk: ['footprints', 'person'], come: ['arrow', 'right'],
  go: ['arrow', 'right'], leave: ['log', 'out'], return: ['arrow', 'left', 'rotate'],
  arrive: ['map', 'pin', 'flag'], travel: ['plane', 'luggage'], trip: ['luggage', 'route'],
  hotel: ['bed', 'building'], luggage: ['briefcase', 'bag'], passport: ['id', 'card'],
  ticket: ['admission', 'stamp'], booking: ['calendar', 'check'], reservation: ['calendar', 'check'],
  happy: ['smile', 'laugh'], sad: ['frown', 'tear'], angry: ['frown', 'flame'],
  afraid: ['frown', 'alert'], excited: ['smile', 'sparkles'], calm: ['smile', 'waves'],
  nervous: ['frown', 'activity'], surprised: ['smile', 'sparkles'], tired: ['battery', 'moon'],
  love: ['heart', 'smile'], want: ['heart', 'sparkles'], need: ['hand', 'checklist'],
  hope: ['sparkles', 'sun'], think: ['brain', 'lightbulb'], know: ['brain', 'book'],
  remember: ['brain', 'bookmark'], forget: ['brain', 'eraser'], understand: ['brain', 'lightbulb'],
  big: ['maximize', 'expand'], small: ['minimize', 'shrink'], tall: ['arrow', 'up'],
  short: ['minimize', 'ruler'], long: ['ruler', 'move'], fast: ['zap', 'gauge'],
  slow: ['turtle', 'gauge'], new: ['sparkles', 'plus'], old: ['clock', 'history'],
  hot: ['thermometer', 'flame'], cold: ['snowflake', 'thermometer'], dark: ['moon', 'eye'],
  light: ['lightbulb', 'sun'], many: ['layers', 'hash'], few: ['minus', 'hash'],
  all: ['layers', 'check'], every: ['list', 'checks'], half: ['percent', 'pie'],
  because: ['link', 'git'], therefore: ['arrow', 'right'], but: ['split', 'git'],
  and: ['plus', 'link'], or: ['split', 'git'], if: ['git', 'branch'],
  now: ['clock', 'zap'], often: ['repeat', 'refresh'], always: ['repeat', 'infinity'],
  never: ['x', 'ban'], here: ['map', 'pin'], there: ['map', 'pin'],
  where: ['map', 'pin', 'search'], what: ['help', 'circle'], who: ['user', 'search'],
  how: ['help', 'circle'], why: ['help', 'circle'], which: ['list', 'checks'],
  be: ['check', 'circle'], have: ['plus', 'check'], can: ['check', 'circle'],
  must: ['alert', 'triangle'], should: ['check', 'circle'], not: ['x', 'ban'],
  up: ['arrow', 'up'], down: ['arrow', 'down'], in: ['box', 'log'], out: ['log', 'out'],
  before: ['arrow', 'left'], after: ['arrow', 'right'], left: ['arrow', 'left'],
  right: ['arrow', 'right'], between: ['move', 'horizontal'], beside: ['move', 'horizontal'],
  government: ['landmark', 'building'], law: ['scale', 'gavel'], court: ['scale', 'gavel'],
  society: ['users', 'globe'], security: ['shield', 'lock'], police: ['shield', 'badge'],
  crime: ['shield', 'alert'], tax: ['banknote', 'percent'], economy: ['chart', 'trending'],
  finance: ['chart', 'banknote'], quality: ['award', 'star'], develop: ['trending', 'up'],
  increase: ['trending', 'up'], decrease: ['trending', 'down'], change: ['refresh', 'swap'],
  start: ['play', 'flag'], end: ['flag', 'square'], stop: ['square', 'ban'],
  continue: ['play', 'arrow'], help: ['circle', 'help'], use: ['wrench', 'hand'],
  make: ['wrench', 'hammer'], give: ['hand', 'gift'], take: ['hand', 'grab'],
  wait: ['clock', 'hourglass'], find: ['search', 'magnifier'], search: ['magnifier', 'scan'],
  see: ['eye', 'view'], hear: ['ear', 'volume'], feel: ['heart', 'hand'],
  live: ['house', 'home'], sleep: ['bed', 'moon'], sit: ['armchair', 'chair'],
  stand: ['user', 'person'], wear: ['shirt', 'user'], wash: ['droplet', 'shower'],
  clean: ['sparkles', 'brush'], repair: ['wrench', 'tool'], fix: ['wrench', 'tool'],
  borrow: ['hand', 'swap'], pay: ['banknote', 'credit'], cancel: ['x', 'ban'],
  check: ['clipboard', 'check'], test: ['flask', 'clipboard'], decide: ['check', 'git'],
  choose: ['list', 'checks'], agree: ['check', 'handshake'], refuse: ['x', 'ban'],
  require: ['clipboard', 'alert'], evaluate: ['chart', 'clipboard'], describe: ['text', 'pen'],
  justify: ['message', 'scale'], ponder: ['brain', 'lightbulb'], consider: ['brain', 'scale'],
  meet: ['users', 'handshake'], opportunity: ['door', 'sparkles'], possibility: ['sparkles', 'dice'],
  concept: ['lightbulb', 'idea'], phenomenon: ['eye', 'sparkles'], view: ['eye', 'scan'],
  effect: ['zap', 'trending'], impact: ['zap', 'target'], point: ['map', 'pin'],
  consensus: ['users', 'check'], understanding: ['brain', 'handshake'],
  this: ['pointer', 'mouse'], that: ['pointer', 'mouse'], together: ['users', 'link'],
  everywhere: ['globe', 'map'], for: ['gift', 'hand'], with: ['link', 'users'],
  first: ['award', 'medal'], second: ['medal', 'number'], third: ['medal', 'number'],
  name: ['user', 'tag'], age: ['calendar', 'user'], birthday: ['cake', 'gift'],
  address: ['map', 'pin'], number: ['hash', 'dial'], nationality: ['flag', 'globe'],
  finnish: ['flag', 'languages'], english: ['flag', 'languages'], chinese: ['flag', 'languages'],
  snack: ['cookie', 'apple'], intersection: ['signpost', 'route'],
}
/* Abstract words have no literal pictogram. Give each family a broad pool of
   related glyphs so (a) the meaning is still hinted at, and (b) no word ever
   falls through to an arbitrary alphabetical icon such as "biohazard".
   `keys` are looked up in the Lucide name index; `names` are exact additions. */
const CONCEPTS = [
  { zh: ['我', '你', '他', '她', '我们', '你们', '他们', '它', '自己', '某个', '两者都', '谁', '某人'],
    en: ['i', 'me', 'you', 'he', 'she', 'we', 'they', 'it', 'oneself', 'someone', 'both'],
    keys: ['user', 'person', 'contact'], names: ['user', 'user-round', 'users', 'users-round', 'person-standing', 'contact', 'circle-user', 'circle-user-round', 'user-check', 'user-search', 'user-group', 'user-cog', 'user-pen', 'user-key', 'user-lock', 'user-shield', 'user-star', 'user-x', 'user-plus', 'user-minus', 'user-square', 'contact-round'], boost: 90 },
  { zh: ['向上', '向下', '去', '来', '出发', '离开', '返回', '到达', '进入', '前进', '上升', '下降', '方向'],
    en: ['upwards', 'downwards', 'go', 'come', 'depart', 'leave', 'return', 'arrive', 'direction'],
    keys: ['arrow', 'move', 'navigation', 'corner', 'chevrons'], names: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'arrow-up-right', 'arrow-down-right', 'move-up', 'move-down', 'navigation', 'compass', 'signpost', 'route'], boost: 80 },
  { zh: ['说', '讲', '告诉', '提到', '强调', '建议', '推荐', '描述', '论证', '回答', '问', '讨论', '解释'],
    en: ['mention', 'emphasise', 'suggest', 'recommend', 'describe', 'tell', 'answer', 'discuss', 'explain'],
    keys: ['message', 'speech', 'quote', 'megaphone', 'text', 'type'], names: ['message-square', 'message-circle', 'messages-square', 'message-square-quote', 'message-square-reply', 'message-square-text', 'megaphone', 'quote', 'text-quote', 'mic', 'speech'], boost: 85 },
  { zh: ['想', '知道', '记得', '忘记', '理解', '认为', '考虑', '意味', '概念', '怀疑', '深思', '琢磨', '兴趣'],
    en: ['think', 'know', 'remember', 'forget', 'understand', 'consider', 'mean', 'concept', 'doubt', 'ponder', 'interest'],
    keys: ['brain', 'lightbulb', 'idea', 'sparkles'], names: ['brain', 'brain-cog', 'brain-circuit', 'lightbulb', 'sparkles', 'circle-help', 'circle-question-mark', 'dice', 'scale', 'git-branch', 'notebook-pen'], boost: 85 },
  { zh: ['注意', '察觉', '识别', '发现', '看见', '观察', '检查', '寻找', '寻找', '检测', '视角'],
    en: ['notice', 'detect', 'perceive', 'recognise', 'discover', 'observe', 'search', 'find', 'view'],
    keys: ['eye', 'scan', 'search', 'binoculars', 'magnifier'], names: ['eye', 'eye-closed', 'scan-eye', 'scan-search', 'scan-face', 'search-check', 'search', 'view', 'binoculars', 'scan-text'], boost: 85 },
  { zh: ['确认', '证明', '证实', '承认', '同意', '验证', '保证', '正确', '结果证明'],
    en: ['confirm', 'prove', 'admit', 'grant', 'agree', 'verify', 'turn', 'check'],
    keys: ['check', 'badge', 'clipboard', 'shield'], names: ['badge-check', 'clipboard-check', 'shield-check', 'circle-check', 'circle-check-big', 'check-check', 'list-checks', 'square-check-big', 'message-square-check'], boost: 85 },
  { zh: ['否认', '拒绝', '阻止', '避免', '打断', '取消', '不', '没有', '否定', '禁止'],
    en: ['deny', 'prevent', 'block', 'avoid', 'interrupt', 'cancel', 'negative', 'forbid'],
    keys: ['ban', 'pause', 'octagon', 'shield', 'square'], names: ['ban', 'circle-x', 'octagon-x', 'shield-x', 'pause', 'circle-pause', 'octagon-pause', 'hand', 'message-square-x', 'square-x'], boost: 85 },
  { zh: ['喜欢', '爱', '高兴', '生气', '伤心', '害怕', '哭', '兴奋', '失望', '紧张', '希望', '感觉', '情绪'],
    en: ['like', 'love', 'happy', 'angry', 'sad', 'afraid', 'cry', 'excited', 'disappointed', 'nervous', 'hope', 'feel'],
    keys: ['heart', 'smile', 'frown', 'laugh', 'tear', 'droplet'], names: ['heart', 'heart-pulse', 'heart-handshake', 'smile', 'smile-plus', 'frown', 'laugh', 'droplet', 'droplets', 'sparkles', 'thumbs-up'], boost: 85 },
  { zh: ['得到', '获得', '收到', '接受', '给', '拿', '放', '借', '还', '转账', '交付', '传递'],
    en: ['get', 'receive', 'accept', 'give', 'take', 'transfer', 'hand', 'deliver'],
    keys: ['hand', 'gift', 'package', 'inbox', 'download', 'truck'], names: ['hand', 'hand-coins', 'hand-helping', 'hand-heart', 'hand-platter', 'handshake', 'gift', 'package-open', 'inbox', 'download', 'arrow-left-right', 'send'], boost: 85 },
  { zh: ['能够', '可以', '可能', '使可能', '机会', '能力', '允许', '必须'],
    en: ['able', 'can', 'possible', 'opportunity', 'allow', 'must', 'may'],
    keys: ['key', 'unlock', 'door', 'sparkles', 'check'], names: ['key-round', 'key', 'lock-open', 'unlock-keyhole', 'door-open', 'circle-check', 'sparkles', 'circle-help', 'badge-check'], boost: 85 },
  { zh: ['改变', '更换', '发展', '增加', '减少', '改善', '重复', '继续', '开始', '结束', '过程'],
    en: ['change', 'develop', 'increase', 'decrease', 'improve', 'repeat', 'continue', 'start', 'process'],
    keys: ['refresh', 'repeat', 'rotate', 'recycle', 'swap', 'replace', 'trending'], names: ['refresh-cw', 'refresh-ccw', 'repeat', 'repeat-2', 'recycle', 'replace', 'rotate-cw', 'trending-up', 'trending-down', 'play', 'flag'], boost: 85 },
  { zh: ['力求', '达到', '实现', '成功', '目标', '赢', '竞争', '比赛', '胜利'],
    en: ['strive', 'achieve', 'reach', 'implement', 'goal', 'win', 'competition', 'success'],
    keys: ['target', 'flag', 'trophy', 'goal', 'award', 'medal'], names: ['target', 'goal', 'trophy', 'medal', 'award', 'flag', 'flag-triangle-right', 'trending-up'], boost: 85 },
  { zh: ['建造', '实施', '做', '制造', '修理', '生产', '工作', '劳动'],
    en: ['build', 'implement', 'make', 'produce', 'repair', 'manufacture', 'work'],
    keys: ['hammer', 'wrench', 'construction', 'hard', 'ruler', 'cog', 'briefcase'], names: ['hammer', 'wrench', 'construction', 'hard-hat', 'blocks', 'pencil-ruler', 'ruler', 'cog', 'briefcase', 'factory'], boost: 85 },
  { zh: ['照顾', '帮助', '关心', '保护', '服务', '支持'],
    en: ['care', 'help', 'protect', 'support', 'serve'],
    keys: ['heart', 'hand', 'shield', 'umbrella'], names: ['heart-handshake', 'hand-helping', 'hand-heart', 'handshake', 'heart-pulse', 'shield-check', 'umbrella', 'stethoscope'], boost: 85 },
  { zh: ['属于', '取决于', '关系', '联系', '和', '与', '相关', '连接', '因为', '所以', '因此', '但是'],
    en: ['belong', 'depend', 'relate', 'connect', 'because', 'therefore', 'link'],
    keys: ['link', 'git', 'network', 'workflow', 'waypoints', 'route'], names: ['link', 'link-2', 'git-branch', 'network', 'workflow', 'waypoints', 'route', 'split', 'plus'], boost: 85 },
  { zh: ['钱', '贷款', '利息', '储蓄', '投资', '预算', '消费', '经济', '破产', '通货膨胀', '衰退', '就业', '价格', '税', '账户', '付款', '财务'],
    en: ['loan', 'interest', 'savings', 'investment', 'budget', 'consumption', 'bankruptcy', 'inflation', 'recession', 'employment', 'economic', 'finance', 'transfer', 'product'],
    keys: ['chart', 'banknote', 'coins', 'trending', 'receipt', 'landmark', 'dollar', 'piggy', 'wallet', 'percent', 'calculator'], names: ['chart-line', 'chart-bar', 'chart-pie', 'chart-column', 'chart-area', 'banknote', 'banknote-arrow-up', 'banknote-arrow-down', 'coins', 'piggy-bank', 'receipt', 'landmark', 'badge-dollar-sign', 'circle-dollar-sign', 'wallet', 'trending-up', 'trending-down', 'percent', 'calculator', 'hand-coins'], boost: 80 },
  { zh: ['时间', '时候', '现在', '经常', '总是', '有时', '已经', '等待', '顺序', '先后'],
    en: ['time', 'now', 'often', 'always', 'sometimes', 'wait', 'sequence', 'already'],
    keys: ['clock', 'calendar', 'timer', 'hourglass', 'history', 'alarm'], names: ['clock', 'clock-3', 'calendar-days', 'timer', 'hourglass', 'history', 'alarm-clock', 'repeat', 'calendar-clock'], boost: 80 },
  { zh: ['许多', '少', '所有', '每一个', '部分', '数量', '数字', '多少', '一半', '全部'],
    en: ['many', 'few', 'all', 'every', 'part', 'quantity', 'number', 'half', 'much'],
    keys: ['layers', 'list', 'hash', 'percent', 'pie', 'sigma', 'calculator', 'equal'], names: ['layers', 'layers-2', 'list', 'list-checks', 'hash', 'percent', 'chart-pie', 'calculator', 'equal', 'plus', 'minus'], boost: 80 },
  { zh: ['哪里', '什么', '怎么', '为什么', '怎样', '哪个', '问题'],
    en: ['where', 'what', 'how', 'why', 'which', 'question'],
    keys: ['help', 'question', 'search', 'pin', 'hash'], names: ['circle-help', 'circle-question-mark', 'message-circle-question-mark', 'search', 'map-pin', 'hash', 'user-search'], boost: 80 },
  { zh: ['天气', '雨', '雪', '风', '云', '太阳', '自然', '环境', '空气', '火', '光'],
    en: ['weather', 'rain', 'snow', 'wind', 'cloud', 'sun', 'nature', 'environment', 'air'],
    keys: ['cloud', 'sun', 'snowflake', 'wind', 'tree', 'leaf', 'flower', 'mountain', 'waves', 'flame', 'droplet'], boost: 70 },
  { zh: ['食物', '吃', '喝', '水果', '蔬菜', '面包', '咖啡', '牛奶', '饭', '零食', '餐馆'],
    en: ['food', 'eat', 'drink', 'fruit', 'vegetable', 'bread', 'coffee', 'milk', 'meal', 'snack'],
    keys: ['utensils', 'coffee', 'milk', 'croissant', 'apple', 'carrot', 'cake', 'cookie', 'cup', 'chef', 'cooking', 'soup'], boost: 70 },
  { zh: ['房子', '房间', '家', '门', '窗', '学校', '医院', '商店', '城市', '建筑', '厨房', '卧室'],
    en: ['house', 'room', 'home', 'door', 'window', 'school', 'hospital', 'shop', 'city', 'building'],
    keys: ['house', 'building', 'door', 'window', 'school', 'hospital', 'store', 'landmark', 'library', 'factory'], boost: 70 },
  { zh: ['汽车', '火车', '飞机', '船', '自行车', '街道', '路', '旅行', '交通', '车站'],
    en: ['car', 'train', 'plane', 'ship', 'bicycle', 'street', 'road', 'travel', 'transport'],
    keys: ['car', 'bus', 'train', 'plane', 'ship', 'bike', 'route', 'map', 'signpost', 'luggage', 'ticket', 'fuel'], boost: 70 },
  { zh: ['书', '学习', '研究', '考试', '语言', '词', '句子', '纸', '笔', '文件', '表格', '简历', '合同'],
    en: ['book', 'study', 'research', 'exam', 'language', 'word', 'sentence', 'paper', 'pen', 'document', 'form', 'resume', 'contract'],
    keys: ['book', 'file', 'clipboard', 'pen', 'newspaper', 'graduation', 'library', 'notebook', 'languages'], boost: 70 },
  { zh: ['电脑', '电话', '手机', '网络', '下载', '上传', '保存', '新闻', '报纸', '杂志', '节目', '邮件'],
    en: ['computer', 'phone', 'internet', 'download', 'upload', 'save', 'news', 'newspaper', 'magazine', 'program', 'email'],
    keys: ['laptop', 'monitor', 'smartphone', 'wifi', 'globe', 'download', 'upload', 'save', 'code', 'database', 'server', 'hard', 'newspaper', 'mail'], boost: 70 },
  { zh: ['健康', '病', '药', '身体', '手', '脚', '眼睛', '耳朵', '呼吸', '运动', '疼'],
    en: ['health', 'sick', 'medicine', 'body', 'hand', 'foot', 'eye', 'ear', 'breathe', 'exercise', 'pain'],
    keys: ['heart', 'stethoscope', 'pill', 'thermometer', 'hand', 'footprints', 'eye', 'ear', 'brain', 'activity', 'dumbbell', 'accessibility'], boost: 70 },
  { zh: ['政府', '法律', '法院', '国家', '社会', '安全', '警察', '犯罪', '公共'],
    en: ['government', 'law', 'court', 'country', 'society', 'security', 'police', 'crime', 'public'],
    keys: ['landmark', 'scale', 'gavel', 'shield', 'flag', 'users', 'building'], boost: 70 },
]
const CONCEPT_POOLS = CONCEPTS.map((c) => ({
  ...c,
  pool: uniq([...(c.names ?? []), ...c.keys.flatMap((k) => TOKEN_INDEX.get(k) ?? [])])
    .filter((n) => ICONS[n] && GOOD.has(n)),
}))
const ZH_CONCEPT_KEYS = CONCEPT_POOLS.map((c) => c.zh).flat().sort((a, b) => b.length - a.length)

const STOP = new Set(`the and for with not one into about can has have are was were its his her you your she he they this that from but all any some very more most much many other another each every both such only even also than then when where what which who why how to of in on at be a an do does did is am or as by so if no yes there here it we us our their them get take make give put set let keep one thing part way will shall must had been being seem may might could would should out up down over under again further once`.split(' '))

/* Ordered, hand-curated depiction lists per subject area. This is the
   semantic floor: a word whose gloss has no literal pictogram still gets a
   glyph from its OWN subject area, never an arbitrary leftover icon. Order
   matters - the most representative depiction comes first. */
const THEME = {
  food: `utensils cooking-pot croissant coffee cup-soda milk apple carrot cake cookie beef fish egg soup salad sandwich pizza wheat cherry grape banana citrus wine beer glass-water popcorn donut candy chef-hat drumstick refrigerator microwave store shopping-basket`,
  home: `house home door-open key-round lock lamp bed sofa armchair bath shower-head toilet brick-wall grid-3x3 app-window archive tv washing-machine broom brush refrigerator table bookmark package`,
  transport: `car bus train-front plane bike ship sailboat route map signpost parking-circle fuel car-taxi-front ticket luggage building-2 store landmark bridge road compass anchor`,
  travel: `plane luggage map-pin bed hotel id-card ticket ship anchor sailboat route compass camera image tent mountain flag globe calendar sun umbrella`,
  family: `users user-round baby person-standing contact heart handshake gift cake id-card user-search user-plus accessibility house home`,
  personal: `id-card user-round contact map-pin phone mail tag flag calendar cake hash clipboard-list`,
  numbers: `hash calculator percent chart-pie list layers equal plus minus numbers coins banknote`,
  time: `clock calendar calendar-days timer hourglass history alarm-clock watch sunrise sunset repeat moon sun`,
  study: `book book-open graduation-cap pen pencil school library notebook-pen clipboard-list file-text languages type microscope backpack certificate award text quote`,
  work: `briefcase building-2 factory hammer wrench hard-hat clipboard-list chart-line target clock calendar users presentation`,
  economy: `chart-line chart-pie banknote coins piggy-bank receipt landmark wallet percent calculator trending-up trending-down package tag store shopping-cart factory`,
  society: `landmark scale gavel shield flag users building-2 vote id-card file-text globe map banknote`,
  health: `heart heart-pulse stethoscope pill thermometer cross activity accessibility hospital ambulance bandage brain eye ear dumbbell`,
  healthy: `heart activity dumbbell apple salad footprints bike bed moon droplet snowflake sun waves`,
  emotions: `smile frown laugh angry meh annoyed heart sparkles droplet cloud sun flame gift`,
  nature: `cloud cloud-rain cloud-snow cloud-sun sun sunrise sunset snowflake wind tree-deciduous tree-pine trees leaf sprout flower mountain waves flame droplet star moon rainbow tornado earth umbrella thermometer bird fish paw-print rabbit squirrel turtle`,
  clothing: `shirt footprints glasses watch crown handbag shopping-bag tag user person-standing umbrella`,
  media: `laptop smartphone monitor keyboard wifi globe download upload save database server newspaper mail tv radio mic music camera image film video headphones printer`,
  shops: `shopping-cart store tag shopping-bag banknote receipt gift package percent wrench phone shopping-basket coins`,
  verbs: `move hand arrow-right arrow-left footprints eye ear message-square brain heart play pause check search clock utensils cup-soda book-open house bed wrench gift phone car`,
  grammar: `link git-branch split plus arrow-right arrow-left repeat clock circle-help search user users hash layers list check ban quote workflow move shapes sparkles`,
  description: `palette ruler maximize minimize arrow-up arrow-down expand shrink star award eye circle square shapes droplet`,
}
const TOPIC_THEME = {
  home: 'home', housing: 'home', household: 'home', objects: 'home',
  'shops-and-services': 'shops', 'shops-services': 'shops',
  travelling: 'transport', 'city-transport': 'transport', direction: 'transport',
  'place-words': 'transport', travel: 'travel',
  food: 'food', 'food-drink': 'food',
  actions: 'verbs', 'common-verbs': 'verbs', 'extended-verbs': 'verbs',
  communication: 'grammar', study: 'study', language: 'study', cognition: 'grammar',
  people: 'family', family: 'family', 'personal-info': 'personal',
  time: 'time', work: 'work', society: 'society', 'society-public': 'society',
  abstract: 'grammar', family: 'family', numbers: 'numbers',
  clothing: 'clothing', health: 'health', 'healthy-living': 'healthy',
  pronouns: 'grammar', demonstratives: 'grammar', 'question-words': 'grammar',
  'grammar-words': 'grammar', adverbs: 'grammar', colloquial: 'grammar',
  postpositions: 'grammar', conjunctions: 'grammar', connectors: 'grammar',
  relatives: 'grammar', 'weather-nature': 'nature', emotions: 'emotions',
  economy: 'economy', 'media-tech': 'media', description: 'description',
}
/* Only verified, depictive names survive; typos are reported, not silently
   dropped into a broken SVG. */
for (const [theme, s] of Object.entries(THEME)) {
  for (const n of uniq(s.split(/\s+/))) {
    if (!CANON.has(n)) console.warn(`  warning: theme ${theme} references unknown icon ${n}`)
  }
}
const THEME_POOLS = Object.fromEntries(Object.entries(THEME).map(([k, s]) => [
  k, uniq(s.split(/\s+/)).filter((n) => CANON.has(n)),
]))
const TOPIC_POOLS = Object.fromEntries(Object.entries(TOPIC_THEME).map(([topic, theme]) => [
  topic, THEME_POOLS[theme] ?? THEME_POOLS.grammar,
]))

/* ── 3. exact-meaning families rendered without a Lucide glyph ─────────── */
const NUMBER_WORDS = {
  '零': '0', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6',
  '七': '7', '八': '8', '九': '9', '十': '10', '十一': '11', '十二': '12',
  '十三': '13', '十四': '14', '十五': '15', '二十': '20', '三十': '30',
  '一百': '100', '一千': '1000', '一百万': '1M',
}
const MONTH_WORDS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu']
const WEEKDAY_WORDS = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai']
const ORDINAL_WORDS = { '第一': 1, '第二': 2, '第三': 3 }
const COLOR_WORDS = {
  '红色': '#D9534F', '蓝色': '#3E7CA6', '绿色': '#3E8E6E', '黄色': '#D9A62E',
  '黑色': '#2C3A47', '白色': '#CBD5DF', '灰色': '#8B98A6', '棕色': '#9A6B45',
  '橙色': '#DD8A3C', '紫色': '#8A5BA8',
}
const SEASON_WORDS = { '春天': 'sprout', '夏天': 'sun', '秋天': 'leaf', '冬天': 'snowflake' }

function exactFamily(row) {
  const zh = row.sense_zh.trim(), lemma = row.lemma.trim().toLowerCase()
  if (NUMBER_WORDS[zh]) return { kind: 'number', value: NUMBER_WORDS[zh] }
  if (ORDINAL_WORDS[zh]) return { kind: 'ordinal', value: ORDINAL_WORDS[zh] }
  const mi = MONTH_WORDS.indexOf(lemma)
  if (mi >= 0) return { kind: 'month', value: mi + 1 }
  const wi = WEEKDAY_WORDS.indexOf(lemma)
  if (wi >= 0) return { kind: 'weekday', value: wi + 1 }
  if (COLOR_WORDS[zh]) return { kind: 'color', value: COLOR_WORDS[zh] }
  if (SEASON_WORDS[zh]) return { kind: 'season', icon: SEASON_WORDS[zh] }
  return null
}

/* ── 4. uniform visual system ─────────────────────────────────────────── */
/* Mid-tone accents stay legible on both the light and dark app themes. */
const ACCENTS = [
  '#2F6F9F', '#C0703A', '#3E8E6E', '#8A5BA8', '#C25454',
  '#B0872F', '#3F8191', '#6B6FA8', '#A45E86', '#4E8360',
]
const PATTERNS = [
  (a) => `<circle cx="16" cy="16" r="2.2" fill="${a}" fill-opacity=".22"/><circle cx="84" cy="84" r="2.2" fill="${a}" fill-opacity=".22"/>`,
  (a) => `<path d="M8 22 H26 M74 78 H92" stroke="${a}" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/>`,
  (a) => `<path d="M12 12 L26 12 M12 18 L20 18 M80 82 L88 82 M80 88 L88 88" stroke="${a}" stroke-opacity=".2" stroke-width="2"/>`,
  (a) => `<circle cx="50" cy="50" r="41" fill="none" stroke="${a}" stroke-opacity=".14" stroke-width="1.5"/>`,
  (a) => `<path d="M10 78 Q20 70 30 78 M70 22 Q80 14 90 22" fill="none" stroke="${a}" stroke-opacity=".22" stroke-width="2"/>`,
  (a) => `<rect x="10" y="10" width="7" height="7" rx="1.5" fill="${a}" fill-opacity=".16"/><rect x="83" y="83" width="7" height="7" rx="1.5" fill="${a}" fill-opacity=".16"/>`,
  (a) => `<path d="M14 14 L86 86" stroke="${a}" stroke-opacity=".1" stroke-width="1.5"/><path d="M86 14 L14 86" stroke="${a}" stroke-opacity=".1" stroke-width="1.5"/>`,
  (a) => `<circle cx="18" cy="50" r="2" fill="${a}" fill-opacity=".2"/><circle cx="82" cy="50" r="2" fill="${a}" fill-opacity=".2"/><circle cx="50" cy="18" r="2" fill="${a}" fill-opacity=".2"/><circle cx="50" cy="82" r="2" fill="${a}" fill-opacity=".2"/>`,
]
const BADGES = [
  (a) => `<circle cx="82" cy="18" r="4" fill="${a}" fill-opacity=".6"/>`,
  (a) => `<circle cx="82" cy="18" r="4" fill="none" stroke="${a}" stroke-opacity=".7" stroke-width="1.8"/>`,
  (a) => `<path d="M82 13 L87 22 H77 Z" fill="${a}" fill-opacity=".6"/>`,
  (a) => `<rect x="78" y="14" width="8" height="8" rx="1.5" fill="${a}" fill-opacity=".55"/>`,
  (a) => `<path d="M78 18 H86 M82 14 V22" stroke="${a}" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>`,
  (a) => `<path d="M78 20 L82 14 L86 20" fill="none" stroke="${a}" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>`,
  (a) => `<circle cx="80" cy="18" r="2" fill="${a}" fill-opacity=".55"/><circle cx="86" cy="18" r="2" fill="${a}" fill-opacity=".55"/>`,
  (a) => `<path d="M78 16 H86 M78 20 H86" stroke="${a}" stroke-opacity=".6" stroke-width="1.8" stroke-linecap="round"/>`,
]
/* Each card is rendered TWICE: a light variant and a dark variant. The app
   loads them as <img>, so the parent page's CSS cannot reach inside the SVG
   document -- a hardcoded light frame would stay a white block in dark mode.
   picture() picks <id>.svg or <id>.dark.svg from the current theme; no data
   model, CSV column or build step needs a second path. Dark accents are the
   same hues lifted towards white so they keep their contrast on the dark
   card, while the meaning band and halo get a slightly stronger fill. */
const THEMES = {
  light: { bg: '#F8FAFC', lift: 0, halo: '.10', band: '.13' },
  dark: { bg: '#22303E', lift: .42, halo: '.16', band: '.22' },
}
function liftHex(hex, amount) {
  if (!amount) return hex
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return '#' + ch.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const CARD_BG = THEMES.light.bg
const FRAME = (a, bg = CARD_BG) => `<rect x="1" y="1" width="98" height="98" rx="18" fill="${bg}" stroke="${a}" stroke-opacity=".42" stroke-width="1.8"/>`
const HALO = (a, opacity = '.10') => `<circle cx="50" cy="44" r="27" fill="${a}" fill-opacity="${opacity}"/>`
const FONT = "Arial, Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif"

function glyph(iconName, accent) {
  const inner = ICONS[iconName]
  // Lucide glyphs are 24x24 line art. Scale into the 54x54 art box; `color`
  // resolves any currentColor references in the source markup.
  return `<g transform="translate(23 17) scale(2.25)" color="${accent}" fill="none" stroke="${accent}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
}

/* The short Chinese gloss is printed on every card. An approximate pictogram
   (e.g. a carrot for 土豆) or an abstract word (仅仅) would otherwise be
   ambiguous; the label makes the meaning exact for all 977 words. */
function captionLabel(row) {
  const zh = String(row.sense_zh ?? '').trim()
  const first = (zh.split(/[；;、,，/／()（）\s]/)[0] || row.sense_en || '').trim()
  return Array.from(first).slice(0, 5).join('')
}
function caption(row, accent, bandOpacity = '.13') {
  const label = captionLabel(row)
  const size = label.length >= 5 ? 10 : 12
  return `<rect x="9" y="76" width="82" height="17" rx="8.5" fill="${accent}" fill-opacity="${bandOpacity}"/>` +
    `<text x="50" y="84.6" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${size}" font-weight="600" fill="${accent}">${esc(label)}</text>`
}

function numberCard(value, accent) {
  const size = value.length >= 4 ? 30 : value.length === 3 ? 38 : value.length === 2 ? 48 : 56
  return `<text x="50" y="44" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${accent}">${esc(value)}</text>`
}
function calendarCard(value, accent, dots = 0) {
  const head = `<rect x="28" y="20" width="44" height="52" rx="7" fill="none" stroke="${accent}" stroke-width="2.6"/>`
  const top = `<path d="M28 32 H72" stroke="${accent}" stroke-width="2.6"/><path d="M38 14 V26 M62 14 V26" stroke="${accent}" stroke-width="2.6" stroke-linecap="round"/>`
  const label = `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="22" font-weight="700" fill="${accent}">${value}</text>`
  const week = dots === 0 ? '' : Array.from({ length: 7 }, (_, i) =>
    `<circle cx="${32 + i * 6}" cy="65" r="2.4" fill="${accent}" fill-opacity="${i + 1 === value ? '1' : '.25'}"/>`).join('')
  return head + top + label + week
}
function colorCard(hex, accent) {
  return `<circle cx="50" cy="44" r="25" fill="${hex}"/><circle cx="50" cy="44" r="25" fill="none" stroke="${accent}" stroke-width="2.4" stroke-opacity=".55"/>`
}
function ordinalCard(value, accent) {
  const heights = [44, 34, 26], xs = [30, 50, 70]
  const bars = heights.map((h, i) => `<rect x="${xs[i] - 9}" y="${71 - h}" width="18" height="${h}" rx="3" fill="${accent}" fill-opacity="${i + 1 === value ? '.95' : '.28'}"/>`).join('')
  return bars + `<text x="50" y="23" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="20" font-weight="700" fill="${accent}">${value}</text>`
}

function renderCard(row, plan, themeName = 'light') {
  const th = THEMES[themeName]
  const { pattern, badge, family, icon } = plan
  const a = liftHex(plan.accent, th.lift)
  const art = family
    ? family.kind === 'number' ? numberCard(family.value, a)
      : family.kind === 'month' ? calendarCard(family.value, a)
        : family.kind === 'weekday' ? calendarCard(family.value, a, 7)
          : family.kind === 'ordinal' ? ordinalCard(family.value, a)
            : family.kind === 'color' ? colorCard(family.value, a)
              : glyph(family.icon, a)
    : glyph(icon, a)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="${esc(row.sense_zh)} / ${esc(row.sense_en)}">` +
    FRAME(a, th.bg) + PATTERNS[pattern](a) + HALO(a, th.halo) + art + BADGES[badge](a) + caption(row, a, th.band) + `</svg>\n`
}

/* ── 5. deterministic meaning resolution ─────────────────────────────── */
/* One token -> one depiction. An explicit concept map wins; otherwise the
   token must itself be a real depiction (e.g. "apple" -> apple). A single
   synonym hop closes cases such as "bicycle" -> bike. */
function iconForToken(t) {
  const mapped = EN_TO_ICON[t]
  if (mapped && CANON.has(mapped)) return mapped
  if (CANON.has(t)) return t
  for (const s of SYNONYMS[t] ?? []) {
    const m = EN_TO_ICON[s]
    if (m && CANON.has(m)) return m
    if (CANON.has(s)) return s
  }
  return null
}

/* An ORDERED list of candidate pictograms for this word, strongest first.
   There is no global fuzzy scoring: a word is never demoted to an unrelated
   leftover icon just because an earlier word already used its best glyph. */
function candidatesFor(row) {
  const seen = new Set(), out = [], exact = []
  const add = (name, via) => {
    if (!name || !CANON.has(name) || seen.has(name)) return
    seen.add(name); out.push({ icon: name, via }); exact.push(name)
  }
  // Pool candidates (families / concepts / topics) are appended after ALL of
  // the word's own exact mappings, so a second literal gloss always beats a
  // merely related glyph from the first gloss's family.
  const addPool = (name, via) => {
    if (!name || !CANON.has(name) || seen.has(name)) return
    seen.add(name); out.push({ icon: name, via })
  }
  const tokens = (txt) => String(txt ?? '').toLowerCase().split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
  add(PINNED[row.id] ?? PINNED[row.lemma], 'pinned')
  const zh = String(row.sense_zh ?? '')
  const first = zh.split(/[；;、,，/／()（）\s]/)[0]
  // Curated compound glosses first; a single-character key must match exactly.
  for (const k of ZH_ICON_KEYS) {
    if (k.length === 1 ? first === k : zh.includes(k)) { add(ZH_TO_ICON[k], 'zh-exact'); break }
  }
  let hits = 0
  // Longest Chinese keyword first; at most three matches so 水果 does not
  // also fire the short key 水. Single-character keys must match the whole
  // first sense: 信 inside 相信, 电 inside 电视, 关 inside 有关 or 冰 inside
  // 冰箱 are not that character's meaning and produced nonsense glyphs.
  for (const k of ZH_KEYS) {
    const hit = k.length === 1 ? first === k : zh.includes(k)
    if (!hit) continue
    // "circle help" / "file text" / "map pin" are one Lucide name; resolving
    // only the first word would give a bare circle / file / map instead.
    const phrase = ZH_TO_EN[k].toLowerCase().trim().replace(/\s+/g, '-')
    add(EN_TO_ICON[phrase] ?? (CANON.has(phrase) ? phrase : null), 'zh')
    for (const t of tokens(ZH_TO_EN[k])) add(iconForToken(t), 'zh')
    if (++hits >= 3) break
  }
  for (const t of tokens(row.sense_en)) add(iconForToken(t), 'en')
  for (const t of tokens(String(row.motif ?? '').replace(/-/g, ' '))) add(iconForToken(t), 'motif')
  // Related depictions for the exact candidates, closest family first.
  for (const n of exact) for (const f of FAMILY_OF.get(n) ?? []) addPool(f, 'family')
  // Abstract words: a matching concept family (emotions, finance, ...) first.
  const enSet = new Set(tokens(row.sense_en))
  const matchedConcepts = CONCEPT_POOLS.filter((c) =>
    c.zh.some((k) => zh.includes(k)) || c.en.some((t) => enSet.has(t)))
  for (const c of matchedConcepts) for (const n of c.pool) addPool(n, 'concept')
  // Topic floor: rotate over the most representative depictions of the word's
  // own subject area, never over the long tail of loosely related glyphs.
  const pool = (TOPIC_POOLS[row.topicId] ?? TOPIC_POOLS.actions ?? THEME_POOLS.grammar).slice(0, 16)
  const shift = pool.length ? hashInt(row.id, 'topic') % pool.length : 0
  for (let i = 0; i < pool.length; i++) addPool(pool[(i + shift) % pool.length], 'topic')
  for (const n of GENERIC_FALLBACK) addPool(n, 'generic')
  return out
}

/* Explicit overrides for the 50 reviewed demo rows and any word whose
   automatic best match is clearly wrong. These are checked manually. */
const PINNED = {
  olla: 'circle-check', puhua: 'messages-square', syödä: 'utensils', tulla: 'arrow-right',
  haluta: 'heart', tarvita: 'list-checks', kysyä: 'circle-help', vastata: 'message-square-reply',
  asua: 'house', opiskella: 'book-open', ystävä: 'users', perhe: 'users-round',
  aika: 'clock', työ: 'briefcase', kaupunki: 'building-2', kieli: 'languages',
  ihminen: 'user', vuosi: 'calendar-days', muistaa: 'brain', kertoa: 'message-square',
  juoda: 'cup-soda', nousta: 'arrow-up', tavata: 'handshake', valita: 'list-checks',
  mahdollisuus: 'door-open', käsite: 'lightbulb', yhteisymmärrys: 'handshake',
  pohtia: 'brain', arvioida: 'clipboard-check', tutkimus: 'search', yhteiskunta: 'globe',
  vaikutus: 'zap', ilmiö: 'eye', näkökulma: 'scan-eye', perustella: 'scale',
  kasite: 'lightbulb', 'xw-tama': 'mouse-pointer-2', 'xw-tuo': 'mouse-pointer-click',
  'xw-ei': 'ban', 'xw-kanssa': 'link', 'xw-varten': 'gift', 'xw-joka': 'git-branch',
  'xw-kaikkialla': 'globe', katu: 'route', leipä: 'croissant', vesi: 'droplet',
  vaate: 'shirt', housut: 'shirt', takki: 'shirt', kengät: 'footprints',
  hedelmä: 'cherry', vihannes: 'leafy-green', lentokone: 'plane', matka: 'luggage',
  porkkana: 'carrot', kana: 'drumstick', omena: 'apple', kirja: 'book',
  satama: 'anchor', ostaa: 'shopping-cart', farkut: 'shirt', seteli: 'banknote',
  joku: 'user-search', nuori: 'user-round', lapsi: 'baby', jokainen: 'list-checks',
  selkä: 'person-standing', keho: 'accessibility', lattia: 'grid-3x3',
  milloin: 'calendar-search', lausua: 'mic', teksti: 'file-text', tehtävä: 'clipboard-list',
  kärry: 'shopping-cart', osallistua: 'users', jäätyä: 'snowflake', mielipide: 'message-square',
  kansalainen: 'id-card', vaalit: 'vote', yhteinen: 'users-round', arki: 'calendar-days',
  jätteet: 'trash', haarukka: 'utensils', kansalaisuus: 'flag', kamera: 'camera',
  kansio: 'folder', matkakohde: 'tickets-plane', viisumi: 'id-card', tulli: 'shield-check',
  nivel: 'activity', hoito: 'stethoscope', syy: 'git-fork', tapahtuma: 'calendar-check',
  kuitenkin: 'split', ellei: 'circle-help', painava: 'arrow-down', todellinen: 'badge-check',
  riittävä: 'circle-check', tarkoittaa: 'quote', edellyttää: 'clipboard-list',
  raha: 'banknote', maksu: 'banknote', takuu: 'shield-check', korjaamo: 'wrench',
  pelokas: 'frown', pelätä: 'frown', palkata: 'user-plus', tuomioistuin: 'scale',
  matkavakuutus: 'shield-check', kotoutuminen: 'users', sekunti: 'timer',
  etunimi: 'user-round', välipala: 'cookie', risteys: 'signpost', kuu: 'moon',
  viikko: 'calendar-days', kuukausi: 'calendar', väri: 'palette', appelsiini: 'citrus',
  // pronouns, directions and other words that need an exact, distinct glyph
  minä: 'user', sinä: 'user-round', hän: 'person-standing', me: 'users',
  te: 'users-round', 'he': 'user-group', se: 'circle-user', jokin: 'circle-help',
  itse: 'user-round-check', molemmat: 'users-2', ylös: 'arrow-up', alas: 'arrow-down',
  mennä: 'arrow-right', miten: 'circle-help',
  // economy / finance: one precise pictogram per concept
  tilisiirto: 'arrow-left-right', laina: 'hand-coins', korko: 'percent',
  säästö: 'piggy-bank', sijoitus: 'trending-up', budjetti: 'chart-pie',
  kulutus: 'banknote-arrow-down', kuluttaja: 'user-round', tuotanto: 'factory',
  tuote: 'package', kilpailu: 'trophy', kilpailija: 'users-round',
  yrittäjä: 'briefcase-business', konkurssi: 'trending-down', inflaatio: 'chart-line',
  taantuma: 'chart-column-decreasing', työllisyys: 'briefcase', taloudellinen: 'chart-bar',
  suositella: 'thumbs-up', ehdottaa: 'lightbulb', varmistaa: 'badge-check',
  huomata: 'eye', havaita: 'scan-eye', tunnistaa: 'scan-face', mainita: 'message-square-quote',
  korostaa: 'megaphone', todistaa: 'shield-check', osoittautua: 'clipboard-check',
  riippua: 'git-branch', merkitä: 'quote', kuulua: 'network', keskeyttää: 'circle-pause',
  pyrkiä: 'target', saavuttaa: 'flag', toteuttaa: 'workflow', rakentaa: 'hammer',
  parantaa: 'trending-up', huolehtia: 'heart-handshake', mahdollistaa: 'key-round',
  estää: 'ban', välttää: 'shield-x', myöntää: 'check-check', kiistää: 'circle-x',
  epäillä: 'circle-question-mark', kiinnostua: 'sparkles', saada: 'hand', voida: 'circle-check',
  tykätä: 'heart', itkeä: 'frown',
}

const GENERIC_FALLBACK = ['circle-help', 'shapes', 'lightbulb', 'sparkles', 'activity',
  'move', 'layers', 'box', 'hash', 'star', 'circle', 'square', 'zap']

/* Fail loudly on a typo: an unknown depiction would be silently skipped and
   the word would quietly fall through to a topic glyph. */
for (const [table, values] of [
  ['ZH_TO_ICON', Object.values(ZH_TO_ICON)],
  ['EN_TO_ICON', Object.values(EN_TO_ICON)],
  ['PINNED', Object.values(PINNED)],
  ['GENERIC_FALLBACK', GENERIC_FALLBACK],
]) {
  const unknown = uniq(values.filter((n) => !CANON.has(n)))
  if (unknown.length) throw new Error(`${table} references unknown depictions: ${unknown.join(', ')}`)
}

/* Everything except the 3 hand-made PNG samples is owned by this generator.
   Re-running it regenerates all 977 SVGs and rewrites the same CSV cells, so
   the output is byte-stable and the manifest is never partial. */
const isGenerated = (row) => !row.image_path || row.image_path.endsWith('.svg')

/* Meaning beats variety: related words may share a glyph (all clothing items
   show a shirt) rather than being pushed onto a misleading "related" icon.
   Every card still carries its own Chinese meaning label, and within one
   five-word learning group two cards never share BOTH glyph and accent, so
   找图 / 听选 options stay visually distinguishable. The global cap only
   prevents one glyph from dominating the whole deck. */
const REUSE_CAP = 20

function groupIndex() {
  const path = join(root, 'data', 'groups.json')
  const map = new Map()
  if (!existsSync(path)) return map
  const groups = JSON.parse(readFileSync(path, 'utf8')).groups ?? []
  for (const grp of groups) {
    if (grp.kind !== 'word') continue
    for (const id of grp.itemIds ?? []) map.set(id, grp.id)
  }
  return map
}

function buildPlans(rows) {
  const groupOf = groupIndex()
  const useCount = new Map(), usedGroupGlyphAccent = new Set()
  const usedSignatures = new Set(), plans = new Map(), viaCounts = new Map()
  let families = 0
  for (const row of rows) {
    if (!isGenerated(row)) continue
    const id = row.id, family = exactFamily(row)
    const gid = groupOf.get(id) ?? `solo:${id}`
    let icon = null, via = family ? `exact:${family.kind}` : 'generic'
    if (family) families++
    else {
      const cands = candidatesFor(row)
      const underCap = (c) => (useCount.get(c.icon) ?? 0) < REUSE_CAP
      // A human-reviewed override always wins; otherwise take the strongest
      // exact meaning candidate. Family / topic pools are only a last resort.
      const best = (cands[0]?.via === 'pinned' ? cands[0] : null)
        ?? cands.find(underCap)
        ?? cands[0]
        ?? { icon: GENERIC_FALLBACK[0], via: 'generic' }
      icon = best.icon; via = best.via
      useCount.set(icon, (useCount.get(icon) ?? 0) + 1)
    }
    viaCounts.set(via, (viaCounts.get(via) ?? 0) + 1)

    let accent = hashInt(id, 'a') % ACCENTS.length
    let pattern = hashInt(id, 'p') % PATTERNS.length
    let badge = hashInt(id, 'b') % BADGES.length
    // The signature mirrors everything in the SVG (glyph/family, Chinese
    // label, accent, pattern, badge) so no two files are byte-identical.
    // The group key additionally guarantees that two words shown together in
    // one round never share BOTH glyph and accent colour.
    const artKey = family ? `family:${family.kind}:${family.value ?? family.icon}` : icon
    const label = captionLabel(row)
    let sig
    for (let n = 0; n < 2000; n++) {
      sig = `${artKey}|${label}|${accent}|${pattern}|${badge}`
      const groupKey = `${gid}|${artKey}|${accent}`
      if (!usedSignatures.has(sig) && !usedGroupGlyphAccent.has(groupKey)) break
      accent = (accent + 1) % ACCENTS.length
      pattern = (pattern + (n % 3 === 2 ? 1 : 0)) % PATTERNS.length
      badge = (badge + (n % 7 === 6 ? 1 : 0)) % BADGES.length
    }
    if (usedSignatures.has(sig)) throw new Error(`cannot make a unique signature for ${id}`)
    usedSignatures.add(sig)
    usedGroupGlyphAccent.add(`${gid}|${artKey}|${accent}`)
    plans.set(id, {
      icon, family, accent: ACCENTS[accent], pattern, badge, match: via, caption: label,
    })
  }
  return { plans, usedIcons: new Set(useCount.keys()), families, viaCounts,
    maxReuse: Math.max(0, ...useCount.values()) }
}

/* ── 6. visual review sheet ──────────────────────────────────────────── */
/* A self-contained page: it works over file:// as well as HTTP, so all 977
   cards can be eyeballed without starting a server. */
function renderSheet(report, cardById, darkCardById) {
  // Embed BOTH theme variants directly instead of linking sibling files: the
  // page then works from file://, a static server, and preview panels that
  // serve only the HTML file (no directory access).
  const sheetData = report.mapping.map((m) => ({
    ...m, svg: cardById.get(m.id), svgDark: darkCardById.get(m.id),
  }))
  const data = JSON.stringify(sheetData)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/\u2028|\u2029/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>插画审阅 · Illustration review</title>
<style>
:root{--bg:#f4f7fa;--surface:#fff;--line:#e1e8ef;--text:#1c2b3a;--muted:#6b7c8d}
:root[data-theme="dark"]{--bg:#0f1720;--surface:#18232e;--line:#2c3b49;--text:#e8eff6;--muted:#9dacbd}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"PingFang SC","Microsoft YaHei",sans-serif}
h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:24px 0 10px}
p.note{color:var(--muted);margin:0 0 18px;max-width:920px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.stat b{font-size:18px;display:block}.stat span{color:var(--muted);font-size:11px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 16px}
input,select{font:14px inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text)}
input{flex:1;min-width:220px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center;overflow:hidden}
.card svg{width:100px;height:100px;display:block;margin:0 auto 8px}
.fi{font-weight:600;font-size:13px;word-break:break-word}
.zh{color:var(--muted);font-size:12px;margin-top:2px;word-break:break-word}
.en{color:#8a99a8;font-size:10px;margin-top:2px;word-break:break-word}
.meta{color:#9aa8b6;font-size:9px;margin-top:6px;border-top:1px solid var(--line);padding-top:5px;word-break:break-all}
.count{color:var(--muted);font-size:12px;margin:0 0 10px}
button.toggle{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);cursor:pointer;font:14px inherit}
</style></head><body>
<h1>插画审阅 / Illustration review</h1>
<p class="note">每张卡片均为 100 × 100 SVG，统一底框、光晕与线宽；底部中文标签直接给出词义，因此抽象词也不会产生歧义。图标来自 Lucide Icons v1.74.0（ISC 许可），见 <code>data/import/LUCIDE-NOTICE.txt</code>。所有 SVG 的 SHA-256 均不相同，且同一五词学习组内不会出现「相同图形 + 相同配色」的两张卡。<b>用「暗色预览」切换主题</b>：浅色 / 暗色是两份独立 SVG，与应用内主题一一对应。</p>
<div class="stats" id="stats"></div>
<div class="bar">
  <input id="q" type="search" placeholder="搜索芬兰语 / 中文 / English / 图标名…" aria-label="search">
  <select id="kind"><option value="">全部匹配方式</option></select>
  <button class="toggle" id="theme" type="button">暗色预览 / Dark preview</button>
  <span class="count" id="count"></span>
</div>
<div class="grid" id="grid"></div>
<script>
const DATA = ${data};
const SUMMARY = ${JSON.stringify({ words: report.words, generated: report.generated, keptPngSamples: report.keptPngSamples, exactMeaningCards: report.exactMeaningCards, distinctGlyphs: report.distinctGlyphs, maxGlyphReuse: report.maxGlyphReuse, distinctSvgHashes: report.distinctSvgHashes, darkDistinctSvgHashes: report.darkDistinctSvgHashes, resolution: report.resolution }).replace(/</g, '\\u003c')};
const stats = [['单词总数', SUMMARY.words],['本次生成', SUMMARY.generated],['保留 PNG 样例', SUMMARY.keptPngSamples],['定制数字/月份/颜色卡', SUMMARY.exactMeaningCards],['不同图形', SUMMARY.distinctGlyphs],['唯一浅色哈希', SUMMARY.distinctSvgHashes],['唯一暗色哈希', SUMMARY.darkDistinctSvgHashes]];
document.getElementById('stats').innerHTML = stats.map(([k,v]) => '<div class="stat"><b>'+v+'</b><span>'+k+'</span></div>').join('');
const kinds = [...new Set(DATA.map(d => d.match))].sort();
const sel = document.getElementById('kind');
for (const k of kinds) { const o = document.createElement('option'); o.value = k; o.textContent = k + ' (' + DATA.filter(d=>d.match===k).length + ')'; sel.appendChild(o); }
function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let dark = false;
function draw(){
  const q = document.getElementById('q').value.trim().toLowerCase(), k = sel.value;
  const list = DATA.filter(d => (!k || d.match===k) && (!q || [d.lemma,d.zh,d.en,d.icon,d.caption,d.id].join(' ').toLowerCase().includes(q)));
  document.getElementById('count').textContent = '显示 ' + list.length + ' / ' + DATA.length;
  document.getElementById('grid').innerHTML = list.map(d =>
    '<div class="card">' + (dark ? d.svgDark : d.svg) +
    '<div class="fi">' + esc(d.lemma) + '</div><div class="zh">' + esc(d.zh) + '</div>' +
    '<div class="en">' + esc(d.en) + '</div><div class="meta">' + esc(d.icon || d.match) + ' · ' + esc(d.match) + '</div></div>').join('');
}
document.getElementById('theme').addEventListener('click', function(){
  dark = !dark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  this.textContent = dark ? '浅色预览 / Light preview' : '暗色预览 / Dark preview';
  draw();
});
document.getElementById('q').addEventListener('input', draw);
sel.addEventListener('change', draw);
draw();
</script></body></html>
`
}

/* ── 7. main ──────────────────────────────────────────────────────────── */
/* Validate the strings we are about to write. This must not depend on the
   files already existing: a first run (or a new theme variant) would
   otherwise report hundreds of "missing" files and fail after succeeding. */
function verifyCards(generated, cardById, variant) {
  const problems = []
  const hashes = new Map()
  for (const row of generated) {
    const rel = `${IMAGE_DIR}${row.id}${variant}.svg`
    const svg = cardById.get(row.id)
    if (!svg) { problems.push(`missing render ${rel}`); continue }
    if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="100" viewBox="0 0 100 100"/.test(svg)) {
      problems.push(`wrong canvas ${rel}`)
    }
    if (/<script|href=|url\(|xlink:href/i.test(svg)) problems.push(`external reference ${rel}`)
    const h = sha(svg)
    if (hashes.has(h)) problems.push(`duplicate ${rel} == ${hashes.get(h)}`)
    hashes.set(h, rel)
  }
  return { count: generated.length, unique: hashes.size, problems }
}

/* --check additionally walks the real files on disk. */
function verifyFiles(rows, variant = '') {
  const generated = rows.filter((r) => r.image_path?.endsWith('.svg'))
  const problems = []
  const hashes = new Map()
  for (const row of generated) {
    const rel = variant ? row.image_path.replace(/\.svg$/i, `${variant}.svg`) : row.image_path
    const file = join(root, rel)
    if (!existsSync(file)) { problems.push(`missing ${rel}`); continue }
    const svg = readFileSync(file, 'utf8')
    if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="100" viewBox="0 0 100 100"/.test(svg)) {
      problems.push(`wrong canvas ${rel}`)
    }
    if (/<script|href=|url\(|xlink:href/i.test(svg)) problems.push(`external reference ${rel}`)
    const h = sha(svg)
    if (hashes.has(h)) problems.push(`duplicate ${rel} == ${hashes.get(h)}`)
    hashes.set(h, rel)
  }
  return { count: generated.length, unique: hashes.size, problems }
}

function main() {
  if (!existsSync(ICON_JSON)) throw new Error(`missing ${ICON_JSON}`)
  const csv = readCsvFiles()
  if (!csv) throw new Error('data/words.csv / data/sentences.csv missing')
  if (csv.wordHeader.join(',') !== WORD_COLS.join(',')) {
    throw new Error('words.csv header changed; update WORD_COLS first')
  }
  const rows = csv.wordRows
  const kept = rows.filter((r) => !isGenerated(r))
  const { plans, usedIcons, families, viaCounts, maxReuse } = buildPlans(rows)
  const generated = rows.filter(isGenerated)
  // Render every card once per theme; the same strings are written to disk,
  // compared by --check, and embedded in the self-contained review page.
  const cardById = new Map(generated.map((row) => [row.id, renderCard(row, plans.get(row.id), 'light')]))
  const darkCardById = new Map(generated.map((row) => [row.id, renderCard(row, plans.get(row.id), 'dark')]))
  const prospective = rows.map((r) => ({ ...r, image_path: isGenerated(r) ? `${IMAGE_DIR}${r.id}.svg` : r.image_path }))
  const stats = verifyCards(generated, cardById, '')
  const darkStats = verifyCards(generated, darkCardById, '.dark')
  const allProblems = [...stats.problems, ...darkStats.problems]
  const resolution = Object.fromEntries([...viaCounts].sort((a, b) => b[1] - a[1]))
  const mapping = generated.map((row) => {
    const plan = plans.get(row.id)
    return { id: row.id, lemma: row.lemma, zh: row.sense_zh, en: row.sense_en,
      caption: plan.caption, icon: plan.icon, match: plan.match,
      accent: plan.accent, pattern: plan.pattern, badge: plan.badge }
  })
  const report = {
    note: 'Deterministic illustration manifest. No timestamps; re-running the generator on unchanged input is byte-stable. Run `node scripts/generate-illustrations.mjs --check` to verify.',
    glyphSource: 'Lucide Icons v1.74.0 (ISC), see data/import/LUCIDE-NOTICE.txt',
    design: 'Every card is 100x100 SVG with the same frame / halo / stroke / meaning band. Two theme variants are generated: a light card (#F8FAFC) and a dark card (#22303E) with lifted accents. A Chinese meaning label on the bottom band makes the meaning exact even for abstract words; accent, pattern and badge make every card visually distinct.',
    canvas: '100 x 100 SVG, identical frame / halo / stroke / meaning band for every card',
    themes: {
      light: { frame: THEMES.light.bg, suffix: '.svg', note: 'default; referenced by words.csv image_path' },
      dark: { frame: THEMES.dark.bg, suffix: '.dark.svg', note: 'selected by app/main.js picture() when data-theme is dark' },
    },
    uniqueness: 'Within each theme the SHA-256 of each SVG is distinct; related words may share a glyph, but two words in the same five-word learning group never share both glyph and accent colour.',
    words: rows.length,
    keptPngSamples: kept.length,
    generated: generated.length,
    exactMeaningCards: families,
    distinctGlyphs: usedIcons.size,
    maxGlyphReuse: maxReuse,
    resolution,
    distinctSvgHashes: stats.unique,
    darkDistinctSvgHashes: darkStats.unique,
    duplicateOrInvalid: allProblems,
    mapping,
  }
  const sheet = renderSheet(report, cardById, darkCardById)

  if (CHECK_ONLY) {
    const pending = rows.filter((r) => !r.image_path).length
    const disk = verifyFiles(prospective)
    const darkDisk = verifyFiles(prospective, '.dark')
    const diskProblems = [...disk.problems, ...darkDisk.problems]
    // Byte-stability check: every SVG of BOTH themes, the manifest and the
    // review page must be exactly what the generator produces from the
    // current CSV + icon set.
    const drift = []
    for (const row of prospective) {
      if (!row.image_path.endsWith('.svg')) continue
      const light = join(root, row.image_path)
      const dark = join(root, row.image_path.replace(/\.svg$/i, '.dark.svg'))
      if (existsSync(light) && readFileSync(light, 'utf8') !== cardById.get(row.id)) drift.push(row.image_path)
      else if (!existsSync(light)) drift.push(`missing ${row.image_path}`)
      if (existsSync(dark) && readFileSync(dark, 'utf8') !== darkCardById.get(row.id)) drift.push(`${row.id}.dark.svg`)
      else if (!existsSync(dark)) drift.push(`missing ${row.id}.dark.svg`)
    }
    for (const [label, path, expected] of [
      ['manifest', REPORT, `${JSON.stringify(report, null, 2)}\n`],
      ['review sheet', SHEET, sheet],
    ]) {
      if (!existsSync(path)) drift.push(`missing ${label}`)
      else if (readFileSync(path, 'utf8') !== expected) drift.push(`${label} drift`)
    }
    console.log(`Check: ${rows.length} words, ${rows.length - pending} declared, ${pending} pending`)
    console.log(`  light: ${disk.count} SVG, ${disk.unique} unique hashes | dark: ${darkDisk.count} SVG, ${darkDisk.unique} unique hashes | ${diskProblems.length} file problem(s)`)
    console.log(`  ${drift.length} file(s) drifted from the deterministic plan`)
    console.log(`  resolution: ${JSON.stringify(resolution)}`)
    for (const p of [...diskProblems, ...drift.map((d) => `drift ${d}`)].slice(0, 20)) console.log('  ERROR ' + p)
    if (pending || diskProblems.length || drift.length || allProblems.length) process.exitCode = 1
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(dirname(SHEET), { recursive: true })
  for (const row of rows) {
    if (!isGenerated(row)) continue
    const rel = `${IMAGE_DIR}${row.id}.svg`
    writeFileSync(join(root, rel), cardById.get(row.id), 'utf8')
    writeFileSync(join(root, rel.replace(/\.svg$/i, '.dark.svg')), darkCardById.get(row.id), 'utf8')
    row.image_path = rel
    row.image_status = 'ready'
    row.image_source = 'lucide-svg'
    row.image_license = 'ISC'
    row.image_reviewStatus = 'pending'
  }
  writeFileSync(WORDS_CSV, serializeCSV(WORD_COLS, rows.map((r) => WORD_COLS.map((c) => r[c] ?? ''))), 'utf8')
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(SHEET, sheet, 'utf8')

  console.log(`Generated ${generated.length} light + ${generated.length} dark SVG illustrations -> ${IMAGE_DIR}`)
  console.log(`  kept ${kept.length} existing PNG samples | exact-meaning cards ${families} | distinct glyphs ${usedIcons.size} | max glyph reuse ${maxReuse}`)
  console.log(`  resolution: ${JSON.stringify(resolution)}`)
  console.log(`  unique light hashes ${stats.unique}/${generated.length} | unique dark hashes ${darkStats.unique}/${generated.length} | problems ${allProblems.length}`)
  console.log(`  updated ${WORDS_CSV}, ${REPORT} and ${SHEET}`)
  if (allProblems.length) { for (const p of allProblems.slice(0, 20)) console.error('  ERROR ' + p); process.exitCode = 1 }
}

main()
