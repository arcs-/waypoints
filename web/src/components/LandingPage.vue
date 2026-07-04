<script setup lang="ts">
import { useProton } from '@/composables/useProton';
import { APP_NAME } from '@/lib/app';
import AppLogo from '@/components/common/AppLogo.vue';
import IconCheck from '@/components/icons/IconCheck.vue';

const { busy, error, login } = useProton();

const features = [
  { title: 'Placed on the map', body: 'Every geotagged photo pinned to where you took it.' },
  { title: 'Day-by-day route', body: 'Stops clustered by location and drawn as a journey.' },
  { title: 'End-to-end encrypted', body: 'Albums are decrypted in your browser. Nothing is uploaded.' },
  { title: 'Live Photos & video', body: 'Full-resolution originals, motion clips, and HEIC — all supported.' },
];
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
      class="flex flex-col justify-center gap-7 py-16"
    >
      <div class="flex items-center gap-3">
        <AppLogo class="size-9 text-accent" />
      </div>

      <div class="flex flex-col gap-4">
        <h1
          class="
            mb-2 text-4xl tracking-tight
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
          Turn your Proton Photos albums into a map-based story of your travels,
          a timeline of every stop, plotted on a map, built and decrypted right
          here in your browser.
        </p>
      </div>

      <ul class="m-0 flex max-w-md list-none flex-col gap-3 p-0">
        <li
          v-for="f in features"
          :key="f.title"
          class="flex items-start gap-3"
        >
          <IconCheck class="mt-0.5 size-4 shrink-0 text-accent" />
          <span class="text-sm/relaxed">
            <span class="font-bold">{{ f.title }}. </span>
            <span
              class="
                text-neutral-500
                dark:text-neutral-400
              "
            > {{ f.body }}</span>
          </span>
        </li>
      </ul>

      <div class="flex flex-col gap-3">
        <button
          :disabled="busy"
          class="
            my-10 w-fit rounded-sm border-[1.5px] border-accent px-5 py-2.5
            font-bold transition-colors
            hover:border-accent hover:bg-accent hover:text-black
            disabled:opacity-40
          "
          @click="login"
        >
          {{ busy ? 'Waiting for sign-in…' : 'Sign in with Proton' }}
        </button>
        <p
          class="
            text-xs text-neutral-400
            dark:text-neutral-500
          "
        >
          Your photos stay in Proton, this app only reads them to build the map.
        </p>
        <p
          v-if="error"
          class="text-sm text-red-600"
        >
          {{ error }}
        </p>
      </div>
    </div>

    <!-- Right: a little map preview (hidden on small screens) -->
    <div
      class="
        hidden items-center justify-center bg-neutral-100 p-12
        md:flex
        dark:bg-neutral-900/50
      "
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 400 400"
        class="w-full max-w-md"
        fill="none"
      >
        <!-- map frame -->
        <rect
          x="8"
          y="8"
          width="384"
          height="384"
          rx="22"
          fill="#a3a3a3"
          fill-opacity="0.08"
          stroke="#a3a3a3"
          stroke-opacity="0.35"
        />
        <!-- faint roads / grid -->
        <g
          stroke="#a3a3a3"
          stroke-opacity="0.4"
          stroke-width="2"
        >
          <path d="M8 150 C 120 140, 150 120, 260 96 S 360 70, 392 60" />
          <path d="M70 392 C 90 300, 150 280, 180 200 S 250 120, 300 8" />
          <path d="M8 300 H 392" stroke-dasharray="2 10" />
          <path d="M150 8 V 392" stroke-dasharray="2 10" />
        </g>
        <!-- water region -->
        <path
          d="M8 250 C 90 240, 130 300, 200 300 S 340 250, 392 280 L 392 392 L 8 392 Z"
          fill="#a3a3a3"
          fill-opacity="0.14"
        />
        <!-- the route -->
        <path
          d="M70 320 C 120 250, 150 250, 180 190 S 250 120, 300 90"
          stroke="#ffd168"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-dasharray="1 11"
        />
        <!-- stops -->
        <g font-family="ui-monospace, monospace" font-size="15" font-weight="700">
          <g>
            <circle
              cx="70"
              cy="320"
              r="16"
              fill="#ffd168"
              stroke="#111"
              stroke-width="2.5"
            />
            <text
              x="70"
              y="325"
              text-anchor="middle"
              fill="#111"
            >1</text>
          </g>
          <g>
            <circle
              cx="180"
              cy="190"
              r="16"
              fill="#ffd168"
              stroke="#111"
              stroke-width="2.5"
            />
            <text
              x="180"
              y="195"
              text-anchor="middle"
              fill="#111"
            >2</text>
          </g>
          <g>
            <circle
              cx="300"
              cy="90"
              r="19"
              fill="#ffd168"
              stroke="#111"
              stroke-width="2.5"
            />
            <text
              x="300"
              y="96"
              text-anchor="middle"
              fill="#111"
            >3</text>
          </g>
        </g>
        <!-- compass -->
        <g
          stroke="#a3a3a3"
          stroke-opacity="0.7"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle
            cx="356"
            cy="356"
            r="14"
            fill="none"
          />
          <path
            d="M356 347 L356 365"
            stroke="#ffd168"
          />
        </g>
      </svg>
    </div>
  </div>
</template>
