// Cross-platform (browser + Bun) fork-login crypto using Web Crypto — no node:crypto.
const PROTON_ACCOUNT_URL = 'https://account.proton.me';
const FORK_AAD = new TextEncoder().encode('fork');
const GCM_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

export const FORK_POLL_INTERVAL_MS = 5000;
export const FORK_INITIAL_DELAY_MS = 5000;
export const FORK_MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

type ForkPayloadJson = {
    type?: string;
    keyPassword?: string;
};

function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

export function generateSignInUrl(
    authClientId: string,
    userCode: string,
): {
    encryptionKey: Uint8Array;
    signInUrl: string;
} {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const base64EncodedKey = toBase64(encryptionKey);
    const payload = `0:${userCode}:${base64EncodedKey}:${authClientId}`;
    const signInUrl = `${PROTON_ACCOUNT_URL}/desktop/login?app=drive&pv=3#payload=${encodeURIComponent(payload)}`;

    return {
        encryptionKey,
        signInUrl,
    };
}

export async function parseUserKeyPassword(encryptionKey: Uint8Array, encryptedPayload: string): Promise<string> {
    const decryptedPayload = await decryptForkPayload(encryptedPayload, encryptionKey);
    const userKeyPassword = parseForkUserKeyPassword(decryptedPayload);
    return userKeyPassword;
}

async function decryptForkPayload(encodedPayload: string, encryptionKey: Uint8Array): Promise<string> {
    const blob = fromBase64(encodedPayload);
    if (blob.length < GCM_NONCE_LENGTH + GCM_TAG_LENGTH) {
        throw new Error('Invalid fork payload blob length');
    }
    const nonce = blob.subarray(0, GCM_NONCE_LENGTH);
    // Web Crypto expects ciphertext || tag together (everything after the nonce).
    const cipherAndTag = blob.subarray(GCM_NONCE_LENGTH);
    const key = await crypto.subtle.importKey('raw', encryptionKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: FORK_AAD, tagLength: GCM_TAG_LENGTH * 8 },
        key,
        cipherAndTag,
    );
    return new TextDecoder().decode(plaintext);
}

function parseForkUserKeyPassword(decryptedPayloadJson: string): string {
    const payload = JSON.parse(decryptedPayloadJson) as ForkPayloadJson;
    const keyPassword = payload.keyPassword;
    if (typeof keyPassword !== 'string') {
        throw new Error('Failed to deserialize the fork payload');
    }
    return keyPassword;
}
