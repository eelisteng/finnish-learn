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
| 背词卡 | 词形、IPA、词性、单复数、词干与基本格、格与义项的 CEFR 标注、动词类型徽标、每义项一图、中英释义 |
| 练习流程 | 单词：背词 → 选词 → 听选 → 找图 → 配对 → 填空 → 听写 → 完成；句子：背词 → 选词 → 听选 → 配对 → 填空 → 完成。设置里可开关 6 种练习模式 |
| 选词 / 听选 / 找图 | 4 个选项；答对变绿、答错变红；重来只针对答错的词 |
| 听写 | 正常 1.0x 与慢速 0.5x，慢速按音节断开朗读；重来包含用过提示的词 |
| 填空 | 随机露出若干字母 + 下划线字母槽 + 图片提示，提供芬兰语虚拟字母栏 |
| 释义语言 | 只中文 / 只英文 / 中英都显示 |
| 外观 | 浅色 / 深色 / 跟随系统主题，可选背景音乐（Web Audio 生成，默认关闭） |
| 进度 | `localStorage` 保存分组进度、错词本、事件日志（上限 2000）与游戏得分；导出 JSON 带校验和、差异预览、合并 / 覆盖两种导入方式，`anonId + clientSeq` 去重 |

## 内容与数据

- 运行时词包：`data/packs/a1-core.json`；浏览器内嵌版：`app/data.js`（供 `file://` 使用）
- 分组索引：`data/groups.json`
- 可编辑种子：`data/content-source.mjs`（50 词 / 35 句）
- 人工编辑层：`data/words.csv`、`data/sentences.csv`（UTF-8 BOM，可用表格软件打开）
- 素材与许可清单：`data/sources.json`；内容类型定义：`src/types/content.ts`

改词库推荐走 CSV 桥接，改完再重建分组与内嵌数据：

```bash
node scripts/csv-pack.mjs export   # JSON 词包 → CSV
# 编辑 data/words.csv、data/sentences.csv
node scripts/csv-pack.mjs check    # 只校验、不写文件
node scripts/csv-pack.mjs import   # CSV → JSON 词包
node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test
```

`csv-pack.mjs import` 会保留人工复核状态，并检查悬空义项、缺失释义等问题。

## 验证

```bash
node scripts/validate-content.mjs --self-test   # 内容结构与分级校验
node scripts/csv-pack.mjs --self-test          # CSV 往返与反例
node scripts/test-flow.mjs                     # 领域流程与练习行为测试
```

浏览器端到端回归：用 headless Chrome 打开 `tests/browser-flow.html`，页面内会输出逐项断言结果。

## 项目结构

```
index.html / preview.html     入口页与词卡原型
app/data.js                   内嵌词包（window.FI_DATA）
app/grouping.js               分组、题目生成、判分等纯领域逻辑
app/store.js                  本地进度、导入导出、偏好
app/main.js                   界面与流程控制
app/styles.css                浅色 / 深色主题
app/bgm.js                    背景音乐
data/                         词包、分组、CSV、素材清单
scripts/                      构建、校验、CSV 桥接、领域测试
tests/                        浏览器回归
```

## 已知限制

- 插画目前 3 张成品（`talo` / `kauppa` / `puhua`），其余为几何占位图；生成图已裁掉水印、修正伪文字，仍需人工复核。
- 发音依赖浏览器自带的 `fi-FI` 语音，缺失时回退，无离线音频文件。
- IPA、释义、屈折 / Kotus 类型等标注来源标记为 `auto-derived`，需人工校对；CEFR 分级是本产品的内部约定，CEFR / YKI 并无官方词表。
- 无账号、无后端、无自动同步；换设备只能靠导出 / 导入 JSON。
- 内部标识 `finnish-learn:v1`（存储键）与 `finnish-learn-progress`（导出格式）不要改，否则旧进度与已导出的文件会读不出来。

## 许可

MIT License，详见 [LICENSE](LICENSE)。
