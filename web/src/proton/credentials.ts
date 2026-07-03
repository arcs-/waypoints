import type { SessionCredentials, SessionInfo } from 'proton-drive-sdk-account';

// Browser SessionCredentials — localStorage-backed so a refresh keeps you logged in.
// NOTE: this stores the session + userKeyPassword in localStorage (personal machine only).
const KEY = 'trips.proton.session';

type Stored = { session?: SessionInfo; userKeyPassword?: string };

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
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  private persist() { localStorage.setItem(KEY, JSON.stringify(this.data)); }

  async setUserKeyPassword(userKeyPassword: string) {
    this.data.userKeyPassword = userKeyPassword;
    this.persist();
  }

  async setSessionInfo(info: SessionInfo) {
    this.data.session = info;
    this.persist();
    this.emit();
  }

  async signOut() {
    this.data = {};
    localStorage.removeItem(KEY);
    this.emit();
  }
}
