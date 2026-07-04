<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AlbumCard from '@/components/album/AlbumCard.vue';
import AppLogo from '@/components/common/AppLogo.vue';
import LoadingRoute from '@/components/common/LoadingRoute.vue';
import FullscreenToggle from '@/components/common/FullscreenToggle.vue';
import ThemeToggle from '@/components/common/ThemeToggle.vue';
import IconExternalLink from '@/components/icons/IconExternalLink.vue';
import IconSignOut from '@/components/icons/IconSignOut.vue';
import { useAlbums } from '@/composables/useAlbums';
import { useProton } from '@/composables/useProton';
import { PROTON_PHOTOS_URL } from '@/lib/protonLink';
import { APP_NAME } from '@/lib/app';

const { albums, loading, error } = useAlbums();
const { logout } = useProton();

onMounted(() => (document.title = APP_NAME));

// Group by year of the first-image date (already sorted newest-first).
const groups = computed(() => {
  const map = new Map<string, typeof albums.value>();
  for (const a of albums.value) {
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
      sm:px-16 sm:pt-28 sm:pb-40
    "
  >
    <!-- title left, control group right — same row -->
    <header
      class="
        mb-12 flex items-center justify-between gap-4
        sm:mb-24
        lg:mb-32
      "
    >
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
      <nav
        aria-label="App controls"
        class="
          flex shrink-0 items-center gap-1 rounded-full border
          border-neutral-200 bg-white/70 px-1.5 py-1 backdrop-blur-sm
          dark:border-neutral-800 dark:bg-neutral-900/70
        "
      >
        <FullscreenToggle />
        <ThemeToggle />
        <a
          :href="PROTON_PHOTOS_URL"
          target="_blank"
          rel="noopener"
          aria-label="Open Proton Photos (opens in a new tab)"
          title="Open in Proton"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
        >
          <IconExternalLink class="size-[18px]" />
        </a>
        <button
          aria-label="Sign out"
          title="Sign out"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
          @click="logout"
        >
          <IconSignOut class="size-[18px]" />
        </button>
      </nav>
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

    <div
      v-else
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
            mb-6 text-sm font-bold tracking-widest text-neutral-500 uppercase
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
</template>
