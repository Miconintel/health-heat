import { randomBytes } from 'node:crypto';
import {
  decryptString,
  encryptString,
  encryptedJson,
} from './field-encryption';

describe('field encryption', () => {
  beforeAll(() => {
    process.env.HEALTH_DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  it('round-trips JSON and does not store plaintext', () => {
    const stored = encryptedJson.to(['asthma']) as string;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('asthma');
    expect(encryptedJson.from(stored)).toEqual(['asthma']);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptString('x')).not.toBe(encryptString('x'));
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptString('secret').split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptString(parts.join(':'))).toThrow();
  });

  it('passes null through', () => {
    expect(encryptedJson.to(null)).toBeNull();
    expect(encryptedJson.from(null)).toBeNull();
  });
});
