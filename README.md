# API Canvas

A local-first workspace that turns public API responses into charts, maps, records, images, and tables. Human controls and 31 native WebMCP tools use the same Pinia actions.

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

## Semantic public-data branch

Branch preview: [Open the semantic public-data build](https://6a987ca2b7a2d0eb1c510dda--api-canvas-bclonan.netlify.app).

This branch adds semantic normalization, scored component suggestions and generic request tools before extending the catalog to 30 sources. The 29 reusable views include document cards, comparisons, histograms, calendars and relationship graphs. Numeric IDs and years remain separate from chart measures.

Describe a goal in the command box, inspect the proposed requests, then choose Run this plan. The local planner maps supported subjects, places, dates and filters to typed inputs. It asks about missing locations or unsupported scope. A connected WebMCP agent can plan more broadly through the catalog tools.

Try these two commands in sequence:

> Build me an earthquake research dashboard. Map magnitude 5+ earthquakes from the past week, find recent research about earthquakes, identify the largest earthquake and add its local weather. Pick appropriate views and arrange everything clearly.

> Duplicate the earthquake data as a histogram, make the papers a table showing only title, authors, publication year and DOI, and move the weather beside the map.

The second command reuses the existing responses. Request history also creates additional views without a new request. It persists the latest 40 requests in IndexedDB. Response caches use each capability's TTL; explicit refresh and Test source bypass them. Source tests report actual access on this device, with the last test date and any failure.

See [implementation notes](docs/SEMANTIC_EXPANSION.md) for contracts, supported scope and source checks.

## Use the workspace

Choose a starter dashboard or select a source in Discover. Each operation generates its form from the provider definition. Required inputs can remain empty when adding a widget. Complete them in the resulting widget, or have an agent call `update_widget`.

Each widget has Interface, Data, Request, and Code views. Its menu also opens the original response, input settings, and visualization settings. Tables support sorting, filtering, and pagination. Charts support field mapping. Changing a visualization uses the existing response. Changing request arguments or data mode discards the previous response and reloads it.

The data-mode selector sets the default for new widgets. Every widget identifies its own mode. Sample values are illustrative, fixed fixtures and may not match the chosen search or location. Live requests go directly from the browser to the provider. Failed live requests remain visible errors until you retry or explicitly choose sample data.

Use the Dashboard selector to switch between up to 30 dashboards saved on this device. New dashboard preserves the current one. Manage dashboard offers rename, duplicate, and delete. Clear dashboard asks for confirmation and offers Undo clear while that dashboard remains empty. Deleting or clearing one dashboard leaves its neighbors intact.

The store migrates the previous single workspace into the local dashboard library and leaves the original storage entry intact. Widget IDs and cross-widget bindings survive switching and reload. GET requests and samples replay when restored. Other live HTTP methods wait for an explicit load or refresh, so a reload cannot repeat a write request. In-flight requests are cancelled on switch, clear, or deletion.

Export contains one dashboard's configuration, bindings, transforms, and custom API definitions. It excludes cached API responses. Widget data export contains the original response. Import validates the entire file before replacing the active dashboard. Other dashboards stay saved. Conflicting custom API IDs are rejected rather than overwritten.

## Arbitrary data and bindings

Add API or local data in Discover opens a declarative API editor. It supports a name, base URL, endpoint, HTTP method, generated inputs, path/query/header variables, JSON body, sample response, optional response schema, and dataset path. Preview sample and Test request use the same executor as built-in APIs. Custom definitions appear in Discover and WebMCP search. Settings are local and included in exports; do not enter secrets. Live endpoints must permit browser requests. There is no proxy or backend.

Every response retains its original JSON. Fields in the widget menu reveals nested paths, inferred types, nullability, and representative values. Paths support dots, array indexes, and quoted keys, such as `properties.mag`, `results[0].count`, and `["a.b"]`. `[]` in discovery means an array item.

Visualization settings include visible fields, chart axes, number format, spacing, and source visibility. Data bindings select values independently of those presentation choices. Bind a slot to this widget, another widget, or fixed text. `$data` selects a dataset before transforms. Local normalized paths read each displayed row; original-response paths and references to another widget read that source's complete value. Missing or failed sources produce a visible binding notice.

The existing renderer consumes the bound result. It does not choose components by API identity. Component definitions describe accepted capabilities, slots, properties, and layout choices. Weather, book, and drug views remain optional conveniences. Generic components work with the same data.

Row controls offer sorting and limits. The transform editor also accepts declarative select, rename, filter, map, derive, aggregate, group, flatten, merge, and left-join steps. No scripts run. A configuration has at most 20 steps and transforms inspect at most 5,000 rows. The [agent guide](docs/AGENT_GUIDE.md) documents the step fields.

The Public data dashboard starter uses NASA, USGS, openFDA, and Census through existing adapters. Its final record binds selected values from all four sources. Change that record to metric to make population the primary number. Census stays visibly labeled as a sample.

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

The browser must support the experimental WebMCP API and have a compatible agent connected. The app reports availability. It never installs a substitute `document.modelContext`. The Agent tools dialog can execute the same handlers locally in any browser. That local runner is not evidence of native support. See the verification notes for native browser checks.

| Tool               | Action                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| `search_apis`      | Find operations by goal and category                                              |
| `describe_api`     | Read input definitions and availability                                           |
| `invoke_api`       | Request data without changing the workspace                                       |
| `create_widget`    | Create a widget or a pending input form                                           |
| `create_dashboard` | Append up to 12 widgets                                                           |
| `update_widget`    | Update title, inputs, mode, layout, or presentation                               |
| `refresh_widget`   | Replay one stored request                                                         |
| `refresh_widgets`  | Replay selected or all requests                                                   |
| `transform_widget` | Change visualization without a request                                            |
| `remove_widget`    | Remove a widget and cancel its request                                            |
| `get_workspace`    | Read IDs, status, fields, and revision                                            |
| `export_workspace` | Return versioned configuration                                                    |
| `manage_dashboard` | Create, switch, duplicate, rename, clear, undo clear, or delete a local dashboard |
| `inspect_widget`   | Discover raw paths, types, binding provenance, and compatible views               |
| `list_components`  | Inspect the existing component definitions and capabilities                       |
| `define_api`       | Add a declarative custom API or local dataset to the existing catalog             |

The composer supports a bounded set of local commands for the demo. It does not call a language model. Use a connected WebMCP agent for arbitrary intent planning. See [the agent guide](docs/AGENT_GUIDE.md) and [verification notes](docs/VERIFICATION.md).

## Extend it

Add a provider with `defineApi`, supply its operation inputs, `buildUrl`, `extract`, and `sample`, then include it in the registry. Most providers need no Vue changes. Add semantic hints for ambiguous fields and an optional preferred presentation. Numeric string amounts remain unchanged in the original response and format through semantic field types.

The current scope has no account system, backend proxy, arbitrary endpoint executor, API-key storage, or drag-and-drop layout editor. It supports up to 40 widgets, 12 additions per dashboard call, bounded inputs, and a 5 MB response text limit. Live API content and images still require a network connection.
