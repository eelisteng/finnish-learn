# finnish-learn

简体中文 · [English](README.en.md)

**一词一图，一格一义**

免登录的芬兰语分级学习网页。用中文或英文释义学芬兰语，按 A1–C2 分级、每组 5 个单词或句子；背词卡展示音标、词性、单复数、强弱词干、基本格与动词 1–6 类型，每个义项配一幅图。学习进度只存本机，靠 JSON 导出 / 导入在设备间迁移，不做自动云同步。

## 快速开始

零依赖、零构建，直接用浏览器打开 `index.html` 即可（词包已内嵌为 `app/data.js`，双击以 `file://` 打开也能用）。

需要本地服务时：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

`preview.html` 是词卡原型页，`tests/browser-flow.html` 是浏览器端回归页。

## 功能

| 模块 | 说明 |
| --- | --- |
| 分级与分组 | A1–C2，每组严格 5 条，单词组与句子组分开；学完一组可继续下一组或随时暂停 |
| 背词卡 | 词形、IPA、词性、单复数、词干与基本格、格与义项的 CEFR 标注、动词类型徽标、每义项一图、中英释义；进入每张卡片自动朗读一次 |
| 练习流程 | **模式顺序固定、按难度递进**：背词 → 选词 → 听选 → 找图 → 匹配 → 填空 → 听写 → 完成，绝不随机打乱（从「看释义认词」逐级到「听音写词」）；设置里取消勾选只会跳过该模式，其余仍保持原顺序。只有**每组 5 条题目在每轮内随机出现**（同组内顺序稳定，暂停 / 继续、重来都不变），由 `session.seed` 保证。句子组自动跳过仅适用于单词的找图与听写。旧版乱序的暂停会话在读取时会自动重排为固定顺序并保留当前轮次 |
| 选词 / 听选 | 4 个选项；答对只把该选项变绿、答错变红并高亮正确项，不再显示任何文字提示；重来只针对答错的词 |
| 找图 | 题干只给一条单词释义、**不显示配图**；4 个纯文字单词选项。选对 → 该卡片翻面显示这个词的配图，并自动朗读一次；选错 → 只变红并高亮正确项，不翻面、不发音。四张卡片在电脑和手机上都是**同一个 3:2 横向比例**（桌面 197×132，320px 手机 126×84），翻面前后的尺寸完全一致，不会变成竖长条 |
| 听写 | 正常 1.0× 与慢速 0.5×；无预录音频时按音节断开朗读；重来包含用过提示的词 |
| 发音 | 词包声明音频时优先播放预录文件（慢速用 `playbackRate=0.5` 且保持音高）；未配音频的条目回退浏览器语音合成，设置里会提示本机是否装有 `fi-FI` 语音。背词卡进入时、找图选对后各自动朗读一次 |
| 填空 | 随机露出若干字母 + 下划线字母槽 + 图片提示，提供芬兰语虚拟字母栏 |
| 界面语言 | 中文 / English 一键切换（顶栏快捷按钮或设置里选择）；按钮、标题、提示、弹窗、模式名、分组名、词性与格名同步切换，词条释义不受影响 |
| 释义语言 | 只中文 / 只英文 / 中英都显示；与界面语言互相独立 |
| 外观与音乐 | 浅色 / 深色 / 跟随系统主题；背景音乐默认关闭，可选 **5 首舒缓纯音乐**：薄雾 / 极光 / 静湖 / 落雪 / 林间。设置里可逐首试听 12 秒再切换，音轨选择随进度 JSON 导出导入。全部由 Web Audio 实时合成（程序化混响、低通、声像、风声与低音持续层），无音频文件、无需联网、无版权问题 |
| 进度 | `localStorage` 保存分组进度、错词本、事件日志（上限 2000）与游戏得分；导出 JSON 带校验和、差异预览、合并 / 覆盖两种导入方式，`anonId + clientSeq` 去重 |

界面语言（`preferences.uiLang`，默认 `zh`）与释义语言（`meaningLang`）是两套独立设置，都保存在本机并随进度 JSON 一起导出 / 导入。`app/i18n.js` 的 `zh` / `en` 字典键一一对应（领域测试会校验），新增界面文案必须同时补两种语言；芬兰语词条、中英释义、IPA、例句属于内容，不参与翻译。

## 内容与数据

