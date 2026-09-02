# Verification

## Automated checks

The project suite tests semantic detection, every provider fixture, transport validation, raw-response retention, pending inputs, revision guards, atomic import validation, presentation changes without fetching, removal during requests, and overlapping requests. Renderer tests cover scalar values, images and native media, empty and incompatible data, and HTML/link escaping.

Six Chromium workflows exercise dashboard creation, visualization changes, table sorting and paging, request/code views, downloads, reload persistence, pending inputs, duplication/removal, local tools, live-error recovery, all source fixtures, and a 375 px viewport.

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
