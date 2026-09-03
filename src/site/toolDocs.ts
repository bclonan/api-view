import Ajv from "ajv";
import { nativeContracts } from "../webmcp/register";
import {
  workspaceToolNames,
  workspaceOutputSchema,
} from "../webmcp/workspaceTools";
import { contentSchema } from "../runtime/content";
import { inspectCapability } from "../api/capabilities";
import { planIntent } from "../workspace/intent";

const exampleBlock = "block-example";
const note = {
  version: 1,
  kind: "note",
  title: "Research note",
  body: "A user-supplied note, editable on the canvas.",
};
// Examples and editorial guidance supplement the canonical contracts. They never register tools.
const argumentsByName: Record<string, unknown> = {
  create_content_block: { content: note },
  update_content_block: { blockId: exampleBlock, content: note },
  prepare_canvas_question: {
    question: "What do these cards show, and what is missing?",
    limit: 10,
  },
  answer_canvas_question: {
    questionBlockId: "question-example",
    expectedRevision: 0,
    outputs: [
      {
        content: {
          version: 1,
          kind: "answer",
          title: "Example answer",
          body: "Replace this with an answer grounded in the selected cards.",
          citations: [{ blockId: exampleBlock, label: "Selected card" }],
        },
      },
    ],
  },
  discover_data_sources: { query: "earthquakes", publicCatalog: false },
  inspect_source: {
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
  },
  test_data_source: {
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
  },
  add_source: {
    definition: {
      id: "custom-quakes",
      name: "USGS weekly earthquakes",
      baseUrl: "https://earthquake.usgs.gov",
      endpoint: "/earthquakes/feed/v1.0/summary/4.5_week.geojson",
      method: "GET",
      responsePath: "features",
      sampleResponse: { features: [] },
    },
  },
  inspect_source_schema: { blockId: exampleBlock },
  get_page_context: { limit: 10 },
  use_all_page_data: { limit: 10 },
  select_map_tag_fields: {
    fields: [
      {
        sourceId: exampleBlock,
        path: "properties.mag",
        origin: "raw",
        label: "Magnitude",
        tags: ["earthquake"],
      },
    ],
  },
  create_derived_block: {
    sourceIds: [exampleBlock],
    title: "Magnitude view",
    bindings: { $data: { sourceId: exampleBlock, origin: "data", path: "" } },
    presentation: { type: "table" },
  },
  combine_sources: {
    sourceIds: [exampleBlock, "block-targets"],
    title: "Counts and targets",
    bindings: { $data: { sourceId: exampleBlock, path: "", origin: "data" } },
    transforms: [
      {
        op: "join",
        sourceId: "block-targets",
        field: "name",
        rightField: "name",
        as: "target",
      },
    ],
    presentation: { type: "table" },
  },
  bind_data_to_block: {
    blockId: exampleBlock,
    bindings: { title: { literal: "Observed data" } },
  },
  create_transform: {
    blockId: exampleBlock,
    steps: [{ op: "limit", count: 10 }],
  },
  create_block: {
    sourceId: "usgs",
    operationId: "recent",
    arguments: { minmagnitude: 5, limit: 12 },
    mode: "sample",
    title: "Illustrative earthquake data",
    presentation: { type: "map" },
  },
  update_block: {
    blockId: exampleBlock,
    patch: { title: "Reviewed observations" },
  },
  delete_block: { blockId: exampleBlock },
  move_block: { blockId: exampleBlock, position: 0 },
  resize_block: { blockId: exampleBlock, width: 6 },
  choose_visualization: {
    blockId: exampleBlock,
    presentation: { type: "table" },
  },
  collapse_sidebar: { collapsed: true },
  plan_goal: {
    prompt:
      "Build an earthquake research dashboard with weather near the strongest event.",
  },
  execute_goal: {
    prompt:
      "Build an earthquake research dashboard with weather near the strongest event.",
  },
  search_api_catalog: { query: "earthquakes from the last week" },
  inspect_api_capability: {
    sourceId: "usgs",
    capabilityId: "earthquake.search",
  },
  run_api: {
    sourceId: "usgs",
    capabilityId: "earthquake.search",
    params: { minmagnitude: 5, limit: 12 },
    mode: "sample",
  },
  refresh_widget: { widgetId: exampleBlock },
  manage_dashboard: { action: "create", title: "Research demo" },
};
export const promptOverrides: Record<string, string> = {
  create_block:
    "Add an earthquake map using the USGS source. Inspect the source inputs first, use live data, and report any request failure.",
  prepare_canvas_question:
    "Read the selected cards and tell me what evidence is available to answer my question. Include missing data and source freshness.",
  answer_canvas_question:
    "Answer my saved question using its selected cards. Create a cited answer and comparison table as ordinary editable blocks. Read the current question context and revision first.",
  combine_sources:
    "Compare the Counts and Targets cards by name. Check key uniqueness and types, join their rows, and create an editable table with source attribution.",
  delete_block:
    "Ask me to confirm removal of the selected block in the canvas. Do not confirm it on my behalf.",
  open_share_view:
    "Prepare a clean snapshot of this dashboard and open the share panel for my review. Explain any redacted or unavailable local data.",
  get_workspace:
    "Inspect my current dashboard without changing it. Tell me its revision, card IDs and request states.",
};
// Explicitly local, read-only examples only. A readOnly annotation alone is not permission to fetch.
export const safeDocTools = new Set([
  "get_workspace",
  "list_components",
  "get_content_spec",
  "list_blocks",
  "list_workspace_sources",
  "get_page_context",
  "prepare_canvas_question",
  "search_api_catalog",
  "inspect_api_capability",
  "plan_goal",
]);
const external = new Set([
  "discover_data_sources",
  "inspect_source",
  "test_data_source",
  "run_api",
  "create_block",
  "refresh_widget",
  "execute_goal",
  "update_block",
]);
const approval = new Set(["delete_block", "manage_dashboard", "add_source"]);
const stateByName: Record<string, string> = {
  run_api:
    "Active dashboard request history and normalized response cache; no card is added.",
  select_map_tag_fields: "Selected fields and tags for the current dashboard.",
  collapse_sidebar: "The persisted discovery sidebar preference.",
  open_share_view:
    "The share review panel and a redacted snapshot URL. Nothing is published automatically.",
  use_all_page_data: "The context review panel. Source data remains unchanged.",
  add_source:
    "The custom source catalog, or a pending proposal in the source editor.",
  delete_block:
    "A pending deletion dialog. The human confirms before the card is removed.",
  manage_dashboard:
    "The local dashboard library. Clear and delete require visible human confirmation.",
  answer_canvas_question:
    "One to six normal content blocks connected to the saved question and scoped evidence.",
};
const recoveryByName: Record<string, string> = {
  combine_sources:
    "Inspect both schemas. Use existing source IDs, matching join-key types and unique right-side keys. Missing source data stays a visible issue.",
  answer_canvas_question:
    "Read prepare_canvas_question again after a revision conflict. Use a saved question, in-scope citations and one to six valid outputs. Failed validation adds no blocks.",
  prepare_canvas_question:
    "Save or select valid source cards. Empty, loading and failed sources are evidence gaps, never inferred answers.",
  add_source:
    "Use public HTTPS settings without credentials. Review webpage permission and non-GET proposals in the source editor.",
  open_share_view:
    "Resolve oversized snapshot errors by reducing data. Review redaction warnings; local attachments require reconnecting on their original device.",
  delete_block:
    "Read list_blocks for a current ID. If the dashboard changes before confirmation, inspect it again and request removal again.",
  create_content_block:
    "Read get_content_spec. Use version 1, existing citations and supported media URLs. Local URIs do not grant file access; the human selects or reconnects files.",
};
const resultData: Record<string, unknown> = {
  get_content_spec: {
    schema: contentSchema,
    supportedViews: ["note", "file", "table", "map", "stock-chart"],
  },
  update_content_block: {
    id: exampleBlock,
    title: "Research note",
    status: "ready",
  },
  prepare_canvas_question: {
    question: "What do these cards show, and what is missing?",
    scope: [exampleBlock],
    context: {
      workspaceId: "dashboard-example",
      revision: 12,
      blocks: [{ id: exampleBlock, kind: "source" }],
    },
    answerSchema: contentSchema,
  },
  summarize_canvas: {
    id: "content-summary",
    title: "Canvas data summary",
    status: "ready",
  },
  discover_data_sources: {
    query: "earthquakes",
    candidates: [],
    warnings: [],
    scope:
      "Current catalog, the public APIs.guru directory and supplied URLs. This is not an unrestricted web crawler.",
  },
  add_source: { id: "custom-quakes", name: "USGS weekly earthquakes" },
  inspect_source_schema: {
    id: exampleBlock,
    rawFields: [],
    dataFields: [],
    provenance: [],
    components: [],
  },
  get_page_context: {
    version: 1,
    workspaceId: "dashboard-example",
    revision: 12,
    selectedBlockIds: [],
    selectedFields: [],
    sources: [],
    blocks: [],
  },
  use_all_page_data: {
    version: 1,
    workspaceId: "dashboard-example",
    revision: 12,
    selectedBlockIds: [],
    selectedFields: [],
    sources: [],
    blocks: [],
  },
  select_map_tag_fields: [
    {
      sourceId: exampleBlock,
      path: "properties.mag",
      origin: "raw",
      tags: ["earthquake"],
    },
  ],
  create_derived_block: {
    id: "derived-example",
    title: "Magnitude view",
    status: "ready",
  },
  combine_sources: {
    id: "derived-example",
    title: "Counts and targets",
    status: "ready",
  },
  bind_data_to_block: {
    id: exampleBlock,
    bindings: { title: { literal: "Observed data" } },
  },
  create_transform: {
    id: exampleBlock,
    transforms: [{ op: "limit", count: 10 }],
  },
  update_block: { id: exampleBlock, title: "Reviewed observations" },
  move_block: {
    id: "dashboard-example",
    revision: 12,
    widgets: [{ id: exampleBlock }],
  },
  resize_block: { id: exampleBlock, width: 6 },
  choose_visualization: { id: exampleBlock, presentation: { type: "table" } },
  open_share_view: {
    url: "https://api-canvas-bclonan.netlify.app/#share=[encoded-snapshot]",
    warnings: [],
    capturedAt: "2026-09-03T00:00:00.000Z",
  },
  list_blocks: { id: "dashboard-example", revision: 12, widgets: [] },
  list_workspace_sources: { definitions: [], cards: [] },
  delete_block: { status: "awaiting-confirmation", blockId: exampleBlock },
  collapse_sidebar: { collapsed: true },
  create_block: { id: exampleBlock, outcome: { status: "ready" } },
  create_content_block: {
    id: "content-example",
    title: "Research note",
    status: "ready",
  },
  answer_canvas_question: {
    questionBlockId: "question-example",
    blocks: [{ id: "content-answer" }],
  },
};
function representativeResult(name: string) {
  if (["inspect_source", "test_data_source"].includes(name))
    return {
      ok: false,
      action: name,
      revision: 12,
      status: "error",
      warnings: [
        "No data was invented. Browser access, source permission or an approved server adapter may be required.",
      ],
      data: null,
      error: {
        code: "network",
        message:
          "The network request failed. The source may be offline or may not allow browser access.",
        recovery:
          "Check browser access and retry the same source. Do not replace missing data with invented values.",
        retryable: true,
      },
    };
  if (workspaceToolNames.has(name))
    return {
      ok: true,
      action: name,
      revision: 12,
      status: name === "delete_block" ? "awaiting-confirmation" : "complete",
      warnings: [],
      data: resultData[name] ?? null,
    };
  if (name === "get_workspace" || name === "manage_dashboard")
    return {
      id: "dashboard-example",
      title: "Research demo",
      revision: 12,
      widgets: [],
    };
  if (name === "list_components")
    return { components: [{ id: "table", compatible: true }] };
  if (name === "inspect_api_capability")
    return inspectCapability("usgs", "earthquake.search");
  if (name === "search_api_catalog")
    return {
      matches: [
        {
          sourceId: "usgs",
          capabilityId: "earthquake.search",
          operationId: "recent",
          title: "Recent earthquakes",
        },
      ],
    };
  if (name === "plan_goal")
    return planIntent(
      "Build an earthquake research dashboard with weather near the strongest event.",
      new Date("2026-09-03T00:00:00Z"),
    );
  if (name === "refresh_widget")
    return { id: exampleBlock, status: "ready", title: "Observed earthquakes" };
  if (name === "execute_goal")
    return {
      status: "partial",
      steps: [{ step: 0, error: "The source took too long." }],
    };
  // General tools preserve their older error shape. This is an abbreviated failure example.
  return {
    error: "Capability not found. Search the catalog first.",
    detail: {
      code: "invalid",
      title: "Unable to load this widget",
      message: "Capability not found. Search the catalog first.",
    },
  };
}
const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
export const toolDocs = nativeContracts.map((contract) => {
  const schema = contract.schema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const args = argumentsByName[contract.name] ?? {};
  const validate = ajv.compile(contract.schema);
  const valid = validate(args);
  return {
    name: contract.name,
    title: contract.name
      .split("_")
      .map((word, i) => (i ? word : word[0].toUpperCase() + word.slice(1)))
      .join(" "),
    purpose: contract.description,
    schema: contract.schema,
    required: schema.required ?? [],
    optional: Object.keys(schema.properties ?? {}).filter(
      (k) => !schema.required?.includes(k),
    ),
    args,
    exampleValid: !!valid,
    validationError: valid ? "" : ajv.errorsText(validate.errors),
    classifications: [
      contract.readOnly ? "read-only" : "mutating",
      ...(approval.has(contract.name) ? ["approval-required"] : []),
      ...(["delete_block", "manage_dashboard"].includes(contract.name)
        ? ["destructive action available"]
        : []),
      ...(external.has(contract.name) ? ["external request possible"] : []),
    ],
    safe: safeDocTools.has(contract.name),
    state:
      stateByName[contract.name] ??
      (contract.readOnly
        ? "Reads current catalog or workspace state; no dashboard mutation."
        : "The addressed cards, their configuration and the active dashboard revision. Changes persist on this device."),
    source: workspaceToolNames.has(contract.name)
      ? "src/webmcp/workspaceTools.ts"
      : "src/webmcp/contracts.ts",
    prompt:
      promptOverrides[contract.name] ??
      `Use ${contract.name} in API Canvas. ${contract.description.split(". ")[0]}. Inspect current IDs and required inputs first; report missing data or approval steps.`,
    recovery:
      recoveryByName[contract.name] ??
      (external.has(contract.name)
        ? "Inspect the error code and retryAfter. Retry timeouts or rate limits after waiting; fix inputs for validation errors. CORS or offline failures need browser access or a permitted endpoint. Use sample data only with explicit consent."
        : "Check required properties against this schema. Read get_workspace for the latest IDs and revision, then correct invalid paths, missing IDs or stale revisions before retrying."),
    result: representativeResult(contract.name),
    outputSchema: workspaceToolNames.has(contract.name)
      ? workspaceOutputSchema
      : undefined,
  };
});

