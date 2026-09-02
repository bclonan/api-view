# API Canvas

A local-first workspace that turns public API responses into charts, maps, records, images, and tables. Human controls and 12 native WebMCP tools use the same Pinia actions.

Live app: [api-canvas-bclonan.netlify.app](https://api-canvas-bclonan.netlify.app). See [verification notes](docs/VERIFICATION.md) for the production smoke test and browser limitations.

## Run it

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The address uses IPv4 explicitly to avoid confusing it with another app on localhost. The build is a static Vite app and needs no backend or credentials.

```sh
npm run verify
npm run preview
```

`verify` runs the unit and renderer tests, TypeScript checks, production build, and browser tests. The browser suite uses Playwright Chromium. On a new machine, install its browser with `npx playwright install chromium`.

## Use the workspace

Choose a starter dashboard or select a source in Discover. Each operation generates its form from the provider definition. Required inputs can remain empty when adding a widget. Complete them in the resulting widget, or have an agent call `update_widget`.

Each widget has Interface, Data, Request, and Code views. Its menu also opens the original response, input settings, and visualization settings. Tables support sorting, filtering, and pagination. Charts support field mapping. Changing a visualization uses the existing response. Changing request arguments or data mode discards the previous response and reloads it.

The data-mode selector sets the default for new widgets. Every widget identifies its own mode. Sample values are illustrative, fixed fixtures and may not match the chosen search or location. Live requests go directly from the browser to the provider. Failed live requests remain visible errors until you retry or explicitly choose sample data.

Workspace configuration saves to local storage. Reloading restores the configuration and replays requests. Export contains configuration only. Widget data export contains the original response. Import validates the entire file before replacing the workspace.

## Sources

| Source               | Operation                           | Live support                                       |
| -------------------- | ----------------------------------- | -------------------------------------------------- |
| U.S. Treasury        | Debt to the Penny                   | Verified in the app browser                        |
| Open-Meteo           | Current weather and hourly forecast | Verified                                           |
| USGS                 | Recent earthquakes                  | Verified                                           |
| Open Library         | Book search                         | Verified                                           |
| openFDA              | Drug label search                   | Verified                                           |
| Wikipedia            | Article summary and image           | Verified                                           |
| Open-Meteo Geocoding | Location search                     | Verified                                           |
| NASA Images          | Image search                        | Verified                                           |
| U.S. Census          | 2020 state population               | Sample only, live endpoint now requires an API key |
| GitHub               | Public repository search            | Verified                                           |
| PokéAPI              | Pokémon profile                     | Verified                                           |
| Lorem Picsum         | Photo collection                    | Verified, no location search                       |

Live verification took place on September 2, 2026. Availability and provider rate limits can change. Census returned a missing-key page during verification. This app does not store API keys, so its Census adapter explicitly rejects live requests. The government template includes a labeled Census sample even when the new-widget default is live.

## Architecture

```text
Provider definition
  → generated form / describe_api
  → validated request
  → original response + SemanticResult
  → deterministic presentation selection
  → reusable renderer inside WidgetShell
```

- `src/api/providers/` has one compact adapter per source. Each defines inputs, URL construction, response extraction, semantic hints, and a sample fixture. The registry handles lookup and capability search.
- `src/runtime/` validates inputs, handles transport failures, detects value types and data shapes, and resolves presentations. Original responses remain separate from normalized results.
- `src/stores/workspace.ts` owns widget state, revisions, persistence, import/export, and cancellation. Per-widget request ownership prevents old or removed requests from overwriting newer state.
- `src/blocks/` provides 24 presentation modes. Related record, book, drug, and quote layouts share rendering code. Charts load on demand. The map is a schematic coordinate plot with links to OpenStreetMap, not a tile-based mapping application.
- `src/values/ValueRenderer.vue` formats numbers, currency, percentages, dates, links, images, booleans, coordinates, and other cell values. Remote content renders as text. Executable link schemes are never linked.
- `src/webmcp/` defines exactly 12 stable tools. The catalog is data, rather than one tool per API. AJV validates every call before it reaches the store. Mutations accept an optional `expectedRevision`.

## WebMCP

Tools register through `document.modelContext.registerTool` with registration-owned AbortSignals. Execution cancellation reaches network requests. Registration failures abort the partially registered set. The implementation uses `webmcp-types` and follows [Chrome's imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

The browser must support the experimental WebMCP API and have a compatible agent connected. The app reports availability. It never installs a substitute `document.modelContext`. The Agent tools dialog can execute the same handlers locally in any browser. That local runner is not evidence of native support. Native discovery and all 12 tools were separately verified in the Codex app browser.

| Tool               | Action                                              |
| ------------------ | --------------------------------------------------- |
| `search_apis`      | Find operations by goal and category                |
| `describe_api`     | Read input definitions and availability             |
| `invoke_api`       | Request data without changing the workspace         |
| `create_widget`    | Create a widget or a pending input form             |
| `create_dashboard` | Append up to 12 widgets                             |
| `update_widget`    | Update title, inputs, mode, layout, or presentation |
| `refresh_widget`   | Replay one stored request                           |
| `refresh_widgets`  | Replay selected or all requests                     |
| `transform_widget` | Change visualization without a request              |
| `remove_widget`    | Remove a widget and cancel its request              |
| `get_workspace`    | Read IDs, status, fields, and revision              |
| `export_workspace` | Return versioned configuration                      |

The composer supports a bounded set of local commands for the demo. It does not call a language model. Use a connected WebMCP agent for arbitrary intent planning. See [the agent guide](docs/AGENT_GUIDE.md) and [verification notes](docs/VERIFICATION.md).

## Extend it

Add a provider with `defineApi`, supply its operation inputs, `buildUrl`, `extract`, and `sample`, then include it in the registry. Most providers need no Vue changes. Add semantic hints for ambiguous fields and an optional preferred presentation. Numeric string amounts remain unchanged in the original response and format through semantic field types.

The current scope has no account system, backend proxy, arbitrary endpoint executor, API-key storage, or drag-and-drop layout editor. It supports up to 40 widgets, 12 additions per dashboard call, bounded inputs, and a 5 MB response text limit. Live API content and images still require a network connection.
