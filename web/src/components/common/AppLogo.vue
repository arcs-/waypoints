<script setup lang="ts">
import { LOGO_PATH, LOGO_TRANSFORM, LOGO_VIEWBOX } from '@/lib/logo';
</script>

<template>
  <svg
    :viewBox="LOGO_VIEWBOX"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      :d="LOGO_PATH"
      :transform="LOGO_TRANSFORM"
    />
  </svg>
</template>
