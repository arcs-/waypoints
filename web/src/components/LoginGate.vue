<script setup lang="ts">
import { useProton } from '@/composables/useProton';
import Logo from './Logo.vue';
const { busy, error, login } = useProton();
</script>

<template>
  <div class="flex flex-col justify-center items-center min-h-[100dvh] text-center gap-12 p-8">
    <Logo class="w-12 h-12 text-accent" />
    <div class="text-2xl font-bold tracking-tight">Memory Lane</div>
    <button
      :disabled="busy" @click="login"
      class="border-[1.5px] border-current rounded px-4 py-2 hover:bg-accent hover:border-accent hover:text-black disabled:opacity-40 transition-colors"
    >{{ busy ? 'Waiting for sign-in…' : 'Sign in with Proton' }}</button>
    <p v-if="error" class="text-red-600">{{ error }}</p>
  </div>
</template>
