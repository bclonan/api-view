# Images and open-data collections

The explorer now has 38 built-in sources and 41 operations. The eight additions use the existing registry, invocation pipeline, normalized cards, mappings, persistence, share snapshots and WebMCP actions.

| Added source | Searches | Key for these operations |
| --- | --- | --- |
| Unsplash | Subject, page, result count, orientation | Unsplash application Access Key |
| Wikimedia Commons | Image subject and result count | None |
| Metropolitan Museum of Art | Artist or subject, up to six object records | None |
| GBIF | Scientific name, country, published coordinates | None |
| iNaturalist | Species, page, result count | None |
| NASA EONET | Open/closed natural events and date window | None |
| National Weather Service | Active alerts by US state or territory | None |
| Nobel Prize | Award year and category | None |

## Unsplash setup

1. [Create an Unsplash application](https://unsplash.com/oauth/applications).
2. In the existing Netlify site's environment variables, add `UNSPLASH_ACCESS_KEY` with the application's Access Key. Include Functions scope and the Production deploy context.
3. Redeploy the site so the function receives the variable.
4. In Discover, select Unsplash, choose Live API request, enter a subject, and add the card or use Test source.

Public search does not need the application's Secret Key or a user's OAuth token. Never use a `VITE_*` variable for this key. Do not put it in card arguments, custom source definitions, query strings or share links. [Unsplash's guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) require confidential keys, hotlinked images and attribution.

The server function only accepts a bounded GET photo search. It fixes the upstream host and path, rejects extra or repeated parameters, refuses redirects, caps response size and times out after 15 seconds. It returns distinct missing-key, rejected-key, invalid-input, rate-limit and unavailable-response errors. The browser retains these errors for WebMCP and the UI. Local Vite development returns the missing-key state; use Netlify's local runtime for authenticated function development.

Unsplash demo applications have a 50-request hourly quota. Public production use requires the provider's production review. Images use the returned URLs without stripping `ixid`. Photographer and Unsplash links include referral parameters and remain visible in galleries, image table cells and share snapshots. This integration displays search results; it does not implement image downloads or a background-image picker. Any future download/use action must implement Unsplash's download tracking requirement. [API documentation](https://unsplash.com/documentation).

## Other key requirements

The existing Census adapter remains sample-only. The Census Bureau now requires a key for data queries, while metadata queries remain public. [Census announcement](https://content.govdelivery.com/accounts/USCENSUS/bulletins/41aaf23) and [free key signup](https://api.census.gov/data/key_signup.html). No Census credential storage or relay was added in this change.

The current openFDA operation returned data without a key during the audit. Its documentation lists both a key requirement and a smaller no-key quota. Register for a key before relying on higher-volume use. [openFDA authentication](https://open.fda.gov/apis/authentication/). The current GitHub and BLS operations also work without keys at their public limits. Those providers' authenticated higher-quota workflows are not implemented here.

## Source rights and unavailable data

Commons and iNaturalist return per-image credits and licenses. Their collections do not imply that every image is public domain. The Met adapter displays images only when the returned object says it is public domain. Wildlife coordinates are only the published coordinates; the adapter does not infer private locations. Weather alerts may legitimately return no matching records.

Raw responses remain available beside normalized values. Missing or malformed collections fail explicitly; empty collections remain empty. Live errors never silently switch to fixtures. Sample records are illustrative and labeled by the existing data-mode UI.

## Verification

`npm run verify` runs lint, type checks, unit tests, build and browser regressions. The image tests cover 320, 375, 768, 1024 and 1440 pixel widths, key recovery, attribution, raw image URLs, table views, persistence, empty results and clean sharing. Unit tests cover server request bounds, key isolation, upstream failures, normalization and empty collections.

`npm run test:apis` audits every built-in operation against the deployed site using real browser requests through WebMCP. It does not replace failed requests with fixtures. Set `LIVE_URL` to audit another deployment. The report includes exact inputs, timestamps, row counts, errors and network responses in `artifacts/release/catalog-audit.json`. A passing audit test means every operation has a recorded outcome, not that every upstream provider succeeded.

Detailed results are in `docs/API_AUDIT.md`. Current provider availability can change after the recorded checks.
