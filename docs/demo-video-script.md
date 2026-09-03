# API Canvas demo recording script

Target runtime: 2:50. Narration aims for 130 to 150 words per minute. Record the primary workflow continuously. Show real loading and failures. Disclose any sample fallback.

Before recording: use a WebMCP-capable browser and a connected agent, inspect the current source capability, open a separate demo dashboard, and verify microphone audio. A local tool runner is not a native agent connection.

## 0:00–0:15

Screen action: Show a dashboard with several source cards, then highlight the shared canvas.

Narration: Public data is easy to find and awkward to connect. I built API Canvas so a person and a browser agent can turn those responses into a working dashboard, while keeping the original evidence in view.

Tools: No call. Establish the problem.

Expected visible result: Existing source cards and provenance are visible.

## 0:15–0:35

Screen action: Open the connected agent beside Canvas. Show the exact earthquake request, then discover the catalog.

Narration: Here is the goal: show recent earthquakes on a map and make the data easy to inspect. I can use Discover myself, or ask the connected agent. It reads declared tools with input schemas. Both routes use the same workspace actions, so I can edit whatever the agent creates.

Tools: search_api_catalog, inspect_api_capability

Expected visible result: The agent sees the USGS capability, operation ID and supported parameters.

## 0:35–1:45

Screen action: Keep the recording continuous. Create a separate Research demo dashboard, then a live USGS card. Inspect its schema, choose map, open Data and Request tabs, resize the card and show the returned ID. Leave actual loading visible.

Narration: I ask for a separate research dashboard, keeping my existing work. The agent creates it, then adds a USGS source using the operation and parameters it just inspected. Watch the card appear in the same canvas. The request is real, so the loading state matters. A successful response keeps its original data and records when it arrived. If the source fails, the app returns a specific error and a recovery step. It does not manufacture earthquakes. Next, the agent inspects the fields and selects the map view from the component registry. The coordinates come from the response. I can open Data to inspect the values, then Request to see where they came from. Changing the view reuses the response. It does not need another network request. Now the agent adjusts the card width. The visible layout changes immediately, and the returned card identifier lets later tools address exactly this block. I can still change those same settings by hand.

Tools: manage_dashboard, create_block, inspect_source_schema, choose_visualization, resize_block

Expected visible result: A live source card, observed coordinates and provenance. If live access fails, show the error and disclose any explicitly selected fixture.

## 1:45–2:15

Screen action: Select the source card and save a question. Let the agent prepare context and submit a cited answer. Move the answer first, then edit its title in the UI.

Narration: Now I ask what this card tells us. The saved question identifies its source cards. The context tool returns their data, filters, freshness and any gaps. The connected agent writes an answer against that evidence and submits structured content. The app validates the bundle and creates an ordinary answer card with citations. I move it first, then edit its title myself. The agent sees that same updated state on its next read.

Tools: create_content_block, prepare_canvas_question, answer_canvas_question, move_block, get_workspace

Expected visible result: Question and cited answer cards, followed by a visible human edit.

## 2:15–2:35

Screen action: Open /webmcp, advance the illustrative comparison and expand the last structured result.

Narration: A screenshot-driven agent has to rediscover controls as the layout changes. Here, names and schemas describe the action, and structured results explain what happened. The comparison counts are illustrative, not a benchmark. Deletion still opens a human confirmation. Structured access makes the workflow explicit; it does not remove the person's control.

Tools: get_workspace, read-only inspector example

Expected visible result: Generated tool catalog, illustrative comparison and actual session result.

## 2:35–2:50

Screen action: Open /hackathon and show the architecture and readiness checklist. End on the live demo link.

Narration: API Canvas uses Vue, Pinia, local browser storage and reusable data adapters, deployed on Netlify. The tool catalog follows the actual registry. Setup instructions and repository status are linked here. The result is a canvas we can both work on.

Tools: No new mutation.

Expected visible result: Architecture and truthful submission status. Do not describe the repository or video as public until verified.

