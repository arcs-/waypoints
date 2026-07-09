// A node's name is a Result<string> in the SDK, but older/degraded nodes expose a plain
// string. Returns '' when the name can't be read — callers pick their own fallback.
export function nodeName(node: unknown): string {
  const n = (node as { name?: { ok?: boolean; value?: string } | string }).name;
  if (typeof n === 'string') return n;
  return n?.ok ? (n.value ?? '') : '';
}
