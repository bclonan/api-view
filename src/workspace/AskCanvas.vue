<script setup lang="ts">
import { computed, ref } from "vue";
import ModalDialog from "../components/ModalDialog.vue";
import { useWorkspace } from "../stores/workspace";
import {
  prepareQuestion,
  prepareSavedQuestion,
  summarizeCanvas,
  answerQuestion,
} from "./insights";
import { download } from "../runtime/download";
const props = defineProps<{ scope: string[]; blockId?: string }>();
const emit = defineEmits<{ close: [] }>();
const store = useWorkspace();
const ids = ref(
  props.scope.length
    ? [...props.scope]
    : store.widgets
        .filter((w) => w.content?.kind !== "question")
        .map((w) => w.id),
);
const savedId = ref(props.blockId);
const question = ref(
  props.blockId
    ? (store.getWidget(props.blockId).content?.question ??
        store.getWidget(props.blockId).content?.body ??
        "")
    : "",
);
const answerText = ref(""),
  responseJson = ref("");
const cards = computed(() =>
  store.widgets.filter((w) => w.id !== savedId.value),
);
const answers = computed(() =>
  store.widgets.filter(
    (w) => savedId.value && w.content?.answerTo === savedId.value,
  ),
);
function saveQuestion() {
  const card = store.createContent(
    {
      version: 1,
      kind: "question",
      title: question.value.slice(0, 120),
      body: question.value,
      question: question.value,
      sourceIds: ids.value,
    },
    "user",
    { blockId: savedId.value },
  );
  savedId.value = card.id;
  return card;
}
function submitAnswer(structured = false) {
  try {
    if (!savedId.value)
      throw new Error("Save the question before adding an answer.");
    const saved = store.getWidget(savedId.value).content!;
    if (
      saved.question !== question.value ||
      JSON.stringify(saved.sourceIds) !== JSON.stringify(ids.value)
    )
      throw new Error(
        "Save the changed question and card selection before adding an answer.",
      );
    if (!structured && !answerText.value.trim())
      throw new Error("Write an answer first.");
    const bundle = structured
      ? JSON.parse(responseJson.value)
      : {
          questionBlockId: savedId.value,
          expectedRevision: store.revision,
          outputs: [
            {
              content: {
                version: 1,
                kind: "answer",
                title: `Answer: ${question.value}`.slice(0, 120),
                body: answerText.value,
              },
            },
          ],
        };
    if (bundle.questionBlockId !== savedId.value)
      throw new Error(
        "This response belongs to a different question. Open that question or correct the ID.",
      );
    const result = answerQuestion(store, bundle, "user");
    notice.value = `${result.blocks.length} answer blocks added. Edit or move them on the canvas.`;
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const error = ref(""),
  notice = ref("");
function run(action: "question" | "summary" | "context") {
  try {
    if (!ids.value.length) throw new Error("Choose at least one card.");
    if (action === "summary") {
      store.createContent(summarizeCanvas(store, ids.value), "computed");
      emit("close");
      return;
    }
    prepareQuestion(store, question.value, ids.value);
    saveQuestion();
    const context = prepareSavedQuestion(store, savedId.value!);
    if (action === "context")
      download(
        "canvas-question-context.json",
        JSON.stringify(context, null, 2),
      );
    else {
      notice.value =
        "Question saved. Ask your WebMCP agent to prepare_canvas_question using this questionBlockId, then answer_canvas_question to create cited answer blocks. You can also download its context or write an answer below.";
    }
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <ModalDialog title="Ask about canvas data" @close="emit('close')">
    <div class="ask-canvas">
      <p>
        Choose the evidence for your question. Summaries calculate counts and
        ranges locally. Open-ended answers come from your connected WebMCP
        agent.
      </p>
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <p v-if="notice" role="status" class="notice">{{ notice }}</p>
      <fieldset>
        <legend>Source cards</legend>
        <div class="button-row">
          <button class="text-button" @click="ids = cards.map((w) => w.id)">
            Select all cards</button
          ><button class="text-button" @click="ids = []">
            Clear selection
          </button>
        </div>
        <label v-for="card in cards" :key="card.id" class="check-label"
          ><input type="checkbox" v-model="ids" :value="card.id" />{{
            card.title
          }}</label
        >
      </fieldset>
      <label
        >Question<textarea
          v-model="question"
          aria-label="Question about canvas"
          maxlength="2000"
          rows="4"
          placeholder="What changed, and which source values support it?"
        />
      </label>
      <div class="button-row">
        <button class="button primary" @click="run('question')">
          Save question for agent</button
        ><button class="button" @click="run('context')">
          Download question context</button
        ><button class="button" @click="run('summary')">
          Add data summary
        </button>
      </div>
      <template v-if="savedId">
        <p class="tiny muted">Question ID: {{ savedId }}</p>
        <p v-if="answers.length" role="status">
          {{ answers.length }} answer blocks on this page:
          {{ answers.map((w) => w.title).join(", ") }}
        </p>
        <label
          >Your answer<textarea
            v-model="answerText"
            aria-label="Write an answer"
            rows="4"
            maxlength="20000"
          />
        </label>
        <button class="button" @click="submitAnswer()">Add answer block</button>
        <details>
          <summary>Import structured answer blocks</summary>
          <p class="tiny muted">
            Paste the response bundle from your agent. It must include this
            questionBlockId, the context's expectedRevision, and outputs. A
            changed page requires fresh context.
          </p>
          <textarea
            v-model="responseJson"
            aria-label="Structured answer response"
            rows="7"
          />
          <button class="button" @click="submitAnswer(true)">
            Add structured answer blocks
          </button>
        </details>
      </template>
    </div>
  </ModalDialog>
</template>
<style scoped>
.ask-canvas {
  display: grid;
  gap: 14px;
}
fieldset {
  max-height: 240px;
  overflow: auto;
  border: 1px solid #dce1d7;
}
label {
  display: grid;
  gap: 8px;
}
.check-label {
  display: flex;
  padding: 6px;
}
textarea {
  width: 100%;
  padding: 10px;
  min-width: 0;
}
</style>
