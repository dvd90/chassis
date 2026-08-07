import { config } from '../config';
import { memoryPasswords } from './memory-passwords';
import { sqlitePasswords } from './sqlite/passwords'; // chassis:sqlite
import { postgresPasswords } from './postgres/passwords'; // chassis:postgres
import { mongoPasswords } from './mongo/passwords'; // chassis:mongo

/**
 * The password module's half of the identity row.
 *
 * Kept apart from `./users.ts` on purpose: an identity is an email and whether
 * it has been proven, while a stored hash is one particular way of proving it.
 * Splitting them is what lets a project scaffolded without this module carry
 * no password code, column, or type in it at all.
 */
export interface PasswordStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, hash: string): Promise<void>;
}

const stores: Array<[feature: string, store: PasswordStore]> = [
  ['sqlite', sqlitePasswords], // chassis:sqlite
  ['postgres', postgresPasswords], // chassis:postgres
  ['mongo', mongoPasswords] // chassis:mongo
];

export function passwordStore(): PasswordStore {
  const configured = stores.find(([feature]) => config.features[feature]);
  return configured?.[1] ?? memoryPasswords;
}
