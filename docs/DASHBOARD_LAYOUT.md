# Dashboard layout and order

Cards grow to fill unused row width. Their width setting is the preferred share of a row, and cards wrap when the available space is too narrow. Cards in a row align at the bottom. Mobile layouts stack cards. The editor and clean share view use the same layout rules.

Use the grip beside a card's title to drag it to another card. The outline indicates the destination. Drag near the top or bottom of the screen to scroll; Escape cancels a drag. Click the grip to choose an exact position or move earlier or later. With the grip focused, arrow keys move one position, Home moves first and End moves last.

Reordering uses the existing workspace action. Local persistence, dashboard switching, WebMCP `move_block`, and new share snapshots retain the same order. Existing share links remain snapshots of their captured order. Sources, bindings and saved data are unchanged by a move. Existing width values remain valid.

## Changed files

- `src/workspace/WorkspaceGrid.vue` handles pointer dragging, scrolling, keyboard moves and announcements.
- `src/widgets/WidgetShell.vue` provides the handle and position controls.
- `src/style.css` fills rows and styles the reorder controls.
- `src/App.vue` mounts the workspace grid.
- `src/webmcp/workspaceTools.ts` describes preferred width behavior.
- `tests/e2e/layout.spec.ts` checks mixed widths, aligned rows, sidebar collapse, drag and keyboard moves, position controls, WebMCP order, reload and share snapshots at 320, 375, 768, 1024 and 1440 px.

## Release checks

Production deployment `6a98c979bccd3d16aa714489` is live at https://api-canvas-bclonan.netlify.app/.

- `npm run verify` passed lint, type-check, 191 unit tests, build and all 30 local browser tests.
- `npx playwright test --config playwright.production.config.ts tests/e2e/layout.spec.ts` passed all five layout workflows against production.
- The Codex in-app browser moved the saved Game and city context card to the first position through the normal position picker. Reload retained that order and its real source data. A keyboard End move restored the demo's original order.
- `git diff --check` passed. The existing Vite large-chunk advisory remains.
