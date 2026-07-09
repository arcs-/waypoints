import { ref, type Ref } from 'vue';

// A right-hand column resized by dragging its left edge: pointer drag, arrow keys when the
// divider is focused, double-click (reset) handled by the caller via reset(). Width is a
// percent of the container, clamped so neither pane collapses; null means "no override" —
// the caller's responsive defaults apply. Deliberately not persisted.
export function useResizableColumn(
  container: Ref<HTMLElement | null>,
  opts: { min: number; max: number; fallback: number }, // fallback: keyboard baseline when no override is set
) {
  const width = ref<number | null>(null);

  function clamp(v: number): number | null {
    return Number.isFinite(v) && v > 0 ? Math.min(opts.max, Math.max(opts.min, v)) : null;
  }

  let dragging = false;
  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none'; // no text selection while dragging across content
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging || !container.value) return;
    const r = container.value.getBoundingClientRect();
    // ?? min: dragging past the right edge yields ≤0, which clamp treats as "no value".
    width.value = clamp(((r.right - e.clientX) / r.width) * 100) ?? opts.min;
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
  }
  function onKey(e: KeyboardEvent) {
    const base = width.value ?? opts.fallback;
    if (e.key === 'ArrowLeft') width.value = clamp(base + 2); // divider left = column grows
    else if (e.key === 'ArrowRight') width.value = clamp(base - 2);
    else return;
    e.preventDefault();
  }
  function reset() {
    width.value = null;
  }

  return { width, onPointerDown, onPointerMove, onPointerUp, onKey, reset };
}
