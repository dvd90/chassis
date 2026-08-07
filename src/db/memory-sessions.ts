import type {
  NewRefreshToken,
  RefreshToken,
  RefreshTokenStore
} from './sessions';

/**
 * In-memory refresh tokens — the fallback when no database is configured.
 *
 * ponytail: process-local, so every session dies with the process. Fine for
 * development and tests; pick a database before real users depend on staying
 * signed in across a deploy.
 */
const tokens = new Map<string, RefreshToken>();
let nextId = 1;

export const memorySessions: RefreshTokenStore = {
  async insert(token: NewRefreshToken): Promise<void> {
    tokens.set(token.tokenHash, {
      id: String(nextId++),
      familyId: token.familyId,
      userId: token.userId,
      expiresAt: token.expiresAt.toISOString(),
      familyCreatedAt: token.familyCreatedAt.toISOString(),
      rotatedAt: null,
      revokedAt: null
    });
  },

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return tokens.get(tokenHash) ?? null;
  },

  async markRotated(id: string, at: Date): Promise<void> {
    for (const token of tokens.values()) {
      if (token.id === id) token.rotatedAt = at.toISOString();
    }
  },

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const token of tokens.values()) {
      if (token.familyId === familyId && !token.revokedAt) {
        token.revokedAt = at.toISOString();
      }
    }
  },

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const token of tokens.values()) {
      if (token.userId === userId && !token.revokedAt) {
        token.revokedAt = at.toISOString();
      }
    }
  }
};

/** Test-only: forget every issued token. */
export function resetMemorySessions(): void {
  tokens.clear();
  nextId = 1;
}
