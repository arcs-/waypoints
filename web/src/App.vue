<script setup lang="ts">
import { useProton } from '@/composables/useProton';
import LandingPage from '@/components/LandingPage.vue';
import LoadingRoute from '@/components/common/LoadingRoute.vue';
import UpdateHint from '@/components/common/UpdateHint.vue';

// Auth gate lives in the shell; the router (RouterView) drives the signed-in app.
const { loggedIn, initializing } = useProton();
</script>

<template>
  <main>
    <LoadingRoute
      v-if="initializing"
      class="min-h-dvh justify-center"
      :progress="0"
      :total="0"
    />
    <LandingPage v-else-if="!loggedIn" />
    <RouterView v-else />
    <UpdateHint />
  </main>
</template>