- 运行时词包：`data/packs/a1-core.json`；浏览器内嵌版：`app/data.js`（供 `file://` 使用）
- 分组索引：`data/groups.json`（当前 228 组，每组 5 条）
- 可编辑种子：`data/content-source.mjs`（50 词 / 35 句的人工复核基线）
- 人工编辑层：`data/words.csv`（980 词）、`data/sentences.csv`（151 句），UTF-8 BOM，可用表格软件打开
- 主题映射：`data/topics.json`；导入统计与待办清单：`data/import/import-report.json`
- 素材与许可清单：`data/sources.json`；内容类型定义：`src/types/content.ts`

### A1–B1 词库从哪来

`data/import/finnish_A1-B1_vocabulary_database.xlsx` 是用户提供的 A1–B1 工作簿（6 个工作表：960 词条 / 44 固定表达 / 30 句 / 6 段对话 / 语法目录 / 使用说明）。CEFR 与 YKI **都不发布官方逐词词表**，工作簿自己也在「等级核验」列写明「建议等级，非官方逐词CEFR定级」，因此等级只作为本产品的内部建议。

工作簿只有芬兰语词条、中文释义、词性、建议等级和主题，缺少 IPA、英文释义、词干、格变化、动词变位、插画与音频。导入脚本按以下顺序补齐：

```bash
node scripts/export-sheets.mjs        # XLSX → 6 份可审阅的 CSV 快照（零依赖 OOXML 解析）
node scripts/build-en-glosses.mjs     # 中文 → 英文缓存（已提交，正常构建无需联网）
node scripts/import-a1-b1.mjs         # 合并生成 data/words.csv / data/sentences.csv
node scripts/generate-illustrations.mjs  # 生成全量 SVG 配图（见下节；重跑导入后必须执行）
node scripts/build-content.mjs && node scripts/build-groups.mjs
```

- 英文释义来自 `data/import/en-glosses.csv`（1049 条缓存），`en-overrides.tsv` 与 `en-verbs.tsv`（166 个手写不定式）覆盖机器翻译的错例。
- 形态来自 `data/import/kotus-sanalista-2024.tsv`（Kotus 变格/变位类号 + 辅音交替字母，CC BY 4.0，署名见 `KOTUS-NOTICE.txt`），由 `scripts/fi-morphology.mjs` 推导词干、6 个基本格与动词 1–6 类的主干形式。
- 50 个人工复核词条 / 35 句保持原 ID 与等级不变，重复词条跳过；导入行的 ID 以 `x` 开头，重跑脚本是幂等的。
- 真正不变化的词（Kotus 99、副词、连词）显示 `—`；推导不出来的词标为 `paradigm pending` 并显示 `—`，**不会冒充「不变化」**。
- 整条流水线**确定性可复现**：`SOURCE.txt` 与 `import-report.json` 记录输入内容的 SHA-256，而不是构建时间戳；`csv-pack.mjs import` 同理。输入不变时连跑两遍，15 个生成文件字节完全一致，`git diff` 为空即说明数据没有漂移。

改词库推荐走 CSV 桥接，改完再重建分组与内嵌数据：

```bash
node scripts/csv-pack.mjs export   # JSON 词包 → CSV
# 编辑 data/words.csv、data/sentences.csv
node scripts/csv-pack.mjs check    # 只校验、不写文件
node scripts/csv-pack.mjs import   # CSV → JSON 词包
node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test
```

`csv-pack.mjs import` 会保留人工复核状态，并检查悬空义项、缺失释义等问题。注意：手工改过的 CSV 若重跑 `import-a1-b1.mjs`，只有 `x` 前缀的导入行会被重新生成，人工复核行不受影响。

### 一行 CSV = 一条完整生产单元

扩词时每加一行就一次性配齐「词条 + 释义 + 词形 + 图 + 音频」，避免同一批词返工三遍。新增列：

| 列 | 用途 |
| --- | --- |
| `image_path` / `image_status` / `image_source` / `image_license` / `image_reviewStatus` / `motif` | 每义项一图；`ready` 必须指向真实文件，复核状态为 `pending` 或 `human-verified` |
| `audio_file` / `audio_source` / `audio_license` / `audio_duration` / `audio_reviewStatus` | 每个词或句子一条音频；`audio_file` 留空表示暂无音频，前端回退合成语音 |

音频约定：文件放 `assets/audio/<id>.mp3`（也支持 `ogg` / `m4a` / `wav` / `webm`），`audio_source` 取 `tts` / `human` / `other`，`audio_license` 写明授权，`audio_duration` 填秒数（可空），`audio_reviewStatus` 为 `pending` / `human-verified`。**声明了文件但文件不存在、或只填了半行，`csv-pack.mjs check`、`build-content.mjs` 与 `validate-content.mjs` 都会报错并拒绝生成词包**；未人工复核的素材只报警告。

