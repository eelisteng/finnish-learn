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
| 练习流程 | 每组固定「背词」开场、「完成」收尾，中间勾选的练习模式**每组随机排序**，且每轮组内 5 条题目也**随机出现**（同一组内顺序稳定，暂停 / 继续、重来都不变）。单词组可用 6 种模式，句子组自动跳过仅适用于单词的找图与听写；设置里可开关各模式 |
| 选词 / 听选 | 4 个选项；答对只把该选项变绿、答错变红并高亮正确项，不再显示任何文字提示；重来只针对答错的词 |
| 找图 | 题干只给一条单词释义、**不显示配图**；4 个纯文字单词选项。选对 → 该卡片翻面显示这个词的配图，并自动朗读一次；选错 → 只变红并高亮正确项，不翻面、不发音 |
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

## 验证

```bash
node scripts/fi-morphology.mjs --self-test     # 芬兰语形态推导规则（59 例）
node scripts/validate-content.mjs --self-test  # 内容结构与分级校验
node scripts/csv-pack.mjs --self-test          # CSV 往返与反例
node scripts/import-a1-b1.mjs --dry-run        # 只出报告、不写文件
node scripts/test-flow.mjs                     # 领域流程与练习行为测试
```

可复现性自检：依次重跑 `export-sheets.mjs → build-en-glosses.mjs → import-a1-b1.mjs → build-content.mjs → build-groups.mjs`，`git diff` 应为空（生成文件不含时间戳）。若出现差异，说明输入快照或推导规则被改过，需要复核。

浏览器端到端回归：用 headless Chrome 打开 `tests/browser-flow.html`，页面内会输出逐项断言结果。

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
assets/illustrations/         成品插画
assets/audio/                 预录音频（当前为空，按 CSV 声明填充）
scripts/xlsx-read.mjs         零依赖 XLSX 解析（inlineStr / sharedStrings）
scripts/export-sheets.mjs     工作簿 → 六份 CSV 快照
scripts/build-en-glosses.mjs  中文 → 英文翻译缓存
scripts/fi-morphology.mjs     芬兰语形态 / IPA 规则推导
scripts/import-a1-b1.mjs      A1–B1 合并导入（幂等）
scripts/                      其余构建、校验、CSV 桥接、领域测试
tests/                        浏览器回归
```

## 已知限制

- 插画目前 3 张成品（`talo` / `kauppa` / `puhua`），其余 977 条为几何占位图；全部 `image_reviewStatus` 均为 `pending`，仍需人工复核。
- 词包目前 0 条预录音频，全部走浏览器语音合成；多数设备没有 `fi-FI` 语音，长短音与 `ä/ö/å` 会失真。补齐 CSV 的 `audio_*` 列并放入文件后会自动切换为预录播放。
- **导入行的 IPA、英文释义、词干、6 个基本格、动词主干形式全部是 `auto-derived` 规则推导，未经芬兰语专家校对，不可直接当教材发布。** 800/930 个词条有 Kotus 类号，其余按词形猜测或标 `paradigm pending`。工作簿的等级只是建议值，CEFR / YKI 并无官方词表。
- 句子目前只提供逐词 chip，没有 `senseId` / 格标注（工作簿未给逐词注解），因此句子的 CEFR 门槛不会由 gloss 反推。
-  workbook 的「日常口语（Puhekieli）」「常见搭配」「语法目录」暂存在 `data/import/*.csv`，尚未进入运行时数据模型。
- A1 一屏会列出 83 张分组卡（69 词组 + 14 句组）；数据规模上来后建议加分页或「只显示未学」，目前仍是全量平铺。
- 5 首背景音乐是浏览器实时生成的氛围音（配方固定、音符与间隔带随机），不是录好的乐曲：离线、无文件、无版权，但每次听到的旋律都不同，音色取决于设备。若日后要换成真实录音，把文件放进 `assets/bgm/`，再把 `app/bgm.js` 的合成图换成 `<audio loop>` 播放即可，`FI.BGM_TRACKS` 的曲目清单与设置 UI 无需改动。
- 无账号、无后端、无自动同步；换设备只能靠导出 / 导入 JSON。
- 内部标识 `finnish-learn:v1`（存储键）与 `finnish-learn-progress`（导出格式）不要改，否则旧进度与已导出的文件会读不出来。

## 许可

MIT License，详见 [LICENSE](LICENSE)。
