import { config } from '../config';
import { memoryUsers } from './memory-users';
import { sqliteUsers } from './sqlite/users'; // chassis:sqlite
import { postgresUsers } from './postgres/users'; // chassis:postgres
import { mongoUsers } from './mongo/users'; // chassis:mongo

/**
 * The user store behind local-JWT auth (`src/controllers/Auth.controller.ts`).
 *
 * Auth0 and Clerk host their own user directories, so this seam exists only
 * for the `jwt` provider. It resolves the same way integrations do — by
 * feature flag, at call time — so the store follows whichever database is
 * configured, and falls back to an in-memory dev store when none is.
 */
export interface AuthUser {
  id: string;
  email: string;
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<StoredUser | null>;
  create(email: string, passwordHash: string): Promise<AuthUser>;
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
