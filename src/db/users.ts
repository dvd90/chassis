import { config } from '../config';
import { memoryUsers } from './memory-users';
import { sqliteUsers } from './sqlite/users'; // chassis:sqlite
import { postgresUsers } from './postgres/users'; // chassis:postgres
import { mongoUsers } from './mongo/users'; // chassis:mongo

/**
 * Identities behind local auth — the directory the session layer signs tokens
 * for. Auth0 and Clerk host their own, so this seam exists only for local
 * providers. It resolves the same way integrations do (by feature flag, at
 * call time), so the store follows whichever database is configured and falls
 * back to an in-memory dev store when none is.
 *
 * Deliberately free of any credential: an identity is an email address plus
 * whether that address has been proven. *How* someone proves it belongs to
 * whichever module does the proving, so nothing about sign-in methods appears
 * here — which is what lets those modules be scaffolded away cleanly.
 */
export interface AuthUser {
  id: string;
  email: string;
}

export interface StoredUser extends AuthUser {
  /** ISO 8601, or null until the address has been proven. */
  verifiedAt: string | null;
}

export interface UserStore {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  create(email: string): Promise<AuthUser>;
  markVerified(id: string, at: Date): Promise<void>;
}

/**
 * Candidate stores, each paired with the feature flag that selects it. A
 * table rather than an if-chain so that scaffolding with no database prunes
 * to an empty list while `config` stays referenced below — an if-chain would
 * leave an unused import behind and fail the build.
 */
const stores: Array<[feature: string, store: UserStore]> = [
  ['sqlite', sqliteUsers], // chassis:sqlite
  ['postgres', postgresUsers], // chassis:postgres
  ['mongo', mongoUsers] // chassis:mongo
];

export function userStore(): UserStore {
  const configured = stores.find(([feature]) => config.features[feature]);
  return configured?.[1] ?? memoryUsers;
}
