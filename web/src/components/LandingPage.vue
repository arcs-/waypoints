<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProton } from '@/composables/useProton';
import { APP_NAME } from '@/lib/app';
import AppLogo from '@/components/common/AppLogo.vue';
import IconArrowRight from '@/components/icons/IconArrowRight.vue';

const { t } = useI18n();
const { busy, error, login } = useProton();

// Each feature is a "stop" on the trail illustration to the right.
const features = computed(() => [
  { title: t('landing.features.mapTitle'), body: t('landing.features.mapBody') },
  { title: t('landing.features.routeTitle'), body: t('landing.features.routeBody') },
  { title: t('landing.features.encryptedTitle'), body: t('landing.features.encryptedBody') },
  { title: t('landing.features.liveTitle'), body: t('landing.features.liveBody') },
]);

// Node positions (% of the trail box) — a wandering trail, deliberately not a straight line.
// Kept in a narrow left band; the curve only ever bulges LEFT so it never crosses the labels.
const points = [
  { x: 26, y: 9 },
  { x: 32, y: 37 },
  { x: 22, y: 64 },
  { x: 30, y: 91 },
];
// Control points stay at or left of the nodes, so the dashed route hugs the left side.
const pathD = 'M26 9 C 18 18, 10 27, 32 37 C 28 46, 6 55, 22 64 C 16 73, 8 83, 30 91';
</script>

<template>
  <div
    class="
      mx-auto grid min-h-dvh max-w-7xl grid-cols-1 px-8
      md:grid-cols-2
    "
  >
    <!-- Left: pitch + CTA -->
    <div
      class="
        flex flex-col justify-center gap-10 py-16
        lg:gap-12 lg:pr-14
      "
    >
      <AppLogo class="size-9 text-accent" />

      <div class="flex flex-col gap-4">
        <h1
          class="
            text-4xl tracking-tight
            sm:text-5xl
            lg:text-6xl
          "
        >
          {{ APP_NAME }}
        </h1>
        <p
          class="
            max-w-md text-lg/relaxed text-neutral-500
            dark:text-neutral-400
          "
        >
          {{ t('landing.description') }}
        </p>
      </div>

      <div class="flex flex-col gap-4">
        <button
          :disabled="busy"
          class="
            group inline-flex w-fit items-center gap-2.5 rounded-sm bg-accent
            px-6 py-3 text-base font-bold text-black transition
            hover:bg-accent/90
            disabled:opacity-40
          "
          @click="login"
        >
          {{ busy ? t('landing.signingIn') : t('landing.signIn') }}
          <IconArrowRight
            class="
              size-4 transition-transform
              group-hover:translate-x-0.5
            "
          />
        </button>
        <p
          class="
            text-xs text-neutral-400
            dark:text-neutral-500
          "
        >
          {{ t('landing.privacy') }}
        </p>
        <p
          v-if="error"
          class="text-sm text-red-600"
        >
          {{ error }}
        </p>
      </div>
    </div>

    <!-- Right: the features as stops along a winding trail (hidden on small screens) -->
    <div
      class="
        hidden overflow-hidden bg-neutral-100
        md:flex md:items-center
        dark:bg-neutral-900/50
      "
    >
      <div class="relative h-104 w-full">
        <svg
          class="absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path
            :d="pathD"
            stroke="#ffd168"
            stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray="7 6"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <template
          v-for="(f, i) in features"
          :key="f.title"
        >
          <span
            class="
              absolute z-10 flex size-8 -translate-1/2 items-center
              justify-center rounded-full bg-accent text-sm font-bold text-black
              ring-4 ring-neutral-100
              dark:ring-neutral-900
            "
            :style="{ left: `${points[i]!.x}%`, top: `${points[i]!.y}%` }"
            aria-hidden="true"
          >{{ i + 1 }}</span>
          <div
            class="absolute -translate-y-1/2"
            :style="{
              left: `calc(${points[i]!.x}% + 3rem)`,
              top: `${points[i]!.y}%`,
              maxWidth: `calc(${100 - points[i]!.x}% - 4rem)`,
            }"
          >
            <div class="text-sm font-bold">
              {{ f.title }}
            </div>
            <div
              class="
                mt-0.5 text-xs/relaxed text-neutral-500
                dark:text-neutral-400
              "
            >
              {{ f.body }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
