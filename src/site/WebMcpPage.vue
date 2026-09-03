<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
onMounted(() =>
  document.getElementById(location.hash.slice(1))?.scrollIntoView(),
);
import { toolDocs, workflows, promptLibrary } from "./toolDocs";
import {
  nativeContracts,
  webmcpStatus,
  webmcpError,
  registeredToolNames,
} from "../webmcp/register";
import { createToolRunner, toolLog } from "../webmcp/handlers";
import { latestToolResult } from "../webmcp/inspection";
import { useWorkspace } from "../stores/workspace";
import ModalDialog from "../components/ModalDialog.vue";
import CopyButton from "./CopyButton.vue";
const query = ref("");
const filter = ref("all");
const docs = computed(() =>
  toolDocs.filter(
    (t) =>
      `${t.name} ${t.purpose}`
        .toLowerCase()
        .includes(query.value.toLowerCase()) &&
      (filter.value === "all" || t.classifications.includes(filter.value)),
  ),
);
const expanded = ref<string>();
const preview = ref<(typeof toolDocs)[number]>();
const busy = ref(false);
const store = useWorkspace();
const run = createToolRunner(store);
const json = (value: unknown) => JSON.stringify(value, null, 2);
async function tryTool(tool: (typeof toolDocs)[number]) {
  if (!tool.safe) {
    preview.value = tool;
    return;
  }
  busy.value = true;
  try {
    await run(tool.name, tool.args);
  } finally {
    busy.value = false;
  }
}
const comparison = [
  ["Look at a screenshot or DOM tree", "Discover declared tools"],
  [
    "Infer which controls match the goal",
    "Read names, descriptions and schemas",
  ],
  ["Locate controls and operate the interface", "Submit validated arguments"],
  [
    "Observe the interface again to check the result",
    "Read the structured response",
  ],
  [
    "Revisit selectors when the layout changes",
    "Use the same tool after a layout change",
  ],
];
const step = ref(0);
const compareSteps = [
  "Inspect the current dashboard",
  "Locate the chosen card",
  "Open its visualization menu",
  "Choose table",
  "Confirm the result",
];
const schemasValid = computed(() => toolDocs.every((t) => t.exampleValid));
</script>
<template>
  <section class="doc-hero">
    <p class="doc-eyebrow">WebMCP in API Canvas</p>
    <h1>One canvas.<br />Two ways to work.</h1>
    <p class="doc-lead">
      You choose controls. An agent calls tools. Both edit the same cards,
      source connections and local dashboards.
    </p>
    <div class="doc-actions">
      <a class="button primary" href="#tool-catalog"
        >Explore {{ toolDocs.length }} tools</a
      ><a class="button" href="#workflows">Follow a workflow</a
      ><a class="button" href="#inspector">Inspect this session</a>
    </div>
    <div class="doc-stats">
      <div>
        <strong>{{ nativeContracts.length }}</strong
        ><span>Native tool contracts</span>
      </div>
      <div>
        <strong>{{ workflows.length }}</strong
        ><span>Connected workflows</span>
      </div>
      <div><strong>Shared</strong><span>Pinia actions and state</span></div>
    </div>
  </section>
  <nav class="doc-jump" aria-label="WebMCP sections">
    <a href="#how-tools-work">How it works</a><a href="#comparison">Compare</a
    ><a href="#tool-catalog">Tools</a><a href="#prompts">Prompts</a
    ><a href="#workflows">Workflows</a><a href="#inspector">Inspector</a>
  </nav>
  <section id="how-tools-work" class="doc-section doc-grid two">
    <div>
      <p class="doc-eyebrow">The browser declares the actions</p>
      <h2>Data work with an explicit contract</h2>
      <p>
        WebMCP lets this page declare callable JavaScript tools with JSON
        Schemas. API Canvas uses them to inspect public sources, create reusable
        views, connect data and turn selected evidence into answer cards.
      </p>
      <p>
        You can do the same work in Discover, Connect data, Ask about data and
        each card's settings. The tool runner validates arguments before calling
        the existing workspace store.
      </p>
    </div>
    <div class="doc-panel">
      <h3>Your controls stay yours</h3>
      <p>
        Agents can add and edit requested cards. Deleting a block or clearing a
        dashboard opens a visible confirmation. Webpage permissions and non-GET
        sources require review in the source editor.
      </p>
      <p>
        Local file access starts with your file selection. Answers come from the
        connected agent and retain citations. The app does not run an LLM or
        turn missing evidence into facts.
      </p>
      <a
        href="https://developer.chrome.com/docs/ai/webmcp/imperative-api"
        target="_blank"
        rel="noreferrer"
        >Read Chrome's imperative API reference</a
      >
    </div>
  </section>
  <section id="comparison" class="doc-section">
    <p class="doc-eyebrow">Same goal, different interaction</p>
    <h2>Change an earthquake card to a table</h2>
    <div class="doc-grid two">
      <article class="doc-panel">
        <h3>An agent operating the interface</h3>
        <ol>
          <li v-for="row in comparison" :key="row[0]">{{ row[0] }}</li>
        </ol>
      </article>
      <article class="doc-panel tinted">
        <h3>An agent using WebMCP</h3>
        <ol>
          <li v-for="row in comparison" :key="row[1]">{{ row[1] }}</li>
        </ol>
      </article>
    </div>
    <div class="doc-panel comparison-demo">
      <p>
        <strong>Illustrative walkthrough.</strong> These counts explain the
        workflow; they are not measured performance or reliability claims. This
        control does not change your dashboard.
      </p>
      <div class="doc-grid two">
        <div>
          <h3>UI sequence</h3>
          <p>
            {{ step ? compareSteps[step - 1] : "Ready to inspect the page" }}
          </p>
          <p>
            Observations: {{ Math.min(step, 2) + (step === 5 ? 1 : 0) }} · UI
            operations: {{ Math.max(0, Math.min(step - 2, 2)) }} · Tool calls: 0
          </p>
        </div>
        <div>
          <h3>Structured sequence</h3>
          <p>
            {{
              step < 2
                ? "list_blocks → choose_visualization"
                : "Read blockId, then set presentation.type to table"
            }}
          </p>
          <p>
            Observations: 0 · UI operations: 0 · Tool calls:
            {{ step === 0 ? 0 : step === 1 ? 1 : 2 }}
          </p>
        </div>
      </div>
      <p role="status">
        {{
          step === 5
            ? "Illustrative result: the existing card shows a table."
            : `Step ${step} of 5`
        }}
      </p>
      <div class="doc-actions">
        <button class="button" :disabled="step === 5" @click="step++">
          Next step</button
        ><button class="text-button" @click="step = 0">Reset example</button>
      </div>
    </div>
  </section>
  <section id="tool-catalog" class="doc-section">
    <p class="doc-eyebrow">Generated from nativeContracts</p>
    <h2>The complete tool catalog</h2>
    <p>
      Every native tool appears below. Compatibility aliases in the older local
      runner are excluded. Examples pass the actual input schemas, but sample
      IDs and revisions must be replaced with current values. Result snippets
      illustrate the envelope or a failure shape; they are not live evidence.
    </p>
    <div class="doc-filters">
      <label
        >Search tools<input
          v-model="query"
          type="search"
          placeholder="Try sources, answer or share" /></label
      ><label
        >Classification<select v-model="filter">
          <option value="all">All tools</option>
          <option>read-only</option>
          <option>mutating</option>
          <option>approval-required</option>
        </select></label
      ><span role="status"
        >{{ docs.length }} of {{ toolDocs.length }} tools</span
      >
    </div>
    <div class="tool-catalog">
      <article
        v-for="tool in docs"
        :id="`tool-${tool.name}`"
        :key="tool.name"
        class="doc-panel tool-card"
        :data-tool="tool.name"
      >
        <div class="tool-heading">
          <div>
            <h3>{{ tool.title }}</h3>
            <code>{{ tool.name }}</code>
          </div>
          <span class="doc-badge" :class="{ warn: !tool.exampleValid }">{{
            tool.exampleValid ? "Example validated" : "Example needs correction"
          }}</span>
        </div>
        <div class="doc-tags">
          <span v-for="tag in tool.classifications" :key="tag">{{ tag }}</span>
        </div>
        <p>{{ tool.purpose }}</p>
        <blockquote>{{ tool.prompt }}</blockquote>
        <div class="doc-actions">
          <CopyButton :text="tool.prompt" label="Copy prompt" /><CopyButton
            :text="json(tool.args)"
            label="Copy arguments"
          /><CopyButton :text="tool.name" label="Copy tool name" /><button
            class="button"
            :disabled="busy || !tool.exampleValid"
            @click="tryTool(tool)"
          >
            {{ tool.safe ? "Run local read-only example" : "Preview action" }}
          </button>
        </div>
        <details
          :open="expanded === tool.name"
          @toggle="
            ($event.target as HTMLDetailsElement).open && (expanded = tool.name)
          "
        >
          <summary>Schema, examples and recovery</summary>
          <dl>
            <dt>Required properties</dt>
            <dd>{{ tool.required.join(", ") || "None" }}</dd>
            <dt>Optional properties</dt>
            <dd>{{ tool.optional.join(", ") || "None" }}</dd>
            <dt>State affected</dt>
            <dd>{{ tool.state }}</dd>
            <dt>Errors and recovery</dt>
            <dd>{{ tool.recovery }}</dd>
            <dt>Definition</dt>
            <dd>
              <code>{{ tool.source }}</code>
            </dd>
            <dt>Native registration</dt>
            <dd>
              <code>src/webmcp/register.ts</code>, imperative registration in
              the app shell.
            </dd>
          </dl>
          <h4>Input JSON Schema</h4>
          <pre>{{ json(tool.schema) }}</pre>
          <h4>Representative arguments</h4>
          <pre>{{ json(tool.args) }}</pre>
          <h4>Illustrative structured result</h4>
          <p>
            Abbreviated example, including a failure response where relevant.
            Nested fields and arrays may be shortened. Read the session
            inspector for actual returned data.
          </p>
          <pre>{{ json(tool.result) }}</pre>
          <details v-if="tool.outputSchema">
            <summary>Workspace output JSON Schema</summary>
            <pre>{{ json(tool.outputSchema) }}</pre>
          </details>
          <p v-if="!tool.exampleValid" class="error">
            {{ tool.validationError }}
          </p>
        </details>
      </article>
    </div>
  </section>
  <section id="prompts" class="doc-section">
    <p class="doc-eyebrow">Start with what you need</p>
    <h2>A prompt for the task</h2>
    <div class="doc-grid two">
      <article
        v-for="[goal, level, prompt] in promptLibrary"
        :key="goal"
        class="doc-panel"
      >
        <span class="doc-badge">{{ level }}</span>
        <h3>{{ goal }}</h3>
        <p>{{ prompt }}</p>
        <CopyButton :text="prompt" label="Copy prompt" />
      </article>
    </div>
  </section>
  <section id="workflows" class="doc-section">
    <p class="doc-eyebrow">Tools that pass work forward</p>
    <h2>Connected workflows</h2>
    <p>
      These chains describe real calls and the values passed between them. The
      connected agent supplies current arguments; the page never executes a
      chain on its own.
    </p>
    <article
      v-for="workflow in workflows"
      :id="workflow.id"
      :key="workflow.id"
      class="doc-panel workflow-card"
    >
      <h3>{{ workflow.name }}</h3>
      <p>{{ workflow.goal }}</p>
      <ol class="workflow-steps">
        <li v-for="(entry, index) in workflow.steps" :key="index">
          <a :href="`#tool-${entry.tool}`"
            ><code>{{ entry.tool }}</code></a
          ><span>{{ entry.uses[0] }}</span>
        </li>
      </ol>
      <dl>
        <dt>State changes</dt>
        <dd>{{ workflow.changes }}</dd>
        <dt>Human boundary</dt>
        <dd>{{ workflow.approval }}</dd>
        <dt>Partial failure</dt>
        <dd>{{ workflow.failure }}</dd>
      </dl>
      <blockquote>{{ workflow.prompt }}</blockquote>
      <CopyButton :text="workflow.prompt" label="Copy workflow prompt" />
      <details>
        <summary>Structured chain</summary>
        <pre>{{ json({ name: workflow.name, steps: workflow.steps }) }}</pre>
      </details>
    </article>
  </section>
  <section id="inspector" class="doc-section">
    <p class="doc-eyebrow">This browser, this session</p>
    <h2>Live tool inspector</h2>
    <div class="doc-panel">
      <dl class="inspector-facts">
        <dt>Native WebMCP</dt>
        <dd data-testid="native-status">{{ webmcpStatus }}</dd>
        <dt>Registered by this document</dt>
        <dd data-testid="registered-count">
          {{ registeredToolNames.length }} of {{ nativeContracts.length }}
        </dd>
        <dt>Schema and example validation</dt>
        <dd>
          {{
            schemasValid
              ? "All input schemas compile and all documented examples validate."
              : "One or more examples need correction."
          }}
        </dd>
        <dt>Most recent call</dt>
        <dd>
          {{
            toolLog[0]
              ? `${toolLog[0].tool} · ${toolLog[0].time} · ${toolLog[0].duration} ms · ${toolLog[0].message}`
              : "No recorded call yet."
          }}
        </dd>
      </dl>
      <p v-if="webmcpStatus !== 'available'">
        Native tools are unavailable in this browser. The catalog and local
        read-only examples still work. Local execution does not demonstrate a
        native WebMCP connection.
      </p>
      <p v-if="webmcpError" class="error">{{ webmcpError }}</p>
      <details>
        <summary>Registered tool names</summary>
        <ul>
          <li v-for="name in registeredToolNames" :key="name">
            <code>{{ name }}</code>
          </li>
        </ul>
      </details>
      <details :open="!!latestToolResult">
        <summary>Most recent structured result or error</summary>
        <p>
          Session-only, redacted and bounded. Raw responses, headers and file
          attachments are omitted. Arrays show up to 12 items and fields may be
          truncated.
        </p>
        <pre>{{
          latestToolResult
            ? json(latestToolResult)
            : "Run a local read-only example, or call a native tool with your connected agent."
        }}</pre>
      </details>
      <a class="button" href="#tool-get_workspace">Try get_workspace</a>
    </div>
  </section>
  <ModalDialog
    v-if="preview"
    title="Review this tool action"
    @close="preview = undefined"
    ><p>
      <strong>{{ preview.name }}</strong> may change state, contact a source or
      require human approval.
    </p>
    <p>{{ preview.state }}</p>
    <pre class="doc-preview">{{ json(preview.args) }}</pre>
    <p>
      Replace example IDs with current values. Use the canvas or your connected
      agent to request this action. This documentation preview never executes
      it.
    </p>
    <CopyButton
      :text="json(preview.args)"
      label="Copy reviewed example"
    /><button class="button" @click="preview = undefined">
      Close preview
    </button></ModalDialog
  >
</template>
