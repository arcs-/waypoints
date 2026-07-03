<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useProton } from '@/composables/useProton';
import { useAlbums } from '@/composables/useAlbums';
import LoginGate from '@/components/LoginGate.vue';
import LoadingRoute from '@/components/LoadingRoute.vue';
import OverviewView from '@/views/OverviewView.vue';
import AlbumView from '@/views/AlbumView.vue';

const { loggedIn, initializing } = useProton();
const { albums, bySlug } = useAlbums();

// Tiny hash router: '' → overview, '#/album/<slug>' → album.
const hash = ref(location.hash);
const onHash = () => (hash.value = location.hash);
onMounted(() => window.addEventListener('hashchange', onHash));
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash));
const albumSlug = computed(() => hash.value.match(/^#\/album\/(.+)$/)?.[1] ?? null);

// Tab title: album name when viewing one, else the app.
const BASE = 'Memory Lane';
watch([albumSlug, albums], () => {
  const a = albumSlug.value ? bySlug(albumSlug.value) : null;
  document.title = a ? `${a.name} · ${BASE}` : BASE;
}, { immediate: true });
</script>

<template>
  <main>
    <LoadingRoute v-if="initializing" class="min-h-[100dvh] justify-center" :progress="0" :total="0" />
    <LoginGate v-else-if="!loggedIn" />
    <AlbumView v-else-if="albumSlug" :key="albumSlug" :slug="albumSlug" />
    <OverviewView v-else />
  </main>
</template>
