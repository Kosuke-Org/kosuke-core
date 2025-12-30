import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive encryption key using scrypt with provided salt
 * Uses ENCRYPTION_KEY from environment (validated in instrumentation.ts)
 */
function deriveKey(salt: Buffer): Buffer {
  // ENCRYPTION_KEY is validated in instrumentation.ts at startup
  const key = process.env.ENCRYPTION_KEY!;
  return scryptSync(key, salt, 32);
}

/**
 * Encrypt a string using AES-256-GCM with per-encryption random salt
 * Returns base64-encoded string: Salt + IV + AuthTag + CipherText
 */
export function encrypt(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine Salt + IV + AuthTag + CipherText
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt an AES-256-GCM encrypted string
 * Expects base64-encoded string: Salt + IV + AuthTag + CipherText
 */
export function decrypt(encryptedBase64: string): string {
  const combined = Buffer.from(encryptedBase64, 'base64');

  // Extract Salt, IV, AuthTag, and CipherText
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mask an API key for display purposes
 * Shows first 7 and last 4 characters: sk-ant-...XXXX
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 11) {
    return '***';
  }
  return `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`;
}
