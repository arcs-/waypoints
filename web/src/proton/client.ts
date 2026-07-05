// Browser SDK wiring — mirrors the CLI's init.ts (in-thread crypto). Proven in browser-spike.
import { CryptoProxy } from '@protontech/crypto';
import { Api as CryptoApi } from '@protontech/crypto/proxy/endpoint/api.ts';
import { MemoryCache, OpenPGPCryptoWithCryptoProxy, ProtonDriveClient } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';
import { ApiClient, initAccount } from 'proton-drive-sdk-account';

import { DriveAccountAdapter, HTTPClient } from './adapters';
import { BrowserCredentials } from './credentials';
import { makeLogger } from './logger';

const BASE_URL = 'drive-api.proton.me';
// x-pm-appversion identity. Format: platform-product[-app]@version, each part dash-free.
// 'external-drive' is Proton's namespace for third-party SDK apps (matches AUTH_CLIENT_ID);
// the last segment names THIS app (Waypoints → waypoints, no spaces/dashes).
const APP_VERSION = 'external-drive-waypoints@0.1.4'; // keep in sync with tauri.conf.json + release tag
const AUTH_CLIENT_ID = 'external-drive';

function initCrypto() {
  CryptoApi.init({});
  CryptoProxy.setEndpoint(new CryptoApi(), (e) => e.clearKeyStore());
  return new OpenPGPCryptoWithCryptoProxy(CryptoProxy);
}

function clientUid(): string {
  let id = localStorage.getItem('trips.clientUid');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('trips.clientUid', id); }
  return id;
}

export type Proton = Awaited<ReturnType<typeof initProton>>;

export async function initProton() {
  const logger = makeLogger();
  const credentials = new BrowserCredentials();
  await credentials.load();

  const openPGPCryptoModule = initCrypto();
  // Note: x-pm-drive-sdk-version is set by the SDK itself (`js@<VERSION>`), so we don't.
  const apiClient = new ApiClient({
    baseUrl: BASE_URL, appVersion: APP_VERSION, credentials, logger,
  });
  const { auth, addresses, srp } = await initAccount({
    authClientId: AUTH_CLIENT_ID, apiClient, credentials, cryptoProxy: CryptoProxy, logger,
  });

  const deps: ConstructorParameters<typeof ProtonDriveClient>[0] = {
    config: { baseUrl: BASE_URL, clientUid: clientUid() },
    httpClient: new HTTPClient(apiClient),
    entitiesCache: new MemoryCache(),
    cryptoCache: new MemoryCache(),
    account: new DriveAccountAdapter(addresses),
    openPGPCryptoModule,
    srpModule: srp,
  };

  const photos = new ProtonDrivePhotosClient(deps);
  const drive = new ProtonDriveClient(deps); // regular My Files — for the /trips-index/ store

  return { auth, photos, drive, credentials };
}
