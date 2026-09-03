# Public sources and connected blocks

This release extends the existing Vue, Pinia, normalization and component architecture. Provider definitions and custom sources feed the same request history, cards and renderer. Existing dashboard storage stays in place.

## Use it

1. Choose **Add public source**. Paste an HTTPS endpoint or search a topic. Topic discovery checks the existing catalog and APIs.guru. URL inspection detects the response format and shows real fields and sample values.
2. Add a source card, or open its definition to set the method, parameters, headers, dataset path, pagination, refresh interval and transforms. Webpage extraction requires permission. Agent-proposed webpage definitions wait for review in the source editor.
3. Choose **Connect data**. Select a source, field path, output slot, label, tags and unit. Use source rows to start a table or chart. Join or group rows through the form, or edit the declarative transform list.
4. Create a derived block. Its bindings reference source card IDs and recompute when those cards change. The card's visualization settings contain the same editable bindings and transforms available to WebMCP.
5. **Use all page data** opens structured context with raw and normalized data, selected fields, filters, layout, provenance and freshness.
6. **Share / present** creates a snapshot link. The clean view restores its data, definitions, connections and layout without an editor sidebar or source requests. Review the data before distributing the link.

The discovery button beside the workspace breadcrumb persists its collapsed state. Narrow screens use a drawer with Escape, focus trapping and a close control. The existing dashboard selector, create, duplicate, rename, clear, undo and switch actions remain available.

## Main changed files

| Files | Responsibility |
| --- | --- |
| `src/sources/adapters.ts`, `discovery.ts` | Format detection, structured extraction, OpenAPI candidates and public catalog discovery |
| `src/sources/fetch.ts`, `execute.ts`, `security.ts` | Bounded public requests, pagination, robots checks, request validation, redaction and deterministic IDs |
| `src/types.ts`, `src/api/custom.ts`, `src/runtime/invoke.ts` | Generic source settings through the existing provider and request contracts |
| `src/runtime/bindings.ts`, `src/stores/workspace.ts` | Derived dependencies, joins, grouping, tagged fields, persistence and refresh |
| `src/discover/SourceDiscovery.vue`, `CustomApiEditor.vue` | Discovery, inspection and editable source configuration |
| `src/workspace/ComposeBlock.vue`, `src/widgets/BindingEditor.vue` | Source selection, mappings, tags, joins and transforms through normal controls |
| `src/workspace/context.ts`, `share.ts`, `ShareView.vue` | Structured context, redacted snapshot serialization and presentation view |
| `src/webmcp/workspaceTools.ts`, `register.ts`, `handlers.ts` | Generic tools, schema validation and confirmation requests |
| `src/App.vue`, `src/stores/editor.ts`, `src/style.css` | Share/context actions, sidebar persistence, confirmation dialogs and responsive layout |
| `src/blocks/TableBlock.vue`, `BlockRenderer.vue`, `src/widgets/WidgetShell.vue` | Persistent table filters/sorting, readonly presentation and source freshness |
| `src/runtime/detectValue.ts`, `semantics.ts`, `src/values/ValueRenderer.vue`, Treasury provider metadata | Camel-case labels, year detection without thousands separators and currencies only when supplied by the source |
| `tests/unit/sources-compose-share.test.ts`, `tests/e2e/composition.spec.ts`, `tests/live/public-sources.spec.ts` | Focused domain, responsive workflow and real-network release checks |
| `public/fonts/`, `eslint.config.js`, `package.json`, Playwright configs | Local font delivery and repeatable release checks |

## Supported scope and limits

- Adapters cover JSON, CSV, XML, RSS, Atom, JSON-LD, HTML tables, embedded JSON, GraphQL, Socrata, CKAN and ArcGIS. OpenAPI and Swagger documents yield GET operation candidates. GraphQL queries remain explicit; introspection helps inspect available fields.
- Arbitrary structured public sources need browser access. There is no server proxy, crawler, authentication bypass or execution of embedded scripts. Unstructured pages and tables with merged cells report an actionable error.
- Webpage reads check the permission flag, robots rules and applicable page metadata. Browser CORS restrictions can also prevent reading robots rules. A failure stays visible.
- Source responses are bounded to 5 MB, 5,000 rows and five pages. The public API directory has a separate 12 MB metadata limit. GET refresh runs while the editor is visible. Live non-GET requests require the normal editor and do not replay automatically.
- Joins require compatible key types and unique right-hand keys. Transforms are declarative and bounded. Units can be tagged; the app does not infer or perform unit conversions.
- Share links contain the snapshot in the URL fragment, up to 500 KB before encoding. They are not collaborative workspaces or refreshing dashboards. Headers and request bodies are excluded; credential-shaped fields and URL parameters are redacted. Users must still review ordinary source data before sharing.
- The browser registers 31 native tools. All 53 contracts, including legacy aliases, remain available in the local runner. Registering every alias exceeded the in-app browser's configuration limit, so native registration uses the generic operations and essential catalog/dashboard tools.
- Inference can be ambiguous. Inspect fields and set explicit paths and labels when the suggested view does not answer the question. Raw responses remain available.

## Verification

Final production deployment: `6a988f37c0db89b8ffc83f15` on September 2, 2026.

Live app: https://api-canvas-bclonan.netlify.app

| Command or check | Result |
| --- | --- |
| `npm run verify` | Lint, type-check, 161 unit tests, production build and 20 Playwright tests passed |
| `npx playwright test --config playwright.production.config.ts` | All 20 workflows passed against the deployed site |
| `npx playwright test --config playwright.live.config.ts` | Real Nobel Prize API and MDN HTML table flow passed without intercepted responses |
| `git diff --check` | Passed |
| Native in-app WebMCP | 31 tools discovered on production, successful discovery, inspection, creation, field selection, derived block, mapping, visualization, layout, context and share calls |

The deterministic suite covers 320, 375, 768, 1024 and 1440 pixel layouts. Live screenshots cover desktop and 375 pixels. The in-app check preserved the two pre-existing dashboards, created a separate test dashboard, edited an agent-created binding through the UI, reloaded it and opened its clean share view. Browser warning/error logs were empty at the final check.

The MDN table is an educational example under CC0, not a current music statistics feed. Its source URL is recorded in the cards. Nobel data came from the public API. Neither live source used a fallback fixture.

The release suite runs Chromium with one worker because simultaneous cold-start pages intermittently exceeded navigation deadlines on this machine. The build still reports its large JavaScript chunks as an advisory warning.

Screenshots are in `artifacts/release/editor-1440.png`, `editor-375.png`, `share-1440.png` and `share-375.png`.
