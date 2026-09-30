export const sessionCookie = 'pocketwise_session';
export const cloudMode = () => process.env.VERCEL === '1' || process.env.DEPLOYMENT_MODE === 'cloud' || Boolean(process.env.APP_PASSWORD);

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

async function signature(message: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}

export async function issueSession(secret: string) {
  const expiry = String(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return `${expiry}.${await signature(expiry, secret)}`;
}

export async function validSession(token: string | undefined, secret: string) {
  if (!token || !secret) return false;
  const [expiry, mac, extra] = token.split('.');
  if (extra || !/^\d{13}$/.test(expiry || '') || Number(expiry) < Date.now() || !mac) return false;
  const expected = await signature(expiry, secret);
  if (mac.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < mac.length; i++) mismatch |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
