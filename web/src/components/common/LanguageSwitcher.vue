<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { SUPPORTED, setLocale, type Locale } from '@/i18n';

const { t, locale } = useI18n();

function onChange(e: Event) {
  setLocale((e.target as HTMLSelectElement).value as Locale);
}
</script>

<template>
  <select
    :value="locale"
    :aria-label="t('controls.language')"
    :title="t('controls.language')"
    class="
      cursor-pointer border-0 bg-transparent p-1 text-xs font-bold
      text-neutral-500 uppercase transition-colors
      hover:text-accent
    "
    @change="onChange"
  >
    <option
      v-for="l in SUPPORTED"
      :key="l"
      :value="l"
    >
      {{ l.toUpperCase() }}
    </option>
  </select>
</template>
