// Tiny counting semaphore: at most `max` callers inside `run` at once, FIFO beyond that.
// Used to bound concurrency against Proton (downloads, thumbnail decrypts) — be a good
// citizen re: rate limits.
export function semaphore(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < max) { active++; return Promise.resolve(); }
    return new Promise((r) => queue.push(() => { active++; r(); }));
  };
  const release = () => { active--; queue.shift()?.(); };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try { return await fn(); } finally { release(); }
    },
  };
}
