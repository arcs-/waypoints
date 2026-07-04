import type { SessionCredentials, SessionInfo } from 'proton-drive-sdk-account';
import { isTauri } from '@/lib/platform';

// SessionCredentials persisted across restarts. The stored blob contains the session tokens
// AND the userKeyPassword, so where it lives matters:
//   - browser: localStorage (personal machine only — plaintext, same as before)
//   - desktop: macOS Keychain via the keychain_* Tauri commands (never plaintext on disk)
const KEY = 'trips.proton.session';

type Stored = { session?: SessionInfo; userKeyPassword?: string };

interface BlobStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

const localStore: BlobStore = {
  async read() { return localStorage.getItem(KEY); },
  async write(value) { localStorage.setItem(KEY, value); },
  async clear() { localStorage.removeItem(KEY); },
};

const keychainStore: BlobStore = {
  async read() {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string | null>('keychain_get');
  },
  async write(value) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('keychain_set', { value });
  },
  async clear() {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('keychain_delete');
  },
};

const store = isTauri ? keychainStore : localStore;

export class BrowserCredentials implements SessionCredentials {
  private data: Stored = {};
  private listeners: Array<() => void> = [];

  get uid() { return this.data.session?.uid; }
  get accessToken() { return this.data.session?.accessToken; }
  get refreshToken() { return this.data.session?.refreshToken; }

  on(_event: 'sessionInfoChanged', cb: () => void) { this.listeners.push(cb); }
  private emit() { this.listeners.forEach((cb) => cb()); }

  isLoggedIn() { return !!this.data.session?.uid && !!this.data.session?.accessToken; }
  getUserKeyPassword() { return this.data.userKeyPassword; }

  async load() {
    try {
      let raw = await store.read();
      // One-time migration: earlier desktop builds kept the session in localStorage — move it
      // into the keychain and scrub the plaintext copy.
      if (!raw && isTauri) {
        const legacy = localStorage.getItem(KEY);
        if (legacy) {
          raw = legacy;
          await store.write(legacy);
          localStorage.removeItem(KEY);
        }
      }
      if (raw) this.data = JSON.parse(raw);
    } catch { /* ignore — treated as signed out */ }
  }

  // Persistence failing (e.g. keychain denied) shouldn't break the live session — it only
  // means the next launch asks to sign in again.
  private async persist() {
    try { await store.write(JSON.stringify(this.data)); }
    catch (e) { console.warn('session persist failed', e); }
  }

  async setUserKeyPassword(userKeyPassword: string) {
    this.data.userKeyPassword = userKeyPassword;
    await this.persist();
  }

  async setSessionInfo(info: SessionInfo) {
    this.data.session = info;
    await this.persist();
    this.emit();
  }

  async signOut() {
    this.data = {};
    try { await store.clear(); } catch { /* ignore */ }
    this.emit();
  }
}
