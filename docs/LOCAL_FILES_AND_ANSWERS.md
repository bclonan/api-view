# Local files and question answers

These capabilities extend the existing version 1 content cards, `PresentationSpec`, device storage, block renderer and WebMCP registry. There is no new asset store or model backend.

## Local files and custom style

Choose **Add content**, select **file**, then choose one or more local files. The normal file picker saves copies in the existing IndexedDB `entries` store. **Link original files** uses read-only browser file handles when available. Handles require the user's file selection and may require permission again after reload. A path or URI saves a reference; it cannot grant browser access.

The optional `CanvasContent.files` array holds up to eight references with `id`, `name`, `access`, and optional `uri`, `mediaType`, `size`, `lastModified`, `data`, and `previewIssue`. File bytes and handles stay in IndexedDB under `local-file:<id>`; JSON recipes contain metadata and bounded parsed text/data. Each selected file is limited to 20 MB. Text previews accept files up to 50 KB and parsed data up to 60 KB. The existing 150 KB content-card limit still applies.

PNG, JPEG, WebP, GIF, AVIF and BMP use the value renderer. Audio/video use the existing player and browser codecs. JSON arrays and CSV use the table renderer; JSON objects use record rendering; TXT and Markdown render as plain text. Other files remain downloadable without executing HTML, scripts or SVG. Reconnect a file from **Edit content**. Reconnection creates a new reference so copies on other cards retain their original attachment.

`presentation.props.style` accepts six-digit hex `background`, `color`, and `borderColor`, `fontSize` from 12 to 28, and `textAlign`. The same **Custom style** controls appear in the content editor and each card's presentation settings. Arbitrary CSS is rejected. Styles persist and appear in the clean share view.

The share serializer removes local file contents, device paths and access from file cards, including their raw and normalized envelopes. Share rendering never reads IndexedDB file entries. Values deliberately copied into answer or derived cards remain shareable data. Existing local exports retain references and text snapshots, but do not bundle binary files or permission handles for another device.

WebMCP outcomes report unchecked/unavailable files, read permission, changed originals, session-only storage, unsupported previews and media playback failures. Saved text/data is identified as a snapshot even when the original is unavailable. Permission requests require a visible human action.

Browser behavior follows the [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) and [file picker requirements](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker).

## Questions that create normal blocks

Use **Ask about data** for all or selected cards. Save the question, download structured context, write an answer, or ask the connected WebMCP agent to answer. A saved question has **Open question and answers** to revisit its scope, question and outputs. The page itself does not call a language model.

1. Save a normal content card with `kind: "question"`, `question`, `body`, and `sourceIds`.
2. Call `prepare_canvas_question({ questionBlockId })`. It returns the saved question, scoped raw/normalized/visible data, filters, selected fields, source errors, file availability, provenance, current revision and answer schemas.
3. Call `answer_canvas_question({ questionBlockId, expectedRevision, outputs })`. Each output has `content` plus optional `presentation` and `width`. Return one to six blocks. Cite selected source cards with `blockId`, JSON path and origin. The agent must state missing/stale evidence and must not invent values.
4. The existing `createContent` path saves every output. It adds `answerTo`, the question text and source IDs. The original question remains. Outputs can be edited, reordered, resized, deleted, used as binding sources, and queried again using existing controls/tools.

The same response bundle can be pasted into **Import structured answer blocks**. The UI calls the same domain action. Manual answers are marked user supplied; WebMCP answers are marked agent supplied. Uncited answers remain visibly uncited.

All outputs are validated before any card is added. Invalid schemas, missing evidence, out-of-scope citations, stale revisions and insufficient page capacity return errors without a partial batch. Repeated identical outputs against the same evidence reuse their IDs. Changed evidence marks previous answers for review; a new response can create a fresh result. Deleting the last answer returns its question to the awaiting-answer state.

## Verification

- `tests/unit/local-files-answers.test.ts` covers metadata/schema checks, parsed snapshots, missing files, permissions, changed originals, URL cleanup, style validation, private share state, atomic answer validation, revisions, citations, ordinary bindings and reload.
- `tests/e2e/local-files-answers.spec.ts` covers file selection, rendering, styles, reload, two-source question context, multiple answer blocks, manual answers, normal editing/reordering, share isolation and missing-file reconnection at 320, 375, 768, 1024 and 1440 pixels.

## Release results, September 3, 2026

Production: https://api-canvas-bclonan.netlify.app/

Netlify deploy: `6a98efcb4cc7a2b693658b6c`. The deployment included the existing Unsplash function and used the existing site configuration.

- Lint and type checks passed.
- Unit suite passed, 260 tests.
- Production build passed. The existing bundle-size warning remains.
- Full browser suite passed, 46 tests. An initial run had one development-server module-load timeout after a chart reload. The trace showed a successful module response arriving just beyond the 10-second assertion limit. The assertion now allows 25 seconds for that code-split module; the complete rerun passed.
- Production browser suite for these capabilities passed at all five widths, 5 tests. It covers actual file input, IndexedDB reload, styles, scoped two-card context, multiple answer blocks, normal editing and movement, share isolation and file reconnection.
- Native in-app WebMCP registered 37 tools. The existing six dashboards and active card IDs survived reload. The separate Local files and questions dashboard demonstrates two supplied example datasets, a saved question, cited answer, comparison table, styled unavailable-file reference, and a derived metric bound to the answer table. A stale answer submission failed without creating a card. The normal question editor and local-file controls opened successfully. The native share action returned the local-file exclusion warning and opened its clean view.
- Original-file handle permission transitions were checked with unit doubles. Browser file selection and saved-copy persistence were exercised against production. Linked originals still depend on browser support and the human's read permission.

Live screenshots are saved in `artifacts/release/files-answers-editor-375.png`, `files-answers-editor-1440.png`, `files-answers-share-375.png`, and `files-answers-share-1440.png`. These use the controlled fruit-count test dataset.
