<script setup lang="ts">
import project from "./project.json";
import script from "./videoScript.json";
import { toolDocs, workflows } from "./toolDocs";
import { youtubeEmbed } from "./navigation";
import CopyButton from "./CopyButton.vue";
import DemoVideo from "./DemoVideo.vue";
const video = import.meta.env.VITE_DEMO_VIDEO_URL || project.youtubeUrl;
const architecture = [
  ["User request", "A person selects cards or states a goal."],
  ["Tool discovery", "document.modelContext exposes the native contracts."],
  [
    "Schema validation",
    "AJV validates arguments and the runner checks revisions.",
  ],
  [
    "Application actions",
    "Workspace tools call existing services and data adapters.",
  ],
  [
    "Shared state",
    "Pinia owns cards, bindings, requests and local dashboards.",
  ],
  [
    "Visible update",
    "Vue renders the same editable cards used by the human UI.",
  ],
  [
    "Structured result",
    "The caller receives IDs, outcomes, warnings or errors.",
  ],
];
const checklist = [
  {
    label: "Working live application",
    ready: true,
    text: `Existing Netlify site responded on ${project.verifiedDate}. New release checks are recorded in docs/VERIFICATION.md.`,
    href: project.liveUrl,
  },
  {
    label: "Project description and WebMCP use case",
    ready: true,
    text: "Problem, workflow, human controls and agent capabilities are described on this page.",
  },
  {
    label: "Implementation explanation",
    ready: true,
    text: "Actual registration, validation, state ownership and extension files are documented below.",
  },
  {
    label: "Public narrated YouTube demo under three minutes",
    ready: false,
    text: youtubeEmbed(video)
      ? "Video configured. Manually verify public access, audio and duration before submission."
      : "Recording and upload are pending. A 2:50 script is ready.",
  },
  {
    label: "Public source repository",
    ready: project.repositoryPublicVerified,
    text: "The Git remote is detected, but the unauthenticated GitHub check returned 404. Public access and a push of this release remain to be verified.",
    href: project.repositoryUrl,
  },
  {
    label: "Complete source, assets and setup instructions",
    ready: false,
    text: "Present in this checkout. Verify the public repository includes these changes before submission.",
  },
  {
    label: "OSI-approved license",
    ready: true,
    text: "MIT LICENSE added to this checkout. Bundled fonts retain their original OFL notices.",
  },
  {
    label: "README and development commands",
    ready: true,
    text: "Installation, development, testing, build, browser requirements and Netlify deployment are documented.",
  },
];
const comparisons = [
  {
    goal: "Build a map",
    manual: "Find an API, enter inputs, inspect fields and choose a view.",
    agent: "Read the screen, fill controls and check which card appeared.",
    webmcp:
      "Discover a capability, create_block, inspect_source_schema, choose_visualization.",
    benefit:
      "Returned IDs identify the card. Schema validation catches invalid arguments before a mutation.",
  },
  {
    goal: "Combine two sources",
    manual: "Inspect both datasets and configure a join in Connect data.",
    agent: "Navigate two cards and transfer field names between controls.",
    webmcp:
      "Inspect both schemas, select_map_tag_fields, then combine_sources.",
    benefit:
      "Stored bindings retain the exact sources and keys. Type and uniqueness checks explain failed joins.",
  },
  {
    goal: "Answer a question",
    manual: "Read the cards, write an answer and add source citations.",
    agent: "Reconstruct evidence from visible text and screenshots.",
    webmcp:
      "prepare_canvas_question returns scoped evidence; answer_canvas_question validates normal output blocks.",
    benefit:
      "Filters, freshness and gaps travel with the evidence. A stale revision requires fresh context.",
  },
];
</script>
<template>
  <section class="doc-hero hackathon-hero">
    <div>
      <p class="doc-eyebrow">API Canvas · WebMCP project</p>
      <h1>Public data.<br />A shared canvas.</h1>
      <p class="doc-lead">
        Turn public data into connected cards. People and agents work on the
        same local canvas.
      </p>
      <p class="hero-tagline">
        Declared browser tools. Editable results. Human control.
      </p>
      <div class="doc-actions">
        <a href="/" class="button primary" data-site-link>Launch demo</a
        ><a href="/webmcp" class="button" data-site-link>Explore WebMCP tools</a
        ><a
          :href="project.repositoryUrl"
          class="button"
          target="_blank"
          rel="noreferrer"
          >Repository · access unverified</a
        ><a
          :href="youtubeEmbed(video) ? video : '#demo-video'"
          class="button"
          >{{
            youtubeEmbed(video) ? "Watch demo video" : "Demo video · pending"
          }}</a
        >
      </div>
    </div>
    <div
      class="canvas-illustration"
      aria-label="Illustration of a source, a connected table and an answer card"
    >
      <div class="mini-card">
        <span>01 / Source</span><strong>Observed data</strong>
        <div class="mini-bars"><i></i><i></i><i></i><i></i><i></i></div>
        <small>Original response + provenance</small>
      </div>
      <div class="mini-card">
        <span>02 / Connect</span><strong>A reusable view</strong>
        <div class="mini-table">
          <span>Field</span><span>Value</span><span>Source</span
          ><span>Linked</span><span>Mapping</span><span>Editable</span>
        </div>
      </div>
      <div class="mini-card answer">
        <span>03 / Explain</span><strong>An answer you can edit</strong>
        <p>Selected evidence → cited content → a normal card</p>
      </div>
      <small>Workflow illustration, not live measurements</small>
    </div>
  </section>
  <nav class="doc-jump" aria-label="Hackathon sections">
    <a href="#project">Project</a><a href="#architecture">Architecture</a
    ><a href="#showcase">Showcase</a><a href="#submission">Submission</a
    ><a href="#demo-video">Video</a><a href="#extend">Contribute</a>
  </nav>
  <section id="project" class="doc-section doc-grid two">
    <div>
      <p class="doc-eyebrow">The problem</p>
      <h2>Useful data rarely arrives in a useful view.</h2>
      <p>
        Researchers, analysts and curious people collect API responses,
        spreadsheets, news feeds and notes. The work is in choosing fields,
        comparing sources and keeping the evidence connected to the explanation.
      </p>
      <p>
        API Canvas turns those responses into reusable maps, charts, tables and
        content cards. Sources, raw data, transformations and presentation stay
        separate. A changed view can reuse the same response.
      </p>
    </div>
    <div class="doc-panel tinted">
      <h3>A person and an agent can pick up the same work</h3>
      <p>
        You select sources, edit mappings, reorder cards and inspect provenance.
        A connected agent can discover the catalog, configure views, combine
        sources and submit cited answers through {{ toolDocs.length }} native
        tools.
      </p>
      <p>
        Both use the existing Pinia store. You can revise agent-created blocks
        in the normal interface. Destructive actions still wait for a visible
        human confirmation.
      </p>
      <p>
        Structured context includes values outside the visible viewport, source
        errors and filters. The agent no longer has to infer those facts from a
        screenshot.
      </p>
    </div>
  </section>
  <section id="architecture" class="doc-section">
    <p class="doc-eyebrow">How the application works</p>
    <h2>The tool call meets the same workspace.</h2>
    <ol class="architecture-flow">
      <li v-for="[title, description] in architecture" :key="title">
        <strong>{{ title }}</strong
        ><span>{{ description }}</span>
      </li>
    </ol>
    <p>
      Vue 3 renders the interface. Pinia owns shared state. Dashboard recipes
      live in localStorage; response caches, files and history use IndexedDB
      through the existing persistence helper. Public-data adapters normalize
      source responses. ECharts renders chart views. Netlify hosts the Vite
      build and the bounded Unsplash function.
    </p>
    <p>
      The app is local first. It has no account system or hosted LLM. A
      connected agent interprets questions and submits content; the browser
      validates and renders that content.
    </p>
  </section>
  <section id="showcase" class="doc-section">
    <p class="doc-eyebrow">Try an actual workflow</p>
    <h2>Work that stays on the canvas</h2>
    <div class="doc-grid two">
      <article
        v-for="workflow in workflows"
        :key="workflow.id"
        class="doc-panel"
      >
        <h3>{{ workflow.name }}</h3>
        <p>{{ workflow.goal }}</p>
        <dl>
          <dt>Human interaction</dt>
          <dd>{{ workflow.human }}</dd>
          <dt>Tool chain</dt>
          <dd class="tool-chain-text">{{ workflow.tools.join(" → ") }}</dd>
          <dt>Visible result</dt>
          <dd>{{ workflow.changes }}</dd>
        </dl>
        <blockquote>{{ workflow.prompt }}</blockquote>
        <CopyButton
          :text="workflow.prompt"
          label="Copy demonstration prompt"
        /><a :href="`/webmcp#${workflow.id}`" data-site-link
          >See steps and failure handling</a
        >
      </article>
    </div>
  </section>
  <section class="doc-section">
    <p class="doc-eyebrow">Three everyday tasks</p>
    <h2>Fewer assumptions between intent and action</h2>
    <div class="doc-grid three">
      <article
        v-for="comparison in comparisons"
        :key="comparison.goal"
        class="doc-panel"
      >
        <h3>{{ comparison.goal }}</h3>
        <dl>
          <dt>Manual workflow</dt>
          <dd>{{ comparison.manual }}</dd>
          <dt>Screenshot / DOM agent</dt>
          <dd>{{ comparison.agent }}</dd>
          <dt>WebMCP</dt>
          <dd>{{ comparison.webmcp }}</dd>
        </dl>
        <p>{{ comparison.benefit }}</p>
      </article>
    </div>
  </section>
  <section class="doc-section owner-note">
    <p class="doc-eyebrow">What is possible</p>
    <h2>“I want the answer to stay useful after the conversation.”</h2>
    <p>
      I can ask an agent to assemble a dashboard, inspect its work, and keep
      changing it myself. An answer becomes a card I can cite again. A join
      becomes a connection I can edit. A local file can sit next to an API
      response without creating a separate document system.
    </p>
    <p>
      I have kept the contracts visible because the boundaries matter. Missing
      data should stay missing. Local files should require my selection. When an
      agent asks to remove my work, I should be the one who confirms it.
    </p>
  </section>
  <section id="extend" class="doc-section">
    <p class="doc-eyebrow">Contributor guide</p>
    <h2>Extend the existing system</h2>
    <div class="doc-grid two">
      <article class="doc-panel">
        <h3>Add a capability</h3>
        <ol>
          <li>
            Add a strict input schema and tool definition in
            <code>src/webmcp/workspaceTools.ts</code>. Reuse
            <code>contentSchema</code>, <code>presentation</code> and binding
            schemas where appropriate.
          </li>
          <li>
            Handle it in <code>runWorkspaceTool</code> using actions from
            <code>src/stores/workspace.ts</code>. Add source adapters under
            <code>src/api/providers/</code> or <code>src/sources/</code>.
          </li>
          <li>
            The workspace contract joins
            <code>nativeContracts</code> automatically through
            <code>src/webmcp/register.ts</code>. Older general contracts live in
            <code>src/webmcp/contracts.ts</code> and need explicit native
            selection.
          </li>
          <li>
            Add valid example arguments and any prompt override in
            <code>src/site/toolDocs.ts</code>. Add a workflow using actual tool
            names and explicit data dependencies.
          </li>
          <li>
            Test validation, outcomes, permissions and state changes. The
            documentation tests fail if examples are invalid or the catalog
            differs from native registration.
          </li>
        </ol>
      </article>
      <article class="doc-panel">
        <h3>WebMCP implementation</h3>
        <p>
          Registration is imperative JavaScript through
          <code>document.modelContext.registerTool</code>. The app does not use
          declarative HTML tool registration. Names use descriptive snake_case.
        </p>
        <p>
          <code>src/webmcp/handlers.ts</code> compiles JSON Schemas with AJV.
          Workspace tools return checked envelopes with action, revision,
          status, warnings and data or an actionable error. Older native tools
          retain their existing result shapes.
        </p>
        <p>
          Registration adds <code>readOnlyHint</code> and
          <code>untrustedContentHint</code>. Annotations describe behavior; they
          do not grant permission. The application enforces approval and source
          access checks.
        </p>
        <p>
          The App shell owns the registration AbortController. Route changes
          keep it mounted. Execution signals reach requests. Session diagnostics
          use a bounded, redacted result preview; they do not persist full tool
          output.
        </p>
        <a href="/webmcp#inspector" data-site-link
          >Inspect the current registration</a
        >
      </article>
    </div>
  </section>
  <section id="submission" class="doc-section submission">
    <p class="doc-eyebrow">Submission readiness</p>
    <h2>Ready to inspect. A few things still need the owner.</h2>
    <p>
      This is a project checklist, not a claim of hackathon acceptance or
      compliance with every competition rule.
    </p>
    <div class="checklist">
      <article v-for="item in checklist" :key="item.label">
        <span class="doc-badge" :class="{ warn: !item.ready }">{{
          item.ready ? "Present / checked" : "Pending verification"
        }}</span>
        <div>
          <h3>{{ item.label }}</h3>
          <p>{{ item.text }}</p>
          <a
            v-if="item.href"
            :href="item.href"
            target="_blank"
            rel="noreferrer"
            >{{ item.href }}</a
          >
        </div>
      </article>
    </div>
    <p>
      URLs and readiness metadata live in <code>src/site/project.json</code>.
      Unavailable links use <code>[LIVE_URL]</code>,
      <code>[YOUTUBE_URL]</code> or <code>[REPOSITORY_URL]</code>. A detected
      URL is not evidence that its contents are public or current.
    </p>
    <details>
      <summary>Install, test, build and deploy</summary>
      <pre>
