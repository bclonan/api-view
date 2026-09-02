<script setup lang="ts">
import {
  Landmark,
  CloudSun,
  Activity,
  BookOpen,
  Pill,
  Globe,
  MapPin,
  Orbit,
  Users,
  Code,
  CircleDot,
  Image,
} from "lucide-vue-next";
defineProps<{ name?: string; size?: number }>();
const icons: Record<string, unknown> = {
  landmark: Landmark,
  "cloud-sun": CloudSun,
  activity: Activity,
  "book-open": BookOpen,
  pill: Pill,
  globe: Globe,
  "map-pin": MapPin,
  orbit: Orbit,
  users: Users,
  code: Code,
  "circle-dot": CircleDot,
  image: Image,
};
</script>
<template>
  <component
    :is="icons[name ?? 'globe'] || Globe"
    :size="size ?? 19"
    :stroke-width="1.6"
  />
</template>
