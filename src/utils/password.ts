import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing for the local-JWT auth module.
 *
 * scrypt ships in Node's standard library and is a memory-hard KDF, so
 * there is no argon2/bcrypt dependency (and no native build) to install.
 * Hashes are stored as `scrypt$<salt-hex>$<key-hex>` — self-describing,
 * so a future algorithm change can be detected by the prefix.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH
  );

  // timingSafeEqual throws on length mismatch — check first.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
