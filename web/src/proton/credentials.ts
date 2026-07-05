import type { SessionCredentials, SessionInfo } from 'proton-drive-sdk-account';
import { credentialStore } from '@/lib/host';

// SessionCredentials persisted across restarts. The stored blob contains the session tokens
// AND the userKeyPassword, so where it lives is the host's call (localStorage in a browser,
// macOS Keychain on desktop — see credentialStore in lib/host.ts).
const KEY = 'trips.proton.session';

type Stored = { session?: SessionInfo; userKeyPassword?: string };

const store = credentialStore(KEY);

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
      const raw = await store.read();
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
