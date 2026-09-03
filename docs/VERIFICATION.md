# Verification

## Generic sources and sharing, September 2, 2026

Production deployment `6a988f37c0db89b8ffc83f15` passed lint, type-check, 161 unit tests, the build, and all 20 local and production browser workflows. A separate real-network test passed with the Nobel Prize API and an MDN educational HTML table. Native WebMCP registered 31 tools on production. See [public source release notes](PUBLIC_SOURCES.md) for changed files, supported scope, screenshots and the in-app checks.

## Semantic public-data branch, September 2, 2026

Branch `codex/semantic-public-data` extends the existing application to 30 sources, 29 presentations and 31 WebMCP tools. The final local `npm run verify` passed 131 unit and renderer tests, TypeScript checks, the production build and 14 Chromium workflows. `git diff --check` passed. Vite still reports the existing lazy chart-library chunk above its 500 KB advisory threshold.

The added tests cover semantic evidence, unknown nested collections, GeoJSON points, explicit graph data, numeric identifiers versus measures, typed capability inputs, request reuse, state geography, historical-debt routing and Hacker News feed selection. Browser checks render fixtures for all 30 sources, inspect every first-wave request form, execute both demo prompts, restore request history after reload and verify a narrow viewport. Tests use samples or intercepted responses.

Separately, native WebMCP calls in the Codex in-app browser tested all 18 new sources plus Open-Meteo and USGS. Nineteen returned live data. Gutendex timed out after 20 seconds and its dated health record reports the failure. Frankfurter initially returned HTTP 422; correcting the query parameter to `quotes` produced HTTP 200. All twelve first-wave sources passed live. The exact checked capabilities and remaining limits are in `SEMANTIC_EXPANSION.md`.

The local in-app browser rendered the three-card earthquake research dashboard. Its follow-up command created a histogram, restricted the paper table to four columns and placed weather beside the map, for four ready cards. No new request was needed for the presentation edits. Existing production dashboards were not used for this branch's tests.

## Semantic branch preview deployment

Final preview: https://6a987ca2b7a2d0eb1c510dda--api-canvas-bclonan.netlify.app

Deploy ID: `6a987ca2b7a2d0eb1c510dda`. Production was not replaced. All 14 Chromium workflows passed against this HTTPS preview, including a failed planned request that remained in its card and recovered through Retry request. The test also confirmed that retry did not duplicate the card.

The in-app browser discovered all 31 native tools. `plan_goal` and `execute_goal` completed both specification demo prompts with labeled sample data. The visible result had four cards: earthquake map, weather, four-column paper table and magnitude histogram. A separate live Hacker News request returned two normalized story records while `inspect_data` retained the original numeric ID response.

During the earlier preview's live flagship run, USGS and Crossref returned data. Weather for the actual largest returned event, at latitude 13.2654 and longitude 50.5425, timed out or returned a non-JSON response in the in-app browser. A smaller retry also timed out. The same location succeeded in a separate shell request, which does not establish browser availability. The final build therefore preserves failed planned requests as visible cards with their actual inputs and retry controls. The fully live three-source demo remains unconfirmed for that location. Sample-mode completion is verified separately.

Paper cards now show a bounded set of relevant publication fields. The original nested metadata remains available through Data, Request and original-response inspection. The final suite covers this distinction and weather responses that contain a requested hourly variable without temperature.

## Automated checks

The project suite tests semantic detection, every provider fixture, transport validation, raw-response retention, pending inputs, revision guards, atomic import validation, presentation changes without fetching, removal during requests, and overlapping requests. Renderer tests cover scalar values, images and native media, empty and incompatible data, and HTML/link escaping.

Nine Chromium workflows exercise dashboard creation, switching, clear and undo, mixed-source bindings, custom nested data, visualization changes, table sorting and paging, request/code views, downloads, reload persistence, pending inputs, duplication/removal, local tools, live-error recovery, all source fixtures, and a 375 px viewport.

Run `npm run verify` for the current counts and result. Network calls in automated tests use fixtures or intercepted responses, so the suite does not depend on provider availability.

## Native browser checks, September 2, 2026

