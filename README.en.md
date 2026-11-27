# finnish-learn

[简体中文](README.md) · English

**One word, one picture. Learn by doing.**

A no-login Finnish learning web app. Learn Finnish through Chinese or English glosses, with CEFR A1–C2 levels and groups of five words or sentences. Each flashcard shows IPA, part of speech, singular and plural forms, strong and weak stems, basic grammatical cases and verb types 1–6, with one illustration per sense. Progress stays on your device and moves between devices through JSON export / import — there is no automatic cloud sync.

## Quick start

No dependencies and no build step: open `index.html` in a browser. It also works by double-clicking the file (`file://`), because the content pack is embedded in `app/data.js`.

To serve it locally instead:

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

`preview.html` is the word-card prototype; `tests/browser-flow.html` is the browser regression page.

## Features

| Area | What it does |
| --- | --- |
| Levels & groups | A1–C2, exactly 5 items per group, word and sentence tracks kept separate; continue to the next group or pause at any time |
| Memorize cards | Lemma, IPA, part of speech, singular/plural, stems and basic cases, CEFR tags on cases and senses, verb-type badge, one image per sense, Chinese and English glosses; each card is read aloud once on entry |
| Practice flow | **The stage order is fixed and rises in difficulty**: Memorise → Choose → Listen → Find pic → Match → Blanks → Dictation → Done. Modes are never shuffled (recognise a meaning → recognise the sound → recall the word → pair → spell part → write from dictation). Unchecking a mode in Settings only skips it; the rest keep this order. Only the **five items inside a round are shuffled**, and their order stays fixed inside a group (including after a pause, resume or retry), guaranteed by `session.seed`. Sentence groups skip the word-only modes. Paused sessions saved by the old shuffled build are re-ordered into the fixed sequence on load without losing the current round |
| Learning view | Once a group starts, the full stage-label strip collapses into one compact "Step n of 7" pill in the title row (hover for the whole order); the progress bar stays, the stage heading still names the current mode, and phones hide the duplicated item counter so the content sits higher |
| Choice / listen | 4 options; a correct pick turns green, a wrong one turns red and highlights the right option — no text status label; a retry covers only the missed items |
| Find picture | The prompt shows ONE meaning and no picture; four plain word options. A correct pick flips that card over to reveal the word's illustration and plays its pronunciation once; a wrong pick only turns red and highlights the right option — no flip, no sound. All four cards share **one 1:1 square on desktop and phones alike**, matching the square Word Atlas artwork; the reveal fills the whole card and the box never changes on the flip |
| Dictation | The prompt is read aloud automatically once on entry (normal speed; the slow button stays opt-in); normal 1.0x and slow 0.5x playback; falls back to syllable-separated speech when no clip exists; a retry also includes items solved with a hint. No š / ž in the slots: every question offers 14 clickable Finnish letters in two rows of seven, including all letters still needed |
| Pronunciation | Pre-recorded clips are played first when declared (slow = `playbackRate=0.5` with pitch preserved); items without a clip fall back to browser TTS, and Settings reports whether a `fi-FI` voice is installed. A card is read aloud once on entering memorize, and once more after a correct pick in Find picture |
| Cloze | A few letters revealed at random, underline slots for the rest, an image hint, and 14 clickable letters in two rows of seven: every letter still needed plus Finnish distractors, with no š / ž. **Tapping a letter advances a visual cursor without focusing the input**, so the mobile IME never covers the letter keyboard; **filling the last blank submits automatically**, no Submit press needed (manual typing and whole-word paste still work, and the Submit button remains as a fallback) |
| Interface language | Chinese / English, switched from the topbar quick toggle or Settings; buttons, headings, tips, dialogs, mode names, group titles, parts of speech and case names all follow. Word glosses are unaffected |
| Gloss language | Chinese only / English only / both — independent of the interface language |
| Appearance & music | Light / dark / follow-system theme. Background music is off by default and offers **five soothing instrumental tracks**: Morning Mist / Northern Lights / Still Lake / Snowfall / Woodland. Preview each for 12 seconds in Settings before choosing; the choice travels with the exported progress JSON. All tracks are synthesised live with Web Audio (procedural reverb, low-pass, stereo pan, wind bed and low drone), with no audio files, no network and no licensing |
| Progress | `localStorage` holds group progress, a mistake book, an event log (capped at 2000) and game scores. JSON export includes a checksum and a diff preview; import supports merge or overwrite and deduplicates by `anonId + clientSeq` |

