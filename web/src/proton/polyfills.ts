// Loaded FIRST (before any SDK module) so Buffer/global/process exist when vendored
// code evaluates (e.g. the drive-sdk's internal/download/seekableStream.ts uses `Buffer`).
import { Buffer } from 'buffer';

const g = globalThis as Record<string, unknown>;
g.global ||= globalThis;
g.Buffer ||= Buffer;
g.process ||= { env: {}, browser: true, nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };
