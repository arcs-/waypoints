// Loaded FIRST (before any SDK module) so Buffer/global/process exist when vendored
// code evaluates (e.g. authWeb.ts does `Buffer.from(...)` at module top-level).
import { Buffer } from 'buffer';

const g = globalThis as any;
g.global ||= globalThis;
g.Buffer ||= Buffer;
g.process ||= { env: {}, browser: true, nextTick: (fn: (...a: any[]) => void, ...a: any[]) => queueMicrotask(() => fn(...a)) };