`preferences.uiLang` (default `zh`) and `meaningLang` are independent settings; both stay on the device and travel with the exported progress file. The `zh` and `en` dictionaries in `app/i18n.js` must have identical keys (checked by the domain tests), so any new interface string needs both languages. Finnish lemmas, glosses, IPA and example sentences are content and are never translated here.

## Content & data

- Runtime pack: `data/packs/a1-core.json`; browser-embedded copy: `app/data.js` (for `file://`)
- Group index: `data/groups.json` (currently 228 groups of 5 items)
- Editable seed: `data/content-source.mjs` (50 words / 35 sentences — the reviewed baseline)
- Human editing layer: `data/words.csv` (980 words), `data/sentences.csv` (151 sentences), UTF-8 BOM, opens in Excel / Numbers
- Topic map: `data/topics.json`; import statistics and review backlog: `data/import/import-report.json`
- Source and license inventory: `data/sources.json`; content types: `src/types/content.ts`

### Where the A1–B1 vocabulary comes from

`data/import/finnish_A1-B1_vocabulary_database.xlsx` is a user-provided workbook with six sheets (960 headwords / 44 fixed expressions / 30 sentences / 6 dialogues / grammar index / usage notes). **Neither CEFR nor YKI publishes an official per-word vocabulary list**, and the workbook itself labels its level column "建议等级，非官方逐词CEFR定级" (suggested level, not an official per-word CEFR grading). Levels are therefore an in-house convention only.

The workbook contains only Finnish lemmas, Chinese glosses, part of speech, suggested level and topic. IPA, English glosses, stems, case tables, verb paradigms, illustrations and audio are all missing. The import pipeline fills those gaps:

```bash
node scripts/export-sheets.mjs        # XLSX -> six reviewable CSV snapshots (dependency-free OOXML reader)
node scripts/build-en-glosses.mjs     # zh -> en cache (committed; normal builds need no network)
node scripts/import-a1-b1.mjs         # merge into data/words.csv / data/sentences.csv
node scripts/import-atlas-images.mjs  # replace all illustrations with Word Atlas WebP (see below; required after a re-import)
node scripts/build-content.mjs && node scripts/build-groups.mjs
```

- English glosses come from `data/import/en-glosses.csv` (1,049 cached entries); `en-overrides.tsv` and `en-verbs.tsv` (166 hand-checked infinitives) fix machine-translation errors.
- Morphology comes from `data/import/kotus-sanalista-2024.tsv` (Kotus declension/conjugation class + consonant-gradation letter, CC BY 4.0; attribution in `KOTUS-NOTICE.txt`), expanded by `scripts/fi-morphology.mjs` into stems, six basic cases and verb-type 1–6 principal parts.
- The 50 reviewed words / 35 sentences keep their IDs and levels; duplicate lemmas are skipped. Imported IDs start with `x`, so re-running the importer is idempotent.
- Truly indeclinable words (Kotus 99, adverbs, conjunctions) show `—`; words whose paradigm could not be derived are labelled `paradigm pending` and also show `—` — they are **never** mislabelled as indeclinable.
- The whole pipeline is **deterministic**: `SOURCE.txt`, `import-report.json` and `csv-pack.mjs import` record SHA-256 hashes of their inputs rather than build timestamps. With unchanged inputs, two consecutive full rebuilds produce byte-identical output for all 15 generated files, so an empty `git diff` proves nothing drifted.

The CSV bridge is the recommended way to edit vocabulary. Rebuild the group index and embedded data afterwards:

```bash
node scripts/csv-pack.mjs export   # JSON pack -> CSV
# edit data/words.csv and data/sentences.csv
node scripts/csv-pack.mjs check    # validate only, writes nothing
node scripts/csv-pack.mjs import   # CSV -> JSON pack
node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test
```

`csv-pack.mjs import` preserves human review status and checks for dangling senses, missing glosses and similar problems. Re-running `import-a1-b1.mjs` only regenerates the `x`-prefixed imported rows; hand-reviewed rows are untouched.

