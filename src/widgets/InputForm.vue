<script setup lang="ts">
import { reactive, ref } from "vue";
import type { Operation, Row } from "../types";
import { validateArguments } from "../runtime/invoke";
import { useWorkspace } from "../stores/workspace";
import { readPath } from "../runtime/fields";
const store = useWorkspace(),
  fromEnvelope = ref(""),
  fromPath = ref(""),
  toInput = ref("");
async function fillFromData() {
  try {
    const entry = await store.getEnvelope(fromEnvelope.value),
      value = readPath(entry.response.result.data, fromPath.value);
    if (value == null || typeof value === "object")
      throw new Error("Choose a path to one text or numeric value.");
    if (!Object.hasOwn(props.operation.inputs, toInput.value))
      throw new Error("Choose a request input.");
    values[toInput.value] = value;
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const props = defineProps<{
  operation: Operation;
  apiId: string;
  initial?: Row;
  submitLabel?: string;
  allowPending?: boolean;
}>();
const emit = defineEmits<{ submit: [args: Row] }>();
const values = reactive<Row>(
  Object.fromEntries(
    Object.entries(props.operation.inputs).map(([key, input]) => [
      key,
      props.initial?.[key] ?? input.default ?? "",
    ]),
  ),
);
const error = ref("");
function submit() {
  try {
    const args: Row = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value === ""
          ? ""
          : ["number", "integer"].includes(props.operation.inputs[key].type)
            ? Number(value)
            : value,
      ]),
    );
    const result = validateArguments(props.apiId, props.operation.id, args);
    if (result.missing.length && !props.allowPending)
      throw new Error(
        `Complete the required inputs: ${result.missing.map((k) => props.operation.inputs[k].label).join(", ")}`,
      );
    error.value = "";
    emit("submit", args);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>
<template>
  <form class="input-form" @submit.prevent="submit">
    <details
      v-if="store.widgets.some((w) => w.result) || store.dataRequests.length"
    >
      <summary>Fill an input from existing data</summary>
      <label
        >Result<select aria-label="Input source result" v-model="fromEnvelope">
          <option value="">Choose a response</option>
          <option
            v-for="widget in store.widgets.filter((w) => w.result)"
            :key="widget.id"
            :value="widget.result?.id"
          >
            {{ widget.title }}
          </option>
          <option
            v-for="entry in store.dataRequests.filter(
              (e) => e.dashboardId === store.id,
            )"
            :key="entry.requestId"
            :value="entry.response.result.id"
          >
            {{ entry.invocation.apiId }} request
          </option>
        </select></label
      ><label
        >Value path<input
          aria-label="Input value path"
          v-model="fromPath"
          placeholder="[0].latitude" /></label
      ><label
        >Request input<select
          aria-label="Target request input"
          v-model="toInput"
        >
          <option value="">Choose an input</option>
          <option
            v-for="(field, key) in operation.inputs"
            :key="key"
            :value="key"
          >
            {{ field.label }}
          </option>
        </select></label
      ><button type="button" class="button" @click="fillFromData">
        Fill input
      </button>
    </details>
    <label v-for="(field, key) in operation.inputs" :key="key"
      ><span
        >{{ field.label }} <small v-if="field.required">Required</small></span
      ><select v-if="field.enum" v-model="values[key]">
        <option v-for="choice in field.enum" :key="choice" :value="choice">
          {{ choice || "Any" }}
        </option></select
      ><input
        v-else
        v-model="values[key]"
        :type="
          field.type === 'date'
            ? 'date'
            : field.type === 'string'
              ? 'text'
              : 'number'
        "
        :step="field.type === 'integer' ? 1 : 'any'"
        :min="field.minimum"
        :max="field.maximum"
        :placeholder="field.placeholder"
        :required="field.required && !allowPending"
        :maxlength="500"
    /></label>
    <p v-if="!Object.keys(operation.inputs).length" class="muted">
      This operation is ready to run. No inputs needed.
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="button primary" type="submit">
      {{ submitLabel ?? "Add to workspace" }}
    </button>
  </form>
</template>
