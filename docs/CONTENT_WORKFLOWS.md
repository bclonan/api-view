# Content, media and canvas questions

API Canvas keeps its existing Vue components, Pinia workspace, source adapters and declarative bindings. Local content adds an optional versioned content field to an existing widget. It does not create another dashboard engine or require a server.

## Populate cards

Use **Add content** to write notes, add public media URLs, attach text files, or import structured content from an agent. Every content card has **Edit content** in its options. The editor can import or export its JSON specification. JSON arrays become datasets. TXT, Markdown, JSON and CSV files can be attached as downloadable text; larger or binary files use public URLs.

The version 1 contract accepts `note`, `summary`, `answer`, `question`, `search-results`, `file`, `dataset` and `embed`. It includes a title, optional body and question, records, public URL, player type, text file, source card IDs and citations. `get_content_spec` returns the exact schema and examples. A card is limited to 150 KB, with up to 1,000 rows and 20,000 characters of prose. The existing workspace limit remains 40 cards.

Local datasets use the same type inference, component registry, field mapping and derived bindings as API responses. They retain the original records. Search results can use the news component with title, description, URL and date fields. Existing table, map, metric, timeline and other views remain available.

## Media and stock prices

The six added component types are `embed`, `video`, `audio`, `note`, `file` and `stock-chart`. There are 42 explicit views plus automatic selection.

Native video and audio use browser playback controls. Provider links support YouTube, Vimeo, Spotify and SoundCloud. Other public HTTPS URLs can load in a restricted frame. External frames require **Load embed** and do not autoplay. Original links remain available. Providers can reject framing, restrict playback or require a login. The app cannot reliably detect every blocked frame and reports it as unverified, rather than claiming it played.

Stock charts accept dated open, high, low and close values, optional volume, symbol and currency. They support candlesticks, closing-price lines, a volume panel, zoom and an accessible data table. The chosen symbol and style persist. Explicit X/Y mapping can supply date and close fields. Invalid dates and missing prices are omitted; incomplete OHLC values use gaps or closing prices. No values are fabricated. No bundled live market feed is implied. The editor's example uses a clearly labeled DEMO series.

## Questions and answers

**Ask about data** uses all cards or the current selection. Each card also has **Ask about this card**. Users can save a question for their connected agent or download its evidence context. **Summarize page** produces a local overview of visible record counts, up to three numeric field ranges per card, excerpts and source errors.

An agent reads `prepare_canvas_question` with an optional list of block IDs. The response contains bounded raw and normalized data, visible filtered rows, freshness, source attribution, errors and the answer schema. The agent uses `create_content_block` for a new answer or `update_content_block` to replace a saved question with its answer. It should pass the returned revision and cite actual block IDs and available JSON paths.

This application does not run an LLM or perform a new web search when the question is saved. The connected agent supplies open-ended answers and any externally researched content. The local summary only describes supplied data. User-written, agent-written and calculated content have distinct labels.

Citations capture the state of their source cards, including raw responses. A changed or removed source produces a review warning in the editor, WebMCP results and shared snapshots. This check is conservative: changes in raw provider metadata can also prompt review. Derived cards update through their existing bindings; authored prose requires review or regeneration. A citation proves a reference exists, not that the author's interpretation is correct.

## Changed files

- `src/api/content.ts`, `src/runtime/content.ts` and `src/stores/workspace.ts` implement local content validation, storage, editing, duplication and evidence tracking.
- `src/blocks/EmbedBlock.vue`, `ContentBlock.vue`, `StockChart.vue`, `BlockRenderer.vue` and `definitions.ts` add the six views through the existing registry.
- `src/runtime/embeds.ts`, `market.ts` and `outcomes.ts` handle media URLs, price mapping and recoverable failures.
- `src/workspace/ContentEditor.vue`, `AskCanvas.vue`, `insights.ts` and `context.ts` provide population and question workflows.
- `src/webmcp/workspaceTools.ts`, `contracts.ts`, `src/types.ts`, `src/stores/editor.ts`, `src/App.vue`, `src/widgets/WidgetShell.vue` and the existing share modules connect those workflows to the editor, tools and snapshots.
- `tests/unit/content-media-insights.test.ts` and `tests/e2e/content.spec.ts` add the focused verification. Existing live checks now expect 36 native tools.

## Tools and failure states

Five tools extend the existing registration, bringing native WebMCP registration to 36 tools:

- `get_content_spec`
- `create_content_block`
- `update_content_block`
- `prepare_canvas_question`
- `summarize_canvas`

Content creation uses deterministic keys, schema validation and revision checks. Every result remains editable through normal controls. Existing move, resize, visualization, binding, sharing and workspace tools work with content cards.

Per-card outcomes include `awaiting_answer`, `uncited_content`, `stale_content`, `invalid_embed`, `embed_unverified`, `playback` and `incomplete_prices`. They include recovery advice. Existing source timeout, CORS, rate-limit, empty and binding failures still apply. Empty search responses remain empty.

Only public HTTPS URLs are accepted for embeds and content links. HTML and scripts remain text. File attachments have an allowed text format and matching extension. Generic frames cannot navigate the top-level application or use its origin. Shared state uses the existing credential redaction and 500 KB size limit. Users should still review authored notes and files before sharing them.

## Verification

`tests/unit/content-media-insights.test.ts` covers contract errors, provider URLs, text escaping, prices, local persistence, editing, duplication, binding updates, citation validity, stale evidence, scoped questions, filtering, summary values, revision checks and WebMCP outcomes.

`tests/e2e/content.spec.ts` covers the complete flow at 320, 375, 768, 1024 and 1440 pixels. It exercises visible note editing, stock rendering, a derived metric, click-to-load embeds, playback failure and retry, file download contents, a saved question, a cited answer, changed-source warnings, reordering, reload, sidebar collapse and clean sharing. Media responses and prices in this deterministic suite are controlled fixtures, including when run against the deployed application.
