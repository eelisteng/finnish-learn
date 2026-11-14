# finnish-learn

[简体中文](README.md) · English

**One word, one image. One case, one meaning.**

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
| Memorize cards | Lemma, IPA, part of speech, singular/plural, stems and basic cases, CEFR tags on cases and senses, verb-type badge, one image per sense, Chinese and English glosses |
| Practice flow | Words: memorize → choice → listen → find image → match → cloze → dictation → complete. Sentences: memorize → choice → listen → match → cloze → complete. All 6 practice modes can be toggled in Settings |
| Choice / listen / find image | 4 options; correct answers turn green, wrong ones red; a retry covers only the missed items |
| Dictation | Normal 1.0x and slow 0.5x playback, with syllable breaks for the slow version; a retry also includes items solved with a hint |
| Cloze | A few letters revealed at random, underline slots for the rest, an image hint, and a virtual Finnish letter bar (ä/ö/å) |
| Gloss language | Chinese only / English only / both |
| Appearance | Light / dark / follow-system theme, plus optional ambient background music (Web Audio, off by default) |
| Progress | `localStorage` holds group progress, a mistake book, an event log (capped at 2000) and game scores. JSON export includes a checksum and a diff preview; import supports merge or overwrite and deduplicates by `anonId + clientSeq` |

## Content & data

- Runtime pack: `data/packs/a1-core.json`; browser-embedded copy: `app/data.js` (for `file://`)
- Group index: `data/groups.json`
- Editable seed: `data/content-source.mjs` (50 words / 35 sentences)
- Human editing layer: `data/words.csv`, `data/sentences.csv` (UTF-8 BOM, opens in Excel / Numbers)
- Source and license inventory: `data/sources.json`; content types: `src/types/content.ts`

The CSV bridge is the recommended way to edit vocabulary. Rebuild the group index and embedded data afterwards:

```bash
node scripts/csv-pack.mjs export   # JSON pack -> CSV
# edit data/words.csv and data/sentences.csv
node scripts/csv-pack.mjs check    # validate only, writes nothing
node scripts/csv-pack.mjs import   # CSV -> JSON pack
node scripts/build-content.mjs && node scripts/build-groups.mjs && node scripts/validate-content.mjs --self-test
```

`csv-pack.mjs import` preserves human review status and checks for dangling senses, missing glosses and similar problems.

## Validation

```bash
node scripts/validate-content.mjs --self-test   # content structure and level checks
node scripts/csv-pack.mjs --self-test          # CSV round-trip and negative cases
node scripts/test-flow.mjs                     # domain and practice-behavior tests
```

For the browser end-to-end regression, open `tests/browser-flow.html` in headless Chrome; the page prints each assertion result.

## Project structure

```
index.html / preview.html     app entry and word-card prototype
app/data.js                   embedded content pack (window.FI_DATA)
app/grouping.js               grouping, question generation, scoring (pure domain logic)
app/store.js                  local progress, import/export, preferences
app/main.js                   UI and flow controller
app/styles.css                light / dark themes
app/bgm.js                    background music
data/                         content pack, groups, CSV files, source inventory
scripts/                      build, validation, CSV bridge, domain tests
tests/                        browser regression
```

## Known limitations

- Only 3 finished illustrations (`talo`, `kauppa`, `puhua`); the rest are geometric placeholders. Generated images were cropped to remove watermarks and still need human review.
- Pronunciation relies on the browser's built-in `fi-FI` voice with a fallback; there are no offline audio files.
- IPA, glosses and inflection / Kotus types are marked `auto-derived` and need proofreading. CEFR levels are an internal product convention — neither CEFR nor YKI publishes an official word list.
- No accounts, no backend, no automatic sync; moving to another device requires a JSON export / import.
- Do not rename the internal keys `finnish-learn:v1` (storage key) or `finnish-learn-progress` (export format), or existing progress and exported files become unreadable.

## License

MIT License — see [LICENSE](LICENSE).
