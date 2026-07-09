<script setup lang="ts">
import { useProton } from '@/domain/proton/useProton';
import LandingPage from '@/app/views/LandingPage.vue';
import LoadingRoute from '@/shared/ui/LoadingRoute.vue';
import UpdateHint from '@/shared/ui/UpdateHint.vue';

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
