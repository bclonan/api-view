# API catalog audit

Checked 2026-09-03T03:13:38.711Z against https://api-canvas-bclonan.netlify.app using real browser requests through WebMCP.

38 built-in sources, 41 operations. 37 operations returned data; 4 reported an access or availability issue. All seven newly added keyless sources returned data. Unsplash's authenticated search remains unverified until its key is configured.

| Source | Operation | Browser result | Key requirement |
| --- | --- | --- | --- |
| U.S. Treasury | debt-to-penny | network: Browser request unavailable | None used for this operation |
| Open-Meteo | forecast | ready, 168 records | None used for this operation |
| USGS Earthquakes | recent | ready, 2 records | None used for this operation |
| Open Library | search | ready, 2 records | None used for this operation |
| openFDA | labels | ready, 2 records | None used for this operation |
| Wikipedia | summary | ready, 1 records | None used for this operation |
| Open-Meteo Geocoding | search | ready, 8 records | None used for this operation |
| NASA Images | search | ready, 2 records | None used for this operation |
| U.S. Census | population | authentication-required: This source requires an API key | Required |
| GitHub | repositories | ready, 2 records | None used for this operation |
| PokéAPI | pokemon | ready, 1 records | None used for this operation |
| Lorem Picsum | images | ready, 2 records | None used for this operation |
| Art Institute of Chicago | search | ready, 2 records | None used for this operation |
| Art Institute of Chicago | artwork | ready, 1 records | None used for this operation |
| Crossref | works | ready, 2 records | None used for this operation |
| Crossref | doi | ready, 1 records | None used for this operation |
| PubChem | name | ready, 1 records | None used for this operation |
| PubChem | cid | ready, 1 records | None used for this operation |
| ClinicalTrials.gov | search | ready, 2 records | None used for this operation |
| Data USA | population | ready, 2 records | None used for this operation |
| Frankfurter | rates | ready, 1 records | None used for this operation |
| Open Brewery DB | search | ready, 2 records | None used for this operation |
| Nager.Date | holidays | ready, 17 records | None used for this operation |
| Hacker News | stories | ready, 2 records | None used for this operation |
| Library of Congress | search | ready, 2 records | None used for this operation |
| Federal Register | documents | ready, 2 records | None used for this operation |
| FDIC BankFind | failures | ready, 2 records | None used for this operation |
| Bureau of Labor Statistics | series | ready, 31 records | None used for this operation |
| TVmaze | shows | ready, 10 records | None used for this operation |
| OpenF1 | laps | ready, 475 records | None used for this operation |
| World Bank | indicator | ready, 10 records | None used for this operation |
| Gutendex | books | timeout: The source took too long | None used for this operation |
| Zippopotam.us | postal | ready, 1 records | None used for this operation |
| Unsplash | search | authentication-required: Unsplash needs an Access Key | Required |
| Wikimedia Commons | images | ready, 2 records | None used for this operation |
| The Metropolitan Museum of Art | search | ready, 2 records | None used for this operation |
| GBIF Biodiversity | occurrences | ready, 2 records | None used for this operation |
| iNaturalist | observations | ready, 2 records | None used for this operation |
| NASA EONET | events | ready, 2 records | None used for this operation |
| National Weather Service Alerts | active | ready, 4 records | None used for this operation |
| Nobel Prize | awards | ready, 2 records | None used for this operation |

## Access and availability

- Unsplash: the deployed function returns a structured missing-key error. Configure UNSPLASH_ACCESS_KEY in Netlify Functions and redeploy. No Secret Key is needed for public search.
- Census: the current adapter is sample-only. An independent request returned an HTML Missing Key page. The official Census notice confirms a key is required for data queries.
- Treasury: browser requests returned net::ERR_FAILED. A separate server-side diagnostic returned HTTP 200 with JSON and a public CORS header. This does not establish browser compatibility.
- Gutendex: both browser and server-side requests exceeded the 20-second timeout. No data was substituted.
- openFDA, GitHub and BLS: these configured operations returned data without credentials. Higher-volume or authenticated use may require keys. See IMAGE_AND_OPEN_DATA_APIS.md for the provider guidance.

## Release verification

- Lint, type checks, build and git diff --check passed.
- 247 unit tests passed.
- 41 browser regression tests passed, including 320, 375, 768, 1024 and 1440 pixel widths.
- Two production browser tests passed: the 41-operation audit and real image galleries, wildlife map, missing-key state, persistence and clean sharing.
- Netlify deploy: 6a98e59b0156f07fa19d3bf4.
- The in-app browser's native WebMCP tools discovered the Unsplash key setup and created a separate Images and open collections dashboard. Commons, Met and GBIF each returned two records. Unsplash returned authentication-required with a non-retryable setup instruction. Existing dashboards remain available.
- Live URL: https://api-canvas-bclonan.netlify.app/
- The build retains its existing large-chunk warning.

## Evidence

- artifacts/release/catalog-audit.json has exact inputs, timestamps, fields and network outcomes.
- artifacts/release/catalog-diagnostics.json distinguishes server checks from browser outcomes.
- artifacts/release/collections-editor-1440.png and collections-editor-375.png show the deployed editor.
- artifacts/release/collections-share-1440.png and collections-share-375.png show clean shared snapshots.

## Files changed for this addition

- src/api/providers/open-collections.ts and src/api/registry.ts register eight sources with bounded inputs, extraction, source links and licenses.
- netlify/functions/unsplash.ts implements the confidential server relay. vite.config.ts supplies the local missing-key state.
- src/api/defineApi.ts supplies complete test examples for required inputs without changing actual input defaults.
- src/api/capabilities.ts, src/discover/DiscoverDrawer.vue, src/discover/OperationPicker.vue and src/types.ts expose setup instructions and keep key-required sources discoverable.
- src/runtime/invoke.ts preserves relay errors and handles empty Met searches. src/runtime/outcomes.ts explains key recovery.
- src/runtime/imageCredits.ts, src/values/ValueRenderer.vue, src/blocks/BlockRenderer.vue and src/style.css retain image credits across views.
- src/App.vue closes the mobile discovery drawer when opening a source form.
- tests/unit/open-collections.test.ts, tests/e2e/open-collections.spec.ts and tests/live/catalog.spec.ts plus image-collections.spec.ts cover the new behavior. tests/e2e/semantic.spec.ts expects the expanded catalog.
- package.json, tsconfig.json and .gitignore include server checks, the opt-in test:apis command and generated-test exclusions.

Previous uncommitted application work and existing dashboards were preserved.
