# Semantic public-data expansion

Branch: `codex/semantic-public-data`.

The existing Vue components, Pinia store, provider registry and WebMCP adapter remain in place. New code extends the shared request and rendering path.

## Data and view selection

`runtime/structure.ts` discovers common nested collections, explicit graph datasets, GeoJSON point features and column-oriented time series. `runtime/semantics.ts` distinguishes JSON primitive types from meaning using field names, parents and several sample values. Each inferred field retains confidence, examples and evidence. Hints cannot turn arbitrary text into a number or an image.

`blocks/definitions.ts` is the component registry. Each suggestion returns compatibility, a score, requirements, a reason and candidate bindings. Latitude and longitude support maps; validated images support galleries; temporal fields and measures support time series. Numeric identifiers and publication years are not chart measures. The 29 registered presentations include histogram, comparison, document, calendar and graph.

`DataEnvelope` uses the existing `SemanticResult` model. The request receipt separately retains the raw response, invocation and request URL. Hacker News retains its original ID response and normalizes bounded child-record requests. No provider ID determines the generic renderer.

## Requests and local state

Requests have typed inputs, validated dates and enums, a 20-second timeout, a 5 MB response limit, four concurrent transfers and spacing between requests to the same host. Errors retain rate-limit retry information. There is no automatic sample fallback.

Configured GET operations cache responses by canonical URL and options. Explicit refresh and source-health checks bypass the cache. IndexedDB stores up to 40 cached responses and 40 request receipts, plus dated source health, prompt history and the action log. Small dashboard recipes continue using the existing localStorage migration and export format.

One response can produce several cards. View changes, selected fields, bindings, declarative transforms, duplication and comparisons reuse the response. The existing transforms cover select, rename, filter, sort, limit, derive, group, aggregate, flatten, merge and a bounded left join. Requests and history stay associated with their dashboard.

## Catalog

The catalog contains 30 sources. The original 12 remain. These 18 additions use typed declarations, sample responses and documented capabilities.

| Source                     | Implemented capabilities                                         | Live check on September 2, 2026            |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Art Institute of Chicago   | Artwork search and exact artwork                                 | Search passed                              |
| Crossref                   | Publication search and DOI lookup                                | Search passed                              |
| PubChem                    | Compound properties by name or CID                               | Name lookup passed                         |
| ClinicalTrials.gov         | Research records by intervention, condition, location and status | Search passed                              |
| Data USA                   | ACS population by state and year                                 | Query passed                               |
| Frankfurter                | Currency reference rates and date ranges                         | Passed after correcting `quotes` parameter |
| Open Brewery DB            | Brewery name, city and state search                              | Passed                                     |
| Nager.Date                 | Country and year public holidays                                 | Passed                                     |
| Hacker News                | Top, new, best, Ask, Show and job feeds                          | Top feed passed                            |
| Library of Congress        | Historical media by query and format                             | Photo search passed                        |
| Federal Register           | Published rule and notice search                                 | Passed                                     |
| FDIC BankFind              | Bank failure records                                             | Passed                                     |
| Bureau of Labor Statistics | A public labor series                                            | Passed                                     |
| TVmaze                     | Television show search                                           | Passed                                     |
| OpenF1                     | Historical session laps, optional driver                         | Passed                                     |
| World Bank                 | Country indicator over a date range                              | Passed, about 18 seconds                   |
| Gutendex                   | Public-domain book search                                        | Timed out after 20 seconds                 |
| Zippopotam.us              | Country and postal-code lookup                                   | Passed                                     |

Open-Meteo and USGS also passed live checks with their expanded inputs. All twelve first-wave sources in the specification returned live data. These checks used the Codex in-app browser on the isolated local branch. They establish access at test time, not permanent uptime or every possible capability and input combination. The provider documentation links are in each catalog definition.

## Goal mapping

The built-in planner is deterministic. It supports the earthquake research and weather workflow, view-edit follow-ups, named chemical comparisons, museum searches, clinical research, brewery cities, holiday countries, Hacker News feeds, historical media, currency pairs, state population snapshots and existing core sources. It maps dates, search terms and geography to explicit request parameters and exposes the plan before execution.

An external WebMCP agent can use the same generic tools for broader planning. Unsupported local-planner requests return questions and relevant capabilities. A population request for income or trends requires a different capability; it is not silently answered with a population snapshot. Ambiguous geocoding requires a choice. Dependencies use returned values rather than invented coordinates.

## Scope and limits

The catalog contains the operations listed above, not every dataset offered by each provider. The map supports latitude/longitude and GeoJSON Point features on the existing schematic world map; polygon rendering and map tiles are not implemented. The calendar groups records by day. The graph displays up to 60 nodes and 150 edges. Multiseries charts support up to four numeric fields without a second axis. Sample values remain explicitly illustrative and may not match request parameters.

There is no backend proxy, general-purpose code execution, embedded LLM or automatic provider failover. Public API proposals use the existing declarative editor and require the visible Save API action. Existing authenticated-source limitations and download behavior are recorded in `VERIFICATION.md`.
