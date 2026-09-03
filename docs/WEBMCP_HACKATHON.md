# WebMCP and hackathon pages

The existing Vue/Pinia app now has directly addressable `/webmcp` and `/hackathon` pages. The App shell stays mounted during History API navigation, so tool registration and the active workspace remain shared with the canvas. The hash-based share view keeps its existing behavior. No router package, parallel registry or new persistence model was introduced.

## Files

Created:

- `src/site/DocumentationPage.vue`, `WebMcpPage.vue`, `HackathonPage.vue` and `site.css` provide the two pages and responsive navigation.
- `src/site/toolDocs.ts` derives the catalog from `nativeContracts`, validates examples and adds prompts, abbreviated results, recovery guidance and six ordered workflows.
- `src/site/CopyButton.vue`, `DemoVideo.vue`, `navigation.ts` and `project.json` handle clipboard feedback, validated YouTube URLs, route metadata and centralized submission configuration.
- `src/site/videoScript.json` and `docs/demo-video-script.md` contain matching narration, actions, calls and expected results. Tests keep the exact narration synchronized.
- `src/webmcp/inspection.ts` retains one bounded, redacted structured result in memory. It omits raw responses, headers and file attachments and never writes the full result to the existing action log.
- `public/favicon.ico`, `apple-touch-icon.png`, `og-image.png` and `site.webmanifest` use the existing brand. The ICO contains three actual icon sizes and the OG image is 1200 by 630. The existing SVG favicon remains intact.
- `scripts/brand-assets.py` reproduces the raster assets using Pillow and the existing geometric mark. It is an optional development script, not a build dependency.
- `LICENSE` adds the MIT license. No previous root license existed; bundled fonts retain their OFL notices.
- `tests/unit/site-docs.test.ts` and `tests/e2e/site-pages.spec.ts` cover registry/example equality, schemas, chains, safe execution, video states, assets, narration, diagnostics and browser workflows.
- `docs/WEBMCP_HACKATHON.md` records implementation and release details.

Updated:

- `src/App.vue` adds lazy page selection and same-document navigation while retaining restore, refresh and native registration ownership.
- `src/style.css` adds restrained project navigation and a two-row mobile header to avoid overflow at 320 px.
- `src/webmcp/register.ts` records successfully registered tool names. `handlers.ts` supplies the session inspector with a bounded result after each call.
- `index.html` adds project metadata and icon references. `vite.config.ts` emits separate route HTML with static canonical, Open Graph and Twitter values. `netlify.toml` remains unchanged.
- `README.md` corrects outdated capabilities and counts, documents current setup, source-key requirements, browser support, contributions and deployment.
- `docs/VERIFICATION.md` records the final release evidence. Browser tests generated screenshots under `artifacts/release/`.

## Validation and deployment

Native and documented tools: 37. The catalog has no compatibility aliases. All input examples validate against the canonical schemas, and workspace output examples validate against the shared output envelope. Abbreviated payloads are visibly labeled; current IDs and revisions must replace example identifiers before a mutation.

Commands and results:

```text
npm run verify                         PASS: lint, typecheck, 269 unit/integration tests,
                                       build and 52 browser tests
npm run lint                           PASS after final metadata fix
npm run build                          PASS after final metadata fix
npx playwright test --config playwright.production.config.ts tests/e2e/site-pages.spec.ts
                                       PASS: 6 production smoke tests, all 5 widths
git diff --check                       PASS
```

On this Windows machine, Node network commands use the system certificate store when needed:

```powershell
$previousOptions = $env:NODE_OPTIONS
try {
  $env:NODE_OPTIONS = "$previousOptions --use-system-ca".Trim()
  npx playwright test --config playwright.production.config.ts tests/e2e/site-pages.spec.ts
} finally {
  $env:NODE_OPTIONS = $previousOptions
}
```

The production deployment used the authenticated, linked Netlify CLI with `--dir dist --functions netlify/functions --no-build --prod`. Final deploy ID: `6a99139b60592eb2a3965d93`. [Immutable deployment](https://6a99139b60592eb2a3965d93--api-canvas-bclonan.netlify.app).

The in-app browser confirmed real native discovery and calls, not only the registration stub used for deterministic automated tests. Existing user dashboards and card IDs were preserved. No new test dashboard was added to the user's browser during this release; the automated flows use isolated browser contexts.

## Remaining owner tasks and limits

- Record the 2:50 script, upload a public narrated YouTube video and set `VITE_DEMO_VIDEO_URL` or `youtubeUrl` in `src/site/project.json`. Verify public access, duration and audio. A configured URL alone does not mark that checklist item complete.
- Verify public access to the detected `https://github.com/bclonan/api-view` remote and push the complete source, assets, README and license. The unauthenticated API check returned 404 on September 3, 2026. This work did not publish or change repository visibility.
- Comparison interaction counts are illustrative, not a benchmark. No browser agent workflow is timed by the demo controls.
- Native WebMCP still depends on browser support and a connected agent. The read-only documentation runner uses the existing local handler and labels that fallback honestly.
- API availability, credentials and source permissions remain provider constraints. This release adds no unrestricted proxy or hosted model service.
- Vite's existing large-chunk advisory remains. The documentation pages load separately from the main canvas bundle.
