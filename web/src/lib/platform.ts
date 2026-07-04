// True when running inside the Tauri desktop shell (vs a normal browser). Constant at runtime.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
