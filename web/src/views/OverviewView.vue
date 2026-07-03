<script setup lang="ts">
import { computed } from 'vue';
import AlbumCard from '@/components/AlbumCard.vue';
import Logo from '@/components/Logo.vue';
import LoadingRoute from '@/components/LoadingRoute.vue';
import { useAlbums } from '@/composables/useAlbums';
import { useProton } from '@/composables/useProton';

const { albums, loading, error } = useAlbums();
const { logout } = useProton();

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
  <!-- logout, top-left on the main screen -->
  <button
    @click="logout" aria-label="Sign out"
    class="fixed top-4 left-4 z-[900] flex items-center gap-1.5 text-sm text-neutral-500 hover:text-accent border-0 p-1 transition-colors"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  </button>

  <div class="mx-auto max-w-6xl px-5 sm:px-16 pt-16 sm:pt-28 pb-24 sm:pb-40">
    <h1 class="flex items-center gap-3 sm:gap-4 text-3xl sm:text-5xl font-bold tracking-tight mb-12 sm:mb-24 lg:mb-32">
      <Logo class="w-8 h-8 sm:w-10 sm:h-10 text-accent" /> Memory Lane
    </h1>

    <p v-if="error" class="text-neutral-500">{{ error }}</p>
    <LoadingRoute v-else-if="loading && !albums.length" class="min-h-[45vh] justify-center" :progress="0" :total="0" />

    <div v-else class="space-y-14 sm:space-y-28">
      <section v-for="[year, list] in groups" :key="year">
        <h2 class="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-6 sm:mb-10">{{ year }}</h2>
        <ul class="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-7 sm:gap-12 lg:gap-16">
          <li v-for="a in list" :key="a.uid"><AlbumCard :album="a" /></li>
        </ul>
      </section>
    </div>
  </div>
</template>