The Codex app browser discovered all 12 native tools through the WebMCP capability. Successful native calls covered search, describe, invocation without UI, widget creation, dashboard creation, update, transform, single/bulk refresh, removal, workspace inspection, and configuration export. The browser rendered the created widgets. The update test changed Treasury's limit to 90 and width to 12; the transform test reused the same widget and response timestamp.

Live `invoke_api` requests returned normalized data for Treasury, Open-Meteo, USGS, Open Library, openFDA, Wikipedia, geocoding, NASA Images, GitHub, PokéAPI, and Lorem Picsum. Census failed. Inspection of the endpoint returned a missing-key HTML page, so the adapter now reports an authentication requirement and supports sample mode only.

These checks establish behavior at the time of testing. They do not guarantee future provider uptime or WebMCP compatibility in every browser.

## Netlify production smoke test, September 2, 2026

Production URL: https://api-canvas-bclonan.netlify.app

Deploy ID: `6a985e7a9aa0b9c684941a1d`. Netlify project ID: `48440ab4-12f4-4043-9ef9-84656e42793a`. The release used the local production build. Git-based automatic deployment has not been configured.

The pre-deploy run passed all 49 unit and renderer tests, TypeScript checks, and the production build. All six Chromium workflows also passed against the deployed HTTPS URL. Those workflows use samples and controlled failure responses. Separately, the Codex in-app browser loaded live responses for all 11 sources that support live mode and a labeled Census sample.

The in-app browser successfully called every native tool on the production origin. UI checks covered required inputs, table sorting, filtering and pagination, Data/Request/Code/original-response views, chart field mapping and width changes, duplication, removal, and explicit recovery from a Census authentication error to sample mode. A stale-revision edit and invalid coordinates were rejected. Changing presentation retained the loaded response timestamp.

Import replaced the test workspace after its visible confirmation. Reload restored its configuration, including the selected chart field. Native registration worked again after refreshing the browser tool references. The final inspected page contained 15 ready widgets and no browser warning or error logs.

At a 375 by 812 viewport, the canvas and agent tools dialog had no horizontal page overflow. The production HTML returned revalidation headers. The referenced JavaScript and CSS returned HTTP 200 with the expected content types and immutable caching.

Download limitation: native `export_workspace` returned valid configuration without cached API responses. The standard Chromium production test confirmed the workspace JSON download. The in-app browser did not report a download event in two attempts, so saving the file in that browser remains unconfirmed. File selection and import worked there.

## Dashboard library release, September 2, 2026

Deploy ID: `6a986debfa2c50037698e237`, at the same production URL. The final `npm run verify` passed 66 unit and renderer tests, TypeScript checks, the production build, and nine Chromium workflows. All nine browser workflows also passed against the deployed HTTPS site. These automated workflows use sample data or intercepted responses.

The in-app browser discovered all 16 native tools. Additional local native checks covered dashboard creation, custom API registration, nested field inspection, component definitions, and bindings through the existing widget tools. A custom GitHub repository endpoint returned live data, and its nested owner and star count rendered through the generic metric component.

Production UI checks covered new dashboards, switching, reload, importing into an empty dashboard, clear cancellation, confirmed clear, undo, and deletion of the temporary test dashboard. The five-widget public-data starter displayed NASA imagery, a three-column USGS table, FDA cards, a Census chart, and a summary with values bound from all four sources. Undo restored those bindings and values.

Before reload, the old tab held a 15-widget "A day in Baltimore" configuration. Reload restored a different saved ten-widget "Weather, Pokémon & space" configuration. The earlier configuration had been captured through native export, so it was imported into a separate new dashboard. Every original setting of its 15 widgets matched the captured export. The ten-widget dashboard also matched its captured export exactly. Both dashboards remained available after reload, and the temporary smoke-test dashboard was removed. The cause of the two differing pre-release states was not established.

The HTML returned HTTP 200 with revalidation caching. The deployed `index-BNPs1hJS.js` and `index-DTjOgRMu.css` assets returned HTTP 200, their expected content types, and immutable caching. Live provider availability remains separate from the automated test results; weather requests intermittently returned non-JSON responses during this session and remained visible as errors with retry and sample controls. The in-app download limitation above remains unconfirmed.
