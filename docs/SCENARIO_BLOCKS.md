# Sports, places and adaptive cards

Released September 2, 2026 at [API Canvas](https://api-canvas-bclonan.netlify.app/). Production deployment `6a98c39bbbd483ec3ee8e546` uses the existing Netlify configuration. This extends the existing application and dashboard storage.

## New views

The registry now has 36 explicit views plus automatic selection. Seven new views cover sports scores, team records, places, news, events, people and products. MLB games and ESPN competitions become scoreboards. ESPN team responses retain the team identity and record instead of displaying nested statistic arrays. A missing score stays missing; zero remains a valid score.

Maps use OpenStreetMap for valid coordinates. Address-only records show their supplied address and a map search link. The app does not invent coordinates or geocode addresses automatically. Unknown records keep a readable generic view with expandable nested data. Original responses remain available in Data.

Existing cards retain explicit visualization choices and field mappings. To change an older card, open its visualization settings and select Automatic or the desired new view. The same controls edit agent-created cards.

## Failure behavior

WebMCP results include status, usable data, issues and recovery guidance. Failed requests return an error rather than successful completion. Timeout, network/CORS, rate-limit, invalid response, empty response, missing fields, incompatible views, blocked dependencies and failed refreshes have explicit outcomes. Rate-limit guidance retains a readable Retry-After header when the server exposes it.

`create_block` accepts `waitForData: false` to return the saved block ID while its request runs. Other cards can continue loading. `list_blocks` identifies pending cards, cards needing attention and usable cards. Failed refreshes mark retained data as stale. Sample recovery appears only when the source actually has a fixture.

## Main changed files

| Files | Change |
| --- | --- |
| `src/runtime/scenarios.ts`, `structure.ts`, `detectValue.ts` | Shape-based extraction, canonical mappings, nested collections and season handling |
| `src/blocks/ScenarioBlock.vue`, `MapBlock.vue`, `BlockRenderer.vue`, `definitions.ts`, `src/types.ts` | Seven views, geographic rendering, bounded generic content and registry slots |
| `src/runtime/outcomes.ts`, `errors.ts`, `src/stores/workspace.ts` | Shared loading, partial-data and failure outcomes |
| `src/webmcp/workspaceTools.ts`, `handlers.ts`, `src/workspace/context.ts` | Structured tool outcomes, background creation and page context |
| `src/widgets/WidgetShell.vue`, `BindingEditor.vue` | Recovery controls, stale data and editable mappings |
| `src/api/custom.ts`, `src/sources/execute.ts` | Consistent response-path extraction and normalized cache version |
| `tests/unit/scenarios-outcomes.test.ts`, `tests/fixtures/scenarios.ts` | Inference, rendering, raw-data preservation and failure contracts |
| `tests/e2e/scenarios.spec.ts`, `tests/live/scenarios.spec.ts` | Responsive workflows and real-source production smoke |

## Verification

| Command or check | Result |
| --- | --- |
| `npm run verify` | Lint, type-check, 191 unit tests, build and 25 browser tests passed |
| `npx playwright test --config playwright.production.config.ts` | All 25 production browser tests passed |
| `npx playwright test --config playwright.live.config.ts tests/live/scenarios.spec.ts` | Real MLB and Open-Meteo responses, ESPN failure handling, derived card, persistence and share flow passed |
| Responsive scenarios | 320, 375, 768, 1024 and 1440 px passed with controlled responses |
| In-app browser | 31 native tools registered; 36 component definitions discovered; real MLB and location cards combined into a derived card; clean share view opened |

The in-app browser used a new dashboard, `Sports and places · verified views`. The three existing dashboards retained their card counts. A Maryland Matters RSS request returned a structured network failure with recovery guidance.

## Limits and evidence

ESPN failed browser access in the real-source test. Maryland Matters RSS also failed in the in-app browser. This release reports those failures accurately; it does not bypass source access restrictions or fabricate substitute content. Provider uptime and browser CORS policy still apply. OpenStreetMap tiles require internet access. Unrecognized provider shapes may need an explicit response path or field mapping. Vite still reports the existing large-chunk advisory.

- [Desktop editor](../artifacts/release/scenarios-editor-1440.png)
- [Mobile editor](../artifacts/release/scenarios-editor-375.png)
- [Desktop share view](../artifacts/release/scenarios-share-1440.png)
- [Mobile share view](../artifacts/release/scenarios-share-375.png)
- [Real-source outcomes](../artifacts/release/scenarios-live-outcomes.json)
