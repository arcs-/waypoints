<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { hasUpdateCheck, checkForUpdate, onUpdateCheckRequested, openExternal, prefGet, prefSet } from '@/lib/host';
import type { UpdateInfo } from '@/lib/host';

// Desktop update hint: checks GitHub's latest release once a day on startup (quiet unless
// there is something to say) and on demand from the native "Check for Updates…" menu item
// (which always answers — update, up to date, or failed). Renders nothing in a browser.
const { t } = useI18n();

const state = ref<UpdateInfo | 'upToDate' | 'failed' | null>(null);
const update = computed(() => (state.value && typeof state.value === 'object' ? state.value : null));
let quietTimer: ReturnType<typeof setTimeout> | undefined;

const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

async function run(manual: boolean) {
  try {
    const found = await checkForUpdate();
    void prefSet('update.lastCheck', String(Date.now()));
    if (found) {
      // A startup hint respects an earlier "ignore" of the same version; the menu never does.
      if (!manual && (await prefGet('update.ignoredVersion')) === found.version) return;
      clearTimeout(quietTimer);
      state.value = found;
    } else if (manual) {
      quiet('upToDate');
    }
  } catch {
    if (manual) quiet('failed');
  }
}

// Transient answers ("up to date" / "failed") dismiss themselves.
function quiet(s: 'upToDate' | 'failed') {
  state.value = s;
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => { if (state.value === s) state.value = null; }, 6000);
}

function ignore() {
  if (update.value) void prefSet('update.ignoredVersion', update.value.version);
  state.value = null;
}

async function download() {
  if (!update.value) return;
  await openExternal(update.value.url);
  state.value = null;
}

onMounted(() => {
  if (!hasUpdateCheck) return;
  onUpdateCheckRequested(() => void run(true));
  void prefGet('update.lastCheck').then((last) => {
    if (Date.now() - (Number(last) || 0) >= CHECK_EVERY_MS) void run(false);
  });
});
</script>

<template>
  <div
    v-if="state"
    role="status"
    class="
      fixed right-4 bottom-4 z-50 flex items-center gap-4 border
      border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-lg
      dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300
    "
  >
    <template v-if="update">
      <p>{{ t('update.available', { v: update.version }) }}</p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="
            bg-accent px-3 py-1 font-medium text-neutral-900 transition
            hover:brightness-95
          "
          @click="download"
        >
          {{ t('update.download') }}
        </button>
        <button
          type="button"
          class="
            text-neutral-500 transition-colors
            hover:text-accent
          "
          @click="ignore"
        >
          {{ t('update.ignore') }}
        </button>
      </div>
    </template>
    <template v-else>
      <p>{{ state === 'upToDate' ? t('update.upToDate') : t('update.checkFailed') }}</p>
      <button
        type="button"
        class="
          text-neutral-500 transition-colors
          hover:text-accent
        "
        @click="state = null"
      >
        {{ t('update.dismiss') }}
      </button>
    </template>
  </div>
</template>
