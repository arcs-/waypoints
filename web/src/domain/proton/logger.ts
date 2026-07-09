import type { Logger } from 'proton-drive-sdk-account';

export function makeLogger(): Logger {
  const noop = () => {};
  return {
    debug: noop, // flip to console.debug for verbose tracing
    info: (...a: unknown[]) => console.info('[proton]', ...a),
    warn: (...a: unknown[]) => console.warn('[proton]', ...a),
    error: (...a: unknown[]) => console.error('[proton]', ...a),
  } as unknown as Logger;
}