图片与音频元数据都写在 CSV，不要写进 `app/*.js` 或 `data/content-source.mjs`——CSV 是权威编辑层，从种子重建时也会覆盖回去。素材齐了以后前端会自动优先播放预录文件，无需改代码。

### 全量配图（977 张确定性 SVG）

`assets/illustrations/` 里除了 3 张手工示例 PNG，其余 977 个词条各有一张 `assets/illustrations/<id>.svg`，全部由 `scripts/generate-illustrations.mjs` 从 `data/words.csv` 生成，**不调用任何生图服务、不消耗积分**：

```bash
node scripts/generate-illustrations.mjs          # 生成 SVG + 回写 CSV 图片列 + 报告 + 审阅页
node scripts/generate-illustrations.mjs --check  # 只校验（画布、唯一性、字节漂移），不写文件
```

三条硬约束与实现方式：

| 要求 | 实现 |
| --- | --- |
| 图不重复 | 每张 SVG 的 SHA-256 都不同（977/977）；同一五词学习组内不会出现「相同图形 + 相同配色」的两张卡。底色 / 装饰纹样 / 角标由词条 ID 的 SHA-256 决定 |
| 大小一致 | 全部 `100 × 100`、`viewBox="0 0 100 100"`，同一浅色底框、光晕、线宽与底部中文释义条；浅色 / 深色主题下对比度一致 |
| 简明反映词义 | 中文释义 + 英文释义 + 主题 + 人工 override 组成的确定性语义链，只从经过筛选的 Lucide 具象图标中取图；数字、月份、星期、序数、颜色、季节另有专用数字 / 日历 / 色卡卡面（共 57 张）。底部中文标签让「仅仅」「诊断」这类抽象词也不会有歧义 |

图标取自 **Lucide Icons v1.74.0（ISC）**，图标名与线条数据放在 `data/import/lucide-icons.json`，许可全文见 `data/import/LUCIDE-NOTICE.txt`。生成器会拒绝纯 UI / 编辑器 / 品牌图标和 `file-x`、`percent-square`、`scan-box` 一类的状态变体，避免词义被无关的图形带偏。生成结果、映射表和审阅页都写在 `data/import/illustration-report.json` 与 `tools/illustration-review.html`；**打开审阅页**可以按芬兰语 / 中文 / 英文 / 图标名搜索并按匹配方式筛选，逐张人工复核（当前全部 `image_reviewStatus=pending`）。

输出是确定性的：没有时间戳、没有随机数，输入不变时连跑两遍 977 个 SVG、CSV、报告与审阅页都字节一致。重跑 `import-a1-b1.mjs` 会把导入行的图片列重置为 `pending`，所以重建链路里必须紧接着执行本脚本。

## 验证

```bash
node scripts/fi-morphology.mjs --self-test     # 芬兰语形态推导规则（59 例）
node scripts/validate-content.mjs --self-test  # 内容结构与分级校验
node scripts/csv-pack.mjs --self-test          # CSV 往返与反例
node scripts/import-a1-b1.mjs --dry-run        # 只出报告、不写文件
node scripts/test-flow.mjs                     # 领域流程与练习行为测试
node scripts/generate-illustrations.mjs --check # 977 张 SVG 的尺寸 / 唯一性 / 确定性
node scripts/test-mobile.mjs                   # 找图模式手机适配（需 Node 22+ / 本地 Chrome）
```

可复现性自检：依次重跑 `export-sheets.mjs → build-en-glosses.mjs → import-a1-b1.mjs → generate-illustrations.mjs → build-content.mjs → build-groups.mjs`，`git diff` 应为空（生成文件不含时间戳）。若出现差异，说明输入快照或推导规则被改过，需要复核。

浏览器端到端回归：用 headless Chrome 打开 `tests/browser-flow.html`，页面内会输出逐项断言结果。

`test-mobile.mjs` 通过 DevTools 协议把视口真正模拟成 1280（桌面基准）/ 641（4 列断点）/ 390 / 360 / 320px 并派发**真实 touch 事件**（headless Chrome 的 `--window-size` 最小 500px，模拟不了手机），断言找图模式为 2 列栅格、长芬兰语单词不逐字竖排、点击后图片可见，并把每个手机视口下四张卡片与翻面后的 3:2 宽高比逐一和桌面基准比对。缺少 Node 22 的 `WebSocket` 或本地 Chrome 时会 `SKIP` 并返回 0，不影响其它环境。