npm ci
npx playwright install chromium
npm run dev
npm run verify
npm run preview
npx netlify status
npx netlify deploy --dir dist --functions netlify/functions --no-build --prod</pre>
      <p>
        Use the existing linked site. Build before deploying. Optional
        <code>UNSPLASH_ACCESS_KEY</code> belongs in Netlify's server
        environment, never a VITE variable. The rest of the workspace works
        without it.
      </p>
    </details>
  </section>
  <section id="demo-video" class="doc-section">
    <p class="doc-eyebrow">A 2:50 narrated walkthrough</p>
    <h2>Watch the work happen</h2>
    <DemoVideo :url="video" />
    <p>
      Configure <code>VITE_DEMO_VIDEO_URL</code> or the YouTube URL in
      <code>src/site/project.json</code>. Confirm the upload is public, has
      audio and is under three minutes. The script below includes pauses for the
      actual request and UI updates.
    </p>
    <details class="recording-script">
      <summary>Full recording script, 0:00 to 2:50</summary>
      <p>
        Record at approximately 145 words per minute. Keep the primary workflow
        continuous. If the live API fails, show that failure and disclose any
        fixture; do not edit it into a successful response.
      </p>
      <article v-for="segment in script" :key="segment.time">
        <h3>{{ segment.time }}</h3>
        <dl>
          <dt>Screen action</dt>
          <dd>{{ segment.action }}</dd>
          <dt>Exact narration</dt>
          <dd>
            <blockquote>{{ segment.narration }}</blockquote>
          </dd>
          <dt>Tools</dt>
          <dd>{{ segment.tools }}</dd>
          <dt>Expected result</dt>
          <dd>{{ segment.result }}</dd>
        </dl>
      </article>
      <p>The matching script is in <code>docs/demo-video-script.md</code>.</p>
    </details>
  </section>
</template>
