<script setup lang="ts">
import type { BlockStyle } from "../types";
const props = defineProps<{ modelValue?: BlockStyle }>();
const emit = defineEmits<{ "update:modelValue": [value: BlockStyle] }>();
function set(key: keyof BlockStyle, value: string | number) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
</script>
<template>
  <details class="block-style-editor">
    <summary>Custom style</summary>
    <label
      v-for="item in [
        { key: 'background', label: 'Card background', value: '#ffffff' },
        { key: 'color', label: 'Card text color', value: '#354238' },
        { key: 'borderColor', label: 'Card border color', value: '#dce1d7' },
      ]"
      :key="item.key"
    >
      {{ item.label
      }}<input
        type="color"
        :aria-label="item.label"
        :value="
          modelValue?.[item.key as 'background' | 'color' | 'borderColor'] ??
          item.value
        "
        @input="
          set(
            item.key as keyof BlockStyle,
            ($event.target as HTMLInputElement).value,
          )
        "
      />
    </label>
    <label
      >Text size<input
        type="number"
        aria-label="Card text size"
        min="12"
        max="28"
        :value="modelValue?.fontSize ?? 14"
        @change="
          set('fontSize', Number(($event.target as HTMLInputElement).value))
        "
    /></label>
    <label
      >Alignment<select
        aria-label="Card text alignment"
        :value="modelValue?.textAlign ?? 'left'"
        @change="set('textAlign', ($event.target as HTMLSelectElement).value)"
      >
        <option>left</option>
        <option>center</option>
        <option>right</option>
      </select></label
    >
    <button
      type="button"
      class="text-button"
      @click="emit('update:modelValue', {})"
    >
      Reset card style
    </button>
  </details>
</template>
<style scoped>
details {
  min-width: 0;
}
label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0;
}
input,
select {
  width: 100px;
  min-height: 44px;
}
</style>
