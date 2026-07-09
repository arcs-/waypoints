import { ref, shallowRef } from 'vue';
import { initProton, type Proton } from './client';
import { openExternal } from '@/shared/host';

// Singleton Proton session shared across the app.
const proton = shallowRef<Proton | null>(null);
const loggedIn = ref(false);
const initializing = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

let initPromise: Promise<void> | null = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        proton.value = await initProton();
        loggedIn.value = proton.value.credentials.isLoggedIn();
      } catch (e) {
        error.value = (e as Error).message;
      } finally {
        initializing.value = false;
      }
    })();
  }
  return initPromise;
}

export function useProton() {
  ensureInit();

  async function login() {
    if (!proton.value) return;
    busy.value = true; error.value = null;
    try {
      await proton.value.auth.authViaWeb(async (signInUrl: string) => {
        // Proton's sign-in opens outside the app (system browser on desktop, popup in a
        // browser). The SDK polls the fork by selector, so login completing in an external
        // window still resolves here.
        await openExternal(signInUrl, 'width=520,height=720');
      });
      loggedIn.value = true;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }

  async function logout() {
    await proton.value?.credentials.signOut();
    loggedIn.value = false;
  }

  return { proton, loggedIn, initializing, busy, error, login, logout };
}
