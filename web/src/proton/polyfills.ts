// Loaded FIRST (before any SDK module) so Buffer/global/process exist when vendored
// code evaluates (e.g. authWeb.ts does `Buffer.from(...)` at module top-level).
import { Buffer } from 'buffer';

const g = globalThis as Record<string, unknown>;
g.global ||= globalThis;
g.Buffer ||= Buffer;
g.process ||= { env: {}, browser: true, nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };
