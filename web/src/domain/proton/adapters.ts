// Adapters bridging the account SDK's ApiClient/Addresses to the Drive SDK's expected
// httpClient / account interfaces. Ported verbatim from the CLI (cli/src/api/*).
import type { ProtonDriveAccount, ProtonDriveAccountAddress, ProtonDriveHTTPClientBlobRequest, ProtonDriveHTTPClientJsonRequest } from '@protontech/drive-sdk';
import type { ApiClient, Addresses } from 'proton-drive-sdk-account';

export class HTTPClient {
  constructor(private readonly apiClient: ApiClient) {}

  async fetchJson(options: ProtonDriveHTTPClientJsonRequest): Promise<Response> {
    return this.apiClient.authenticatedRequest(options.url, {
      method: options.method,
      ...(options.json !== undefined ? { json: options.json } : {}),
      ...(options.body !== undefined && options.json === undefined ? { body: options.body } : {}),
      headers: options.headers,
      timeout: options.timeoutMs,
      signal: options.signal,
      throwHttpErrors: false,
    });
  }

  async fetchBlob(options: ProtonDriveHTTPClientBlobRequest): Promise<Response> {
    return this.apiClient.authenticatedRequest(options.url, {
      method: options.method,
      body: options.body,
      headers: options.headers,
      timeout: options.timeoutMs,
      signal: options.signal,
      throwHttpErrors: false,
    });
  }
}

export class DriveAccountAdapter implements ProtonDriveAccount {
  constructor(private readonly addresses: Addresses) {}
  getOwnPrimaryAddress(): Promise<ProtonDriveAccountAddress> { return this.addresses.getOwnPrimaryAddress(); }
  getOwnAddresses(): Promise<ProtonDriveAccountAddress[]> { return this.addresses.getOwnAddresses(); }
  getOwnAddress(e: string): Promise<ProtonDriveAccountAddress> { return this.addresses.getOwnAddress(e); }
  hasProtonAccount(email: string): Promise<boolean> { return this.addresses.hasProtonAccount(email); }
  getPublicKeys(email: string, forceRefresh?: boolean) { return this.addresses.getPublicKeys(email, forceRefresh); }
}
