<script setup lang="ts">
import { ref } from "vue";
import {
  ArrowUp,
  Sparkles,
  LoaderCircle,
  TerminalSquare,
} from "lucide-vue-next";
import { createToolRunner } from "../webmcp/handlers";
import { useWorkspace } from "../stores/workspace";
import { planIntent, type IntentPlan } from "./intent";
import { writeLocal, readLocal } from "../runtime/persistence";
const emit = defineEmits<{ tools: [] }>();
const store = useWorkspace(),
  prompt = ref(""),
  message = ref(""),
  busy = ref(false),
  plan = ref<IntentPlan>();
const plannedRevision = ref(0);
const runTool = createToolRunner(store);
async function run(value = prompt.value) {
  if (busy.value || !value.trim()) return;
  message.value = "";
  try {
    plan.value = planIntent(value, new Date(), store);
    plannedRevision.value = store.revision;
  } catch (error) {
    message.value = (error as Error).message;
  }
}
async function execute() {
  if (!plan.value || busy.value) return;
  busy.value = true;
  try {
    const result = await runTool("execute_goal", {
      prompt: plan.value.prompt,
      expectedRevision: plannedRevision.value,
    });
    const output = JSON.parse(result.content[0].text);
    message.value = result.isError
      ? output.error
      : output.status === "partial"
        ? output.steps
            .filter((s: any) => s.error)
            .map((s: any) => s.error)
            .join(" ")
        : "Dashboard updated from the reviewed request plan.";
    const history = (await readLocal<string[]>("prompt-history")) ?? [];
    await writeLocal(
      "prompt-history",
      [plan.value.prompt, ...history].slice(0, 30),
    );
    if (!result.isError) {
      plan.value = undefined;
      prompt.value = "";
    }
  } finally {
    busy.value = false;
  }
}
defineExpose({ run });
</script>
<template>
  <div class="composer-wrap">
    <section v-if="plan" class="intent-plan" aria-label="Request plan">
      <div class="button-row">
        <strong>Review the request plan</strong
        ><button class="text-button" @click="plan = undefined">
          Close plan
        </button>
      </div>
      <ol>
        <li v-for="(step, i) in plan.steps" :key="i">
          <strong>{{ step.title }}</strong>
          <p>{{ step.reason }}</p>
          <details>
            <summary>Request inputs</summary>
            <pre>{{ JSON.stringify(step.params, null, 2) }}</pre>
          </details>
        </li>
      </ol>
      <ol v-if="plan.edits">
        <li v-for="(edit, i) in plan.edits" :key="i">{{ edit.reason }}</li>
      </ol>
      <p v-for="question in plan.questions" :key="question" role="alert">
        {{ question }}
      </p>
      <p class="tiny muted">{{ plan.notes[0] }} Data mode: {{ store.mode }}.</p>
      <button
        class="button primary"
        :disabled="busy || !!plan.questions.length"
        @click="execute"
      >
        {{ busy ? "Running plan…" : "Run this plan" }}
      </button>
    </section>
    <p v-if="message" class="composer-message" role="status">
      {{ message }}
      <button aria-label="Dismiss message" @click="message = ''">×</button>
    </p>
    <form class="composer" @submit.prevent="run()">
      <Sparkles :size="20" class="composer-spark" /><input
        aria-label="Workspace command"
        v-model="prompt"
        placeholder="Try: build an earthquake research dashboard"
        :disabled="busy"
      /><button
        class="composer-tools"
        type="button"
        aria-label="Open agent tools"
        @click="emit('tools')"
      >
        <TerminalSquare :size="18" /></button
      ><button
        class="send-button"
        type="submit"
        :disabled="busy || !prompt.trim()"
        aria-label="Run command"
      >
        <LoaderCircle v-if="busy" :size="19" class="spinning" /><ArrowUp
          v-else
          :size="20"
        />
      </button>
    </form>
    <div class="composer-caption">
      <span>Local command runner</span
      ><span>Connect a WebMCP agent for open-ended requests</span>
    </div>
  </div>
</template>
