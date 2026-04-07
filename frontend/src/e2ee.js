function _b64encode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _b64decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltB64(len = 16) {
  return _b64encode(crypto.getRandomValues(new Uint8Array(len)));
}

async function deriveKekFromPassword(password, saltB64, iterations = 210_000) {
  const salt = _b64decode(saltB64);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createAndWrapDek(password) {
  const salt = randomSaltB64(16);
  const kek = await deriveKekFromPassword(password, salt);
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawDek = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek));
  return {
    dek,
    meta: { salt, wrap_iv: _b64encode(iv), wrapped_dek: _b64encode(wrapped) },
  };
}

export async function wrapExistingDek(dek, password) {
  const salt = randomSaltB64(16);
  const kek = await deriveKekFromPassword(password, salt);
  const rawDek = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek));
  return { salt, wrap_iv: _b64encode(iv), wrapped_dek: _b64encode(wrapped) };
}

export async function unwrapDek(password, meta) {
  const kek = await deriveKekFromPassword(password, meta.salt);
  const iv = _b64decode(meta.wrap_iv);
  const wrapped = _b64decode(meta.wrapped_dek);
  const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, wrapped);
  return crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptWithDek(dek, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, pt));
  return { iv: _b64encode(iv), ct: _b64encode(ct) };
}

export async function decryptWithDek(dek, blob) {
  const iv = _b64decode(blob.iv);
  const ct = _b64decode(blob.ct);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