## 项目结构

```
index.html / preview.html     入口页与词卡原型
app/data.js                   内嵌词包（window.FI_DATA）
app/grouping.js               分组、题目生成、判分等纯领域逻辑；5 首音轨的合成配方
app/i18n.js                   中英文界面文案、模式/分组/词性/格名映射
app/store.js                  本地进度、导入导出、偏好
app/main.js                   界面与流程控制
app/styles.css                浅色 / 深色主题
app/bgm.js                    背景音乐：5 首氛围音轨的实时合成与试听/切换
data/                         词包、分组、CSV、主题映射、素材清单
data/import/                  原始 XLSX、六份 CSV 快照、英文缓存、Kotus 词表、导入报告
assets/illustrations/         成品插画（3 PNG 示例 + 977 SVG）
assets/audio/                 预录音频（当前为空，按 CSV 声明填充）
tools/illustration-review.html  977 张插画的可搜索审阅页
scripts/xlsx-read.mjs         零依赖 XLSX 解析（inlineStr / sharedStrings）
scripts/export-sheets.mjs     工作簿 → 六份 CSV 快照
scripts/build-en-glosses.mjs  中文 → 英文翻译缓存
scripts/fi-morphology.mjs     芬兰语形态 / IPA 规则推导
scripts/import-a1-b1.mjs      A1–B1 合并导入（幂等）
scripts/generate-illustrations.mjs  全量语义 SVG 配图生成器
scripts/test-mobile.mjs       找图模式手机适配回归（CDP 视口 + touch）
scripts/                      其余构建、校验、CSV 桥接、领域测试
tests/browser-flow.html       全模式浏览器回归
tests/mobile-find-image.html  手机视口 / 长单词 / 真实 touch 断言页
```

## 已知限制

- 980 条配图现在全部是成品（3 张手工示例 PNG + 977 张确定性 SVG），不再是几何占位图；但**全部 `image_reviewStatus` 仍是 `pending`**，需用 `tools/illustration-review.html` 人工复核语义与观感后才能标记为 `human-verified`。抽象词靠底部中文标签表意，单个线稿图标无法逐字「画出」词义。
- 词包目前 0 条预录音频，全部走浏览器语音合成；多数设备没有 `fi-FI` 语音，长短音与 `ä/ö/å` 会失真。补齐 CSV 的 `audio_*` 列并放入文件后会自动切换为预录播放。
- **导入行的 IPA、英文释义、词干、6 个基本格、动词主干形式全部是 `auto-derived` 规则推导，未经芬兰语专家校对，不可直接当教材发布。** 800/930 个词条有 Kotus 类号，其余按词形猜测或标 `paradigm pending`。工作簿的等级只是建议值，CEFR / YKI 并无官方词表。
- 句子目前只提供逐词 chip，没有 `senseId` / 格标注（工作簿未给逐词注解），因此句子的 CEFR 门槛不会由 gloss 反推。
-  workbook 的「日常口语（Puhekieli）」「常见搭配」「语法目录」暂存在 `data/import/*.csv`，尚未进入运行时数据模型。
- A1 一屏会列出 83 张分组卡（69 词组 + 14 句组）；数据规模上来后建议加分页或「只显示未学」，目前仍是全量平铺。
- 5 首背景音乐是浏览器实时生成的氛围音（配方固定、音符与间隔带随机），不是录好的乐曲：离线、无文件、无版权，但每次听到的旋律都不同，音色取决于设备。若日后要换成真实录音，把文件放进 `assets/bgm/`，再把 `app/bgm.js` 的合成图换成 `<audio loop>` 播放即可，`FI.BGM_TRACKS` 的曲目清单与设置 UI 无需改动。
- 无账号、无后端、无自动同步；换设备只能靠导出 / 导入 JSON。
- 内部标识 `finnish-learn:v1`（存储键）与 `finnish-learn-progress`（导出格式）不要改，否则旧进度与已导出的文件会读不出来。

## 许可

项目源码为 MIT License，详见 [LICENSE](LICENSE)。第三方素材另有许可：Lucide Icons v1.74.0 为 ISC（见 `data/import/LUCIDE-NOTICE.txt`），Kotus / Yle 词表为 CC BY 4.0（见 `data/import/KOTUS-NOTICE.txt`），用户提供的 A1–B1 工作簿按项目所有者授权使用。来源清单见 `data/sources.json`。
