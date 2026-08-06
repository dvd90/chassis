import { config } from '../config';
import { memoryMagic } from './memory-magic';
import { sqliteMagic } from './sqlite/magic'; // chassis:sqlite
import { postgresMagic } from './postgres/magic'; // chassis:postgres
import { mongoMagic } from './mongo/magic'; // chassis:mongo

/**
 * Magic-link credential storage.
 *
 * Both the link token and the fallback code are stored only as SHA-256
 * digests. Because issuing voids everything outstanding for an address,
 * `findLiveByEmail` returns at most one row.
 */
export interface NewMagicCredential {
  email: string;
  tokenHash: string;
  codeHash: string;
  returnTo: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface MagicCredential {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
  returnTo: string | null;
  expiresAt: string;
  consumedAt: string | null;
  voidedAt: string | null;
}

export interface MagicStore {
  insert(credential: NewMagicCredential): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<MagicCredential | null>;
  findLiveByEmail(email: string): Promise<MagicCredential | null>;
  markConsumed(id: string, at: Date): Promise<void>;
  bumpAttempts(id: string): Promise<void>;
  voidAllForEmail(email: string, at: Date): Promise<void>;
}

const stores: Array<[feature: string, store: MagicStore]> = [
  ['sqlite', sqliteMagic], // chassis:sqlite
  ['postgres', postgresMagic], // chassis:postgres
  ['mongo', mongoMagic] // chassis:mongo
];

export function magicStore(): MagicStore {
  const configured = stores.find(([feature]) => config.features[feature]);
  return configured?.[1] ?? memoryMagic;
}
