import { config } from '../config';
import { memorySessions } from './memory-sessions';
import { sqliteSessions } from './sqlite/sessions'; // chassis:sqlite
import { postgresSessions } from './postgres/sessions'; // chassis:postgres
import { mongoSessions } from './mongo/sessions'; // chassis:mongo

/**
 * Refresh-token storage behind the session layer.
 *
 * Tokens are stored only as SHA-256 digests, so a database dump cannot be
 * replayed. Resolution follows the same flag-keyed table as ./users.ts, so the
 * store follows whichever database is configured and falls back to memory in
 * development.
 */
export interface NewRefreshToken {
  familyId: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  familyCreatedAt: Date;
}

export interface RefreshToken {
  id: string;
  familyId: string;
  userId: string;
  expiresAt: string;
  familyCreatedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

export interface RefreshTokenStore {
  insert(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  markRotated(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}

const stores: Array<[feature: string, store: RefreshTokenStore]> = [
  ['sqlite', sqliteSessions], // chassis:sqlite
  ['postgres', postgresSessions], // chassis:postgres
  ['mongo', mongoSessions] // chassis:mongo
];

export function sessionStore(): RefreshTokenStore {
  const configured = stores.find(([feature]) => config.features[feature]);
  return configured?.[1] ?? memorySessions;
}