### One CSV row = one complete production unit

When adding vocabulary, fill in the word, glosses, morphology, illustration and audio in a single pass so the same batch never has to be reworked three times. New columns:

| Columns | Purpose |
| --- | --- |
| `image_path` / `image_status` / `image_source` / `image_license` / `image_reviewStatus` / `motif` | One image per sense; `ready` must point to a real file; review state is `pending` or `human-verified` |
| `audio_file` / `audio_source` / `audio_license` / `audio_duration` / `audio_reviewStatus` | One clip per word or sentence; an empty `audio_file` means "no clip yet" and the UI falls back to browser TTS |

Audio convention: put files at `assets/audio/<id>.mp3` (`ogg` / `m4a` / `wav` / `webm` also accepted), set `audio_source` to `tts` / `human` / `other`, record the licence, fill `audio_duration` in seconds (optional) and set `audio_reviewStatus` to `pending` / `human-verified`. **A declared file that does not exist, or a half-filled row, makes `csv-pack.mjs check`, `build-content.mjs` and `validate-content.mjs` fail instead of writing the pack.** Assets that still await human review only produce warnings.

Keep image and audio metadata in the CSV, not in `app/*.js` or `data/content-source.mjs`: the CSV is the authoritative editing layer and overrides the seed on every rebuild. Once clips are present the UI plays them automatically — no code changes needed.

### Full illustration coverage (980 Word Atlas WebP paintings)

Every one of the 980 headwords has one `<id>.webp` (980 files, all distinct) sourced from the sibling **Word Atlas** project's `word-atlas-main/public/atlas/img/` (**CC BY 4.0**), mapped and copied by `scripts/import-atlas-images.mjs`. **No image-generation service is called and no credits are spent.** These 512 x 512 full-colour paintings are richer and higher-quality than the previous vector icons:

```bash
node scripts/import-atlas-images.mjs          # replace all art by meaning + rewrite CSV + report + review page
node scripts/import-atlas-images.mjs --check  # verify only (uniqueness / files / byte drift)
```

| Requirement | How it is met |
| --- | --- |
| No repeated pictures | 980/980 WebP files have distinct SHA-256 hashes. When a synonym already owns the best image, the importer tries curated `ALTERNATES`, then Word Atlas synonym / family words, then same-topic same-level words — so one word gets one distinct picture |
| Uniform size | All source art is 512 x 512, copied as `<id>.webp`; the UI uses `object-fit: cover` for every image box, with square frames in memorize / choice / cloze / dictation and 1:1 option cards in listen / find-picture |
| Concisely reflects meaning | Resolution chain: curated override (101 numbers / pronouns / function words with no literal image) → exact English gloss → de-"to" / singular / de-parenthesis variants → Chinese gloss mapped to a Word Atlas sense. Function words and numerals use the closest concrete image (e.g. `kaksi` → a pair, `kolme` → a triangle, `minä` → oneself) |

**Themes:** WebP art carries its own background, so it is shown **as-is** in both light and dark themes; there is no `.dark.svg` swap. `picture()` in `app/main.js` uses the CSV path directly and theme changes no longer touch the image URL.

**Layout:** the WebP replacement also drove a responsive relayout of every image-bearing screen. Memorize / choice / cloze / dictation now use larger square art frames; the four listen options pair a full-bleed square painting with the Chinese/English meaning; find-picture still shows four text-only words until a correct pick, then fills the 1:1 card with the illustration and a legible word strip. Desktop keeps four cards in one row, phones (≤640px) use a 2×2 grid, and cards only scale down — no portrait strips, tiny letterboxed thumbnails or one-glyph-per-line labels.

