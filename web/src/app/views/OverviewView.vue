<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AlbumCard from '@/domain/album/AlbumCard.vue';
import AppLogo from '@/shared/ui/AppLogo.vue';
import AppControls from '@/shared/ui/AppControls.vue';
import AppFooter from '@/shared/ui/AppFooter.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import LoadingRoute from '@/shared/ui/LoadingRoute.vue';
import IconExternalLink from '@/shared/ui/icons/IconExternalLink.vue';
import IconSignOut from '@/shared/ui/icons/IconSignOut.vue';
import { hasInAppFooter } from '@/shared/host';
import { useAlbums } from '@/domain/album/useAlbums';
import { useProton } from '@/domain/proton/useProton';
import { PROTON_PHOTOS_URL } from '@/domain/proton/link';
import { APP_NAME } from '@/shared/lib/app';

const { t } = useI18n();
const { albums, loading, error } = useAlbums();
const { logout } = useProton();

onMounted(() => (document.title = APP_NAME));

// Album search: plain case-insensitive name filter.
const query = ref('');
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? albums.value.filter((a) => a.name.toLowerCase().includes(q)) : albums.value;
});

// Group by year of the first-image date (already sorted newest-first).
const groups = computed(() => {
  const map = new Map<string, typeof albums.value>();
  for (const a of filtered.value) {
    const t = a.date ?? a.lastActivityTime;
    const year = t ? String(new Date(t).getFullYear()) : '—';
    (map.get(year) ?? map.set(year, []).get(year)!).push(a);
  }
  return [...map.entries()];
});
</script>

<template>
  <div
    class="
      mx-auto max-w-7xl px-5 pt-16 pb-24
      sm:px-16 sm:pt-24 sm:pb-40
    "
  >
    <!-- title left, control group right — same row -->
    <header class="mb-12 flex items-center justify-between gap-4">
      <h1
        class="
          flex items-center gap-6 text-3xl tracking-tight
          sm:gap-8 sm:text-5xl
        "
      >
        <AppLogo
          class="
            size-8 text-accent
            sm:size-14
          "
        />
        {{ APP_NAME }}
      </h1>
      <AppControls :label="t('controls.appControls')">
        <a
          :href="PROTON_PHOTOS_URL"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('controls.openProton')"
          :title="t('controls.openInProton')"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
        >
          <IconExternalLink class="size-5" />
        </a>
        <button
          :aria-label="t('controls.signOut')"
          :title="t('controls.signOut')"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
          @click="logout"
        >
          <IconSignOut class="size-5" />
        </button>
      </AppControls>
    </header>

    <p
      v-if="error"
      class="text-neutral-500"
    >
      {{ error }}
    </p>
    <LoadingRoute
      v-else-if="loading && !albums.length"
      class="min-h-[45vh] justify-center"
      :progress="0"
      :total="0"
    />

    <!-- Fresh account: no albums in Proton Photos yet — point the user there. -->
    <EmptyState
      v-else-if="!albums.length"
      class="min-h-[45vh]"
      :title="t('overview.emptyTitle')"
      :body="t('overview.emptyBody')"
      :cta-href="PROTON_PHOTOS_URL"
      :cta-label="t('overview.emptyCta')"
    />

    <div v-else>
      <input
        v-model="query"
        type="search"
        :placeholder="t('overview.search')"
        :aria-label="t('overview.search')"
        class="
          mb-10 w-44 border-b border-transparent bg-transparent py-1 text-sm
          outline-none
          placeholder:text-neutral-400
          hover:border-neutral-200
          focus:border-neutral-300
          sm:mb-16
          dark:placeholder:text-neutral-600
          dark:hover:border-neutral-800
          dark:focus:border-neutral-700
        "
      >
      <p
        v-if="!groups.length"
        class="text-neutral-500"
      >
        {{ t('overview.noResults', { q: query.trim() }) }}
      </p>
      <div
        class="
          space-y-14
          sm:space-y-28
        "
      >
        <section
          v-for="[year, list] in groups"
          :key="year"
        >
          <h2
            class="
              mb-6 text-sm font-medium tracking-widest text-neutral-500
              sm:mb-10
            "
          >
            {{ year }}
          </h2>
          <ul
            class="
              m-0 grid list-none grid-cols-1 gap-7 p-0
              sm:grid-cols-2 sm:gap-12
              lg:gap-16
            "
          >
            <li
              v-for="a in list"
              :key="a.uid"
            >
              <AlbumCard :album="a" />
            </li>
          </ul>
        </section>
      </div>
    </div>

    <AppFooter
      v-if="hasInAppFooter"
      class="
        mt-16
        sm:mt-24
      "
    />
  </div>
</template>
