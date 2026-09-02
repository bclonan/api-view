<script setup lang="ts">
import { reactive, ref } from "vue";
import type { Operation, Row } from "../types";
import { validateArguments } from "../runtime/invoke";
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
    <label v-for="(field, key) in operation.inputs" :key="key"
      ><span
        >{{ field.label }} <small v-if="field.required">Required</small></span
      ><input
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