**Provenance and attribution:** art comes from [Word Atlas](../../word-atlas-main) (content CC BY 4.0), credited as **Word Atlas contributors — CC BY 4.0** (licence: https://creativecommons.org/licenses/by/4.0/); images were only copied and renamed to Finnish word IDs, with no visual edits. This is recorded in `data/sources.json` and `data/import/atlas-image-report.json`. The report lists each image's source name, match method and SHA-256; **open `tools/illustration-review.html`** to filter by Finnish / Chinese / English / source name and by match method, and review each card (all are still `image_reviewStatus: pending`). All 980 WebP thumbnails (256px; shipped art is 512x512) are base64-inlined, so the page is fully self-contained: it works over `file://` or when only the single HTML file is published.

Output is deterministic: no timestamps, no randomness. With unchanged input, two consecutive runs produce byte-identical WebP files (980), CSV, report and review page. Re-running `import-a1-b1.mjs` resets imported image columns to `pending`, so this importer must always follow it in the rebuild chain. The legacy SVG generator `generate-illustrations.mjs` is kept only as a fallback and is no longer part of the default chain.

## Validation

```bash
node scripts/fi-morphology.mjs --self-test     # Finnish morphology rules (59 cases)
node scripts/validate-content.mjs --self-test  # content structure and level checks
node scripts/csv-pack.mjs --self-test          # CSV round-trip and negative cases
node scripts/import-a1-b1.mjs --dry-run        # report only, writes nothing
node scripts/test-flow.mjs                     # domain and practice-behavior tests
node scripts/import-atlas-images.mjs --check # 980 WebP: uniqueness / files / byte drift
node scripts/test-mobile.mjs                   # find-image on phones (needs Node 22+ / local Chrome)
node scripts/test-webkit.mjs                   # all 6 modes in real WebKit (needs macOS + swiftc)
```

Reproducibility check: rerun `export-sheets.mjs -> build-en-glosses.mjs -> import-a1-b1.mjs -> import-atlas-images.mjs -> build-content.mjs -> build-groups.mjs`; `git diff` should be empty because no generated file contains a timestamp. Any diff means an input snapshot or derivation rule changed and needs review.

For the browser end-to-end regression, open `tests/browser-flow.html` in headless Chrome; the page prints each assertion result.

`test-mobile.mjs` uses the DevTools Protocol to emulate genuine 1280 (desktop reference) / 641 (4-column breakpoint) / 390 / 360 / 320px viewports and dispatch **real touch events** (plain `--window-size` has a 500px floor in headless Chrome, so it cannot reproduce a phone). It asserts the 2-column grid, that long Finnish lemmas never stack one glyph per line, that the illustration is visible after a tap, and that every card's 1:1 square ratio — before AND after the flip — matches the desktop reference at each phone width. It prints `SKIP` and exits 0 when Node 22's `WebSocket` or a local Chrome is unavailable, so other environments stay green.

`test-webkit.mjs` covers the engine difference Chrome cannot see: it compiles `tests/webkit-find-image.swift` and runs two assertion pages inside a **WKWebView** (the layout engine behind iOS Safari and WeChat in-app browsers). WebKit keeps an anonymous flex box inside every `<button>` and inherits `align-items`, so children of a block button shrink-wrap to their content: the find-image faces once got four different widths (and four different heights), and the choice / match buttons were ~4px narrower than their grid column. Blink ignores `align-items` on a block button, which is why a Chrome-only suite stayed green.

- **Deep suite**: `tests/mobile-find-image.html` measures the four faces and the flipped box at 1280 / 641 / 390 / 360 / 320px, checks the listen grid column, and compares every phone ratio with the desktop 1:1 reference.
- **All-modes suite**: `tests/mobile-all-modes.html` seeds a paused session directly in one mode and covers choice / listen / findImage / match / cloze / dictation at 390 / 360 / 320px — horizontal overflow, one-glyph-per-line wrapping, alignment to the grid column, usable tap targets — and performs a **real interaction** (answer feedback / tile selection / hint reveal) so a painted-but-dead card cannot pass. Three dark-theme cases also assert that `<img>` keeps the same `.webp` path as the light theme rather than a variant or a placeholder fallback.

It prints `SKIP` and exits 0 off macOS or without `swiftc`.

## Project structure

```
index.html / preview.html     app entry and word-card prototype
app/data.js                   embedded content pack (window.FI_DATA)
app/grouping.js               grouping, question generation, scoring; recipes for the five music tracks
app/i18n.js                   zh/en UI strings and mode/group/POS/case name maps
app/store.js                  local progress, import/export, preferences
app/main.js                   UI and flow controller
app/styles.css                light / dark themes
app/bgm.js                    live synthesis, preview and switching of the five ambient tracks
data/                         content pack, groups, CSV files, topic map, source inventory
data/import/                  source XLSX, six CSV snapshots, en cache, Kotus list, import report
assets/illustrations/         finished illustrations (980 Word Atlas WebP, one per word)
assets/audio/                 pre-recorded clips (empty for now; declared in CSV)
tools/illustration-review.html  searchable self-contained review page for all 980 WebP images
scripts/xlsx-read.mjs         dependency-free XLSX reader (inlineStr / sharedStrings)
scripts/export-sheets.mjs     workbook -> six CSV snapshots
scripts/build-en-glosses.mjs  zh -> en translation cache
scripts/fi-morphology.mjs     Finnish morphology / IPA rule derivation
scripts/import-a1-b1.mjs      idempotent A1-B1 merge importer
scripts/import-atlas-images.mjs     Word Atlas WebP illustration importer (semantic matching)
scripts/generate-illustrations.mjs  legacy SVG generator (fallback only, not in default chain)
scripts/test-mobile.mjs       mobile find-image regression (CDP viewport + touch)
scripts/test-webkit.mjs       all-6-mode real-WKWebView regression (macOS)
scripts/                      other build, validation, CSV bridge and domain tests
tests/browser-flow.html       full browser regression
tests/mobile-find-image.html  find-image deep assertions (viewport / long words / real touch)
tests/mobile-all-modes.html   layout / interaction / theme assertions for all 6 modes
tests/webkit-find-image.swift WKWebView geometry probe (compiled by test-webkit.mjs)
```

## Known limitations

- All 980 illustrations are finished Word Atlas WebP paintings (512 x 512 full-colour, one distinct image per word); geometric placeholders are gone. **All are still `image_reviewStatus: pending`** and need a human pass in `tools/illustration-review.html` before being marked `human-verified`. Numbers, pronouns and function words use the closest approximation (filter the review page by `override` / `topic` to focus on those), so their semantics may be imprecise.
- The pack declares 0 audio clips, so every item currently uses browser speech synthesis. Most devices lack a `fi-FI` voice, which distorts long/short vowels and `ä/ö/å`. Filling the `audio_*` columns and adding the files automatically switches playback to the recordings.
- **On imported rows the IPA, English glosses, stems, six basic cases and verb principal parts are all `auto-derived` rule output and have NOT been checked by a Finnish linguist — do not publish them as teaching material.** 800/930 imported lemmas had a Kotus class; the rest were inferred from word shape or marked `paradigm pending`. The workbook's levels are suggestions only.
- Imported sentences carry token chips without `senseId` / case annotation (the workbook has no interlinear glosses), so no CEFR gate is inferred from glosses.
- Colloquial (Puhekieli) variants, collocations and the grammar index are preserved in `data/import/*.csv` but not yet surfaced in the app.
- A1 now renders 83 group cards (69 word + 14 sentence) on one page. Pagination or a "show unstudied only" filter is a sensible next UX step; for now all groups are listed.
- The five music tracks are generative ambience (fixed recipes, random notes and spacing), not recorded compositions: offline and licence-free, but the melody differs every time and the timbre depends on the device. To use real recordings later, drop files into `assets/bgm/` and swap the synthesis graph in `app/bgm.js` for `<audio loop>` playback — the `FI.BGM_TRACKS` list and the Settings UI stay as they are.
- No accounts, no backend, no automatic sync; moving to another device requires a JSON export / import.
- Do not rename the internal keys `finnish-learn:v1` (storage key) or `finnish-learn-progress` (export format), or existing progress and exported files become unreadable.

## License

Project source is MIT License — see [LICENSE](LICENSE). Third-party assets carry their own licences: **illustrations come from Word Atlas, content CC BY 4.0, credited to Word Atlas contributors** (licence: https://creativecommons.org/licenses/by/4.0/; images were only copied and renamed to word IDs). Legacy Lucide Icons v1.74.0 is ISC (`data/import/LUCIDE-NOTICE.txt`, only the fallback generator's glyph source), Kotus / Yle word lists are CC BY 4.0 (`data/import/KOTUS-NOTICE.txt`), and the user-provided A1–B1 workbook is used with the project owner's permission. Full inventory: `data/sources.json`.