export const promptLibrary = [
  [
    "Discover or search",
    "Beginner",
    "Find public sources for earthquakes. Inspect supported inputs and explain which can run without an API key.",
  ],
  [
    "Create",
    "Beginner",
    "Create a new local dashboard called Research demo, then add a live USGS earthquake map. Keep my other dashboards.",
  ],
  [
    "Inspect",
    "Beginner",
    "Inspect my current cards, their data freshness and errors. Do not change anything.",
  ],
  [
    "Update",
    "Beginner",
    "Rename the selected card to Observed earthquakes, make it half-width, and move it first.",
  ],
  [
    "Transform",
    "Intermediate",
    "Inspect earthquake fields, filter the displayed rows to magnitude 5 or above, and show a table. Preserve the raw response.",
  ],
  [
    "Compare",
    "Showcase",
    "Join the Counts and Targets cards by name after checking key types and uniqueness. Create a comparison table that stays connected to both sources.",
  ],
  [
    "Refresh",
    "Intermediate",
    "Refresh only the failed source card. Wait for its result, respect retryAfter, and report any remaining source error without adding a duplicate card.",
  ],
  [
    "Export or share",
    "Beginner",
    "Open the clean share snapshot for my review. Tell me which local attachments and private settings were excluded.",
  ],
  [
    "Approve or confirm",
    "Intermediate",
    "Request removal of the selected card. Leave the visible confirmation to me and stop if the workspace revision changes.",
  ],
  [
    "Recover from failure",
    "Showcase",
    "Inspect the failed sources in my dashboard. Separate missing inputs, rate limits, timeouts and browser access failures. Propose the next safe step for each; do not invent data.",
  ],
];
export const workflows = [
  {
    id: "earthquake-map",
    name: "Build a source-backed map",
    goal: "See where recent earthquakes occurred.",
    human: "Choose a source in Discover and set the map view.",
    tools: [
      "search_api_catalog",
      "inspect_api_capability",
      "create_block",
      "inspect_source_schema",
      "choose_visualization",
    ],
    uses: [
      "User topic",
      "Source and capability IDs from step 1",
      "Validated inputs and operation ID from step 2",
      "blockId returned by step 3",
      "Observed coordinate paths and blockId",
    ],
    changes:
      "Adds one source card and configures its map. Raw responses remain available.",
    approval:
      "Review the proposed source and live request. Non-GET execution stays in the visible editor.",
    failure:
      "If source loading fails, keep its card and outcome. Retry with refresh_widget after fixing access or inputs; do not create duplicates.",
    prompt:
      "Find a USGS earthquake source, inspect its inputs, create a live earthquake card, inspect its fields and map the observed coordinates. Preserve source attribution and report failed or empty responses.",
  },
  {
    id: "connected-comparison",
    name: "Connect two datasets",
    goal: "Compare actual counts with targets.",
    human: "Select cards, open Connect data and edit a join.",
    tools: [
      "list_blocks",
      "inspect_source_schema",
      "select_map_tag_fields",
      "combine_sources",
      "choose_visualization",
    ],
    uses: [
      "Current dashboard",
      "IDs of Counts and Targets from step 1; inspect each",
      "Observed name, count and target paths",
      "Selected source IDs and a join on name",
      "Derived blockId from step 4",
    ],
    changes:
      "Saves selected fields and a derived comparison table with declarative bindings.",
    approval: "The user requests the new comparison. No source is overwritten.",
    failure:
      "Mismatched or duplicate right keys require a corrected join. Missing values stay missing.",
    prompt: promptOverrides.combine_sources,
  },
  {
    id: "question-answer",
    name: "Ask the canvas",
    goal: "Turn selected evidence into an editable answer.",
    human: "Select cards, choose Ask about data and save a question.",
    tools: [
      "list_blocks",
      "create_content_block",
      "prepare_canvas_question",
      "answer_canvas_question",
      "move_block",
    ],
    uses: [
      "Current card IDs",
      "kind question with question text and selected sourceIds",
      "questionBlockId returned by step 2",
      "Current expectedRevision, scoped evidence and answer schema from step 3",
      "Answer blockId from step 4",
    ],
    changes:
      "Creates a question and one or more ordinary answer blocks, then moves an answer first.",
    approval:
      "The connected agent supplies the answer. The person can inspect, edit or remove it. No model API runs inside this app.",
    failure:
      "Stale revisions require fresh context. Missing evidence must appear in the answer. Invalid output bundles add no cards.",
    prompt:
      "Save a question asking what the selected cards show. Read its structured context, answer only from that evidence, cite source paths, create an answer plus a useful table, and move the answer first.",
  },
  {
    id: "recover-source",
    name: "Recover one failed request",
    goal: "Fix a failed source without losing the dashboard.",
    human: "Read the card error, edit inputs or use Retry request.",
    tools: [
      "list_workspace_sources",
      "inspect_api_capability",
      "refresh_widget",
      "list_blocks",
    ],
    uses: [
      "Current source outcomes",
      "Failed source capability ID",
      "Existing widgetId after inputs or access are corrected",
      "Refreshed block outcome",
    ],
    changes: "Refreshes the existing source card and updates dependent blocks.",
    approval:
      "Explicitly review external request retries. Sample fallback needs user consent.",
    failure:
      "Respect retryAfter. Stop retrying unavailable or disallowed sources and retain the actionable error.",
    prompt:
      "Inspect failed sources, identify the cause, and retry the existing card only when its inputs and access are valid. Respect provider rate limits and verify the resulting state.",
  },
  {
    id: "present-evidence",
    name: "Present a reviewed dashboard",
    goal: "Share a clean explanation with source attribution.",
    human: "Summarize page, rearrange cards, then Share / present.",
    tools: [
      "get_page_context",
      "summarize_canvas",
      "move_block",
      "collapse_sidebar",
      "open_share_view",
    ],
    uses: [
      "Bounded source data, filters and errors",
      "Current card IDs and revision",
      "Summary blockId",
      "collapsed true",
      "Current reviewed dashboard",
    ],
    changes:
      "Adds a deterministic summary, changes order and opens a redacted share snapshot.",
    approval: "The human reviews the snapshot before distributing its link.",
    failure:
      "Missing sources remain visible in the summary. Reduce an oversized snapshot; local file bytes cannot be shared.",
    prompt:
      "Inspect this page, add a cited summary of observed values and source issues, move it first, collapse discovery and open the clean share snapshot for my review.",
  },
  {
    id: "local-content",
    name: "Add notes and local files",
    goal: "Keep user-selected files next to public data.",
    human: "Add content, choose file, select attachments and set Custom style.",
    tools: [
      "get_content_spec",
      "create_content_block",
      "update_content_block",
      "get_page_context",
    ],
    uses: [
      "Versioned file and style schema",
      "User-supplied reference metadata, never guessed file bytes",
      "Returned content blockId and requested edits",
      "Current cards including attachment availability",
    ],
    changes:
      "Adds an ordinary file or note card with metadata and bounded presentation settings.",
    approval:
      "Only the human file picker can grant file access. A URI alone is not permission.",
    failure:
      "Unavailable files show Reconnect. Unsupported assets retain metadata and a download path when available.",
    prompt:
      "Read the content spec and create a file reference card for the file I name. Let me select or reconnect the file in the editor, then keep the card editable and report its actual availability.",
  },
].map((w) => ({
  ...w,
  steps: w.tools.map((tool, i) => ({ tool, uses: [w.uses[i]] })),
}));
