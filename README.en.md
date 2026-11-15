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
| Memorize cards | Lemma, IPA, part of speech, singular/plural, stems and basic cases, CEFR tags on cases and senses, verb-type badge, one image per sense, Chinese and English glosses; each card is read aloud once on entry |
| Practice flow | Every group opens with Memorise and closes with the summary; the checked modes in between are **shuffled per group**, and the five items are **shuffled in every round** (the order stays fixed inside a group, including after a pause, resume or retry). Word groups can use all 6 modes; sentence groups skip the word-only ones. Modes can be toggled in Settings |
| Choice / listen | 4 options; a correct pick turns green, a wrong one turns red and highlights the right option — no text status label; a retry covers only the missed items |
| Find picture | The prompt shows ONE meaning and no picture; four plain word options. A correct pick flips that card over to reveal the word's illustration and plays its pronunciation once; a wrong pick only turns red and highlights the right option — no flip, no sound |
| Dictation | Normal 1.0x and slow 0.5x playback; falls back to syllable-separated speech when no clip exists; a retry also includes items solved with a hint |
| Pronunciation | Pre-recorded clips are played first when declared (slow = `playbackRate=0.5` with pitch preserved); items without a clip fall back to browser TTS, and Settings reports whether a `fi-FI` voice is installed. A card is read aloud once on entering memorize, and once more after a correct pick in Find picture |
| Cloze | A few letters revealed at random, underline slots for the rest, an image hint, and a virtual Finnish letter bar (ä/ö/å) |
| Interface language | Chinese / English, switched from the topbar quick toggle or Settings; buttons, headings, tips, dialogs, mode names, group titles, parts of speech and case names all follow. Word glosses are unaffected |
| Gloss language | Chinese only / English only / both — independent of the interface language |
| Appearance & music | Light / dark / follow-system theme. Background music is off by default and offers **five soothing instrumental tracks**: Morning Mist / Northern Lights / Still Lake / Snowfall / Woodland. Preview each for 12 seconds in Settings before choosing; the choice travels with the exported progress JSON. All tracks are synthesised live with Web Audio (procedural reverb, low-pass, stereo pan, wind bed and low drone), with no audio files, no network and no licensing |
| Progress | `localStorage` holds group progress, a mistake book, an event log (capped at 2000) and game scores. JSON export includes a checksum and a diff preview; import supports merge or overwrite and deduplicates by `anonId + clientSeq` |

`preferences.uiLang` (default `zh`) and `meaningLang` are independent settings; both stay on the device and travel with the exported progress file. The `zh` and `en` dictionaries in `app/i18n.js` must have identical keys (checked by the domain tests), so any new interface string needs both languages. Finnish lemmas, glosses, IPA and example sentences are content and are never translated here.

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

### One CSV row = one complete production unit

When adding vocabulary, fill in the word, glosses, morphology, illustration and audio in a single pass so the same batch never has to be reworked three times. New columns:

| Columns | Purpose |
| --- | --- |
| `image_path` / `image_status` / `image_source` / `image_license` / `image_reviewStatus` / `motif` | One image per sense; `ready` must point to a real file; review state is `pending` or `human-verified` |
| `audio_file` / `audio_source` / `audio_license` / `audio_duration` / `audio_reviewStatus` | One clip per word or sentence; an empty `audio_file` means "no clip yet" and the UI falls back to browser TTS |

Audio convention: put files at `assets/audio/<id>.mp3` (`ogg` / `m4a` / `wav` / `webm` also accepted), set `audio_source` to `tts` / `human` / `other`, record the licence, fill `audio_duration` in seconds (optional) and set `audio_reviewStatus` to `pending` / `human-verified`. **A declared file that does not exist, or a half-filled row, makes `csv-pack.mjs check`, `build-content.mjs` and `validate-content.mjs` fail instead of writing the pack.** Assets that still await human review only produce warnings.

Keep image and audio metadata in the CSV, not in `app/*.js` or `data/content-source.mjs`: the CSV is the authoritative editing layer and overrides the seed on every rebuild. Once clips are present the UI plays them automatically — no code changes needed.

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
app/grouping.js               grouping, question generation, scoring; recipes for the five music tracks
app/i18n.js                   zh/en UI strings and mode/group/POS/case name maps
app/store.js                  local progress, import/export, preferences
app/main.js                   UI and flow controller
app/styles.css                light / dark themes
app/bgm.js                    live synthesis, preview and switching of the five ambient tracks
data/                         content pack, groups, CSV files, source inventory
assets/illustrations/         finished illustrations
assets/audio/                 pre-recorded clips (empty for now; declared in CSV)
scripts/                      build, validation, CSV bridge, domain tests
tests/                        browser regression
```

## Known limitations

- Only 3 finished illustrations (`talo`, `kauppa`, `puhua`); the rest are geometric placeholders. All 50 have `image_reviewStatus: pending` and still need human review.
- The pack declares 0 audio clips, so every item currently uses browser speech synthesis. Most devices lack a `fi-FI` voice, which distorts long/short vowels and `ä/ö/å`. Filling the `audio_*` columns and adding the files automatically switches playback to the recordings.
- IPA, glosses and inflection / Kotus types are marked `auto-derived` and need proofreading. CEFR levels are an internal product convention — neither CEFR nor YKI publishes an official word list.
- The five music tracks are generative ambience (fixed recipes, random notes and spacing), not recorded compositions: offline and licence-free, but the melody differs every time and the timbre depends on the device. To use real recordings later, drop files into `assets/bgm/` and swap the synthesis graph in `app/bgm.js` for `<audio loop>` playback — the `FI.BGM_TRACKS` list and the Settings UI stay as they are.
- No accounts, no backend, no automatic sync; moving to another device requires a JSON export / import.
- Do not rename the internal keys `finnish-learn:v1` (storage key) or `finnish-learn-progress` (export format), or existing progress and exported files become unreadable.

## License

MIT License — see [LICENSE](LICENSE).
