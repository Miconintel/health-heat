import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ValueTransformer } from 'typeorm';

/**
 * AES-256-GCM field-level encryption for GDPR special-category (health) data.
 *
 * Stored format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`.
 * The version prefix leaves room for key rotation later.
 */
const VERSION = 'v1';
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.HEALTH_DATA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('HEALTH_DATA_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'HEALTH_DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded',
    );
  }
  cachedKey = key;
  return key;
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptString(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised encrypted field format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** TypeORM transformer: any JSON-serialisable value <-> encrypted text column. */
export const encryptedJson: ValueTransformer = {
  to: (value: unknown) =>
    value === null || value === undefined
      ? null
      : encryptString(JSON.stringify(value)),
  from: (value: string | null) =>
    value === null || value === undefined
      ? null
      : (JSON.parse(decryptString(value)) as unknown),
};
