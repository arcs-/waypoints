<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { LOGO_OUTLINE, LOGO_PATH, LOGO_TRANSFORM, LOGO_VIEWBOX } from '@/lib/logo';

const STROKE = 4; // ghost + trace share the same weight

const props = defineProps<{ progress: number; total: number; label?: string }>();

// Traces the mark's single outer contour in proportion to real progress, with a dot
// following the line. One continuous subpath → no jumping, completes exactly at 100%.
const pathEl = ref<SVGPathElement | null>(null);
const ghostEl = ref<SVGPathElement | null>(null);
const len = ref(1);
const dot = ref({ x: 0, y: 0 });
const dotReady = ref(false); // don't render the dot until it's positioned (avoids a fly-in from 0,0)
const viewBox = ref(LOGO_VIEWBOX);

const pct = computed(() => (props.total ? Math.min(1, props.progress / props.total) : 0));
const indeterminate = computed(() => !props.total);

function update() {
  const p = pathEl.value;
  if (!p) return;
  const at = indeterminate.value ? 0.06 : pct.value;
  const pt = p.getPointAtLength(len.value * at);
  dot.value = { x: pt.x, y: pt.y };
}

onMounted(() => {
  if (pathEl.value) len.value = pathEl.value.getTotalLength();
  // Crop the viewBox tightly to the mark so there's no whitespace pushing the label away.
  if (ghostEl.value) {
    const bb = ghostEl.value.getBBox();
    const pad = STROKE;
    viewBox.value = `${bb.x - 268.97 - pad} ${bb.y - 497.43 - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`;
  }
  update();
  dotReady.value = true;
});
watch(pct, update);
</script>

<template>
  <div
    class="flex flex-col items-center gap-12 px-6 text-center select-none"
    role="status"
    aria-live="polite"
  >
    <svg
      :viewBox="viewBox"
      class="h-auto w-[min(38vw,150px)] overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      <g
        :transform="LOGO_TRANSFORM"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- ghost: full mark as a same-weight faint line -->
        <path
          ref="ghostEl"
          :d="LOGO_PATH"
          stroke="currentColor"
          class="
            text-neutral-200
            dark:text-neutral-700
          "
          :stroke-width="STROKE"
        />
        <!-- traced outer contour -->
        <path
          ref="pathEl"
          :d="LOGO_OUTLINE"
          stroke="var(--color-accent)"
          :stroke-width="STROKE"
          :stroke-dasharray="len"
          :style="{ strokeDashoffset: indeterminate ? undefined : len * (1 - pct), transition: 'stroke-dashoffset .3s linear' }"
          :class="indeterminate ? 'trace-indeterminate' : ''"
        />
        <!-- following dot — only meaningful when tracking real progress (the metadata step) -->
        <g
          v-if="!indeterminate && dotReady"
          :style="{ transform: `translate(${dot.x}px, ${dot.y}px)`, transition: 'transform .3s linear' }"
        >
          <circle
            r="7"
            fill="var(--color-accent)"
            stroke="#111"
            stroke-width="1.5"
          >
            <animate
              attributeName="r"
              values="7;10;7"
              dur="1.1s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </g>
    </svg>

    <div
      v-if="label || total"
      class="text-sm text-neutral-500"
    >
      {{ label }}<span
        v-if="total"
        class="tabular-nums"
      > · {{ progress }} / {{ total }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Before the photo count is known, sweep the trace along the contour. */
.trace-indeterminate {
  stroke-dashoffset: 0;
  animation: trace 1.8s ease-in-out infinite alternate;
}
@keyframes trace {
  from { stroke-dashoffset: v-bind(len); }
  to { stroke-dashoffset: 0; }
}
</style>
