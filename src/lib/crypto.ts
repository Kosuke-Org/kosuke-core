import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * Key must be at least 32 characters for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  // Use scrypt to derive a proper 32-byte key from the secret
  const salt = Buffer.from('kosuke-api-key-salt'); // Static salt for deterministic key derivation
  return scryptSync(key, salt, 32);
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns base64-encoded string: IV + AuthTag + CipherText
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine IV + AuthTag + CipherText
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt an AES-256-GCM encrypted string
 * Expects base64-encoded string: IV + AuthTag + CipherText
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  // Extract IV, AuthTag, and CipherText
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

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
