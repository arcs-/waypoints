import { ref, shallowRef } from 'vue';
import { initProton, type Proton } from '@/proton/client';

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
      await proton.value.auth.authViaWeb((signInUrl: string) => {
        window.open(signInUrl, '_blank', 'width=520,height=720');
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
