import type {
  MagicCredential,
  MagicStore,
  NewMagicCredential
} from './magic';

/**
 * In-memory magic-link credentials — the fallback when no database is
 * configured.
 *
 * ponytail: process-local, so a restart invalidates every outstanding link.
 * That is acceptable for development (links live 15 minutes anyway); pick a
 * database before running more than one instance.
 */
const credentials = new Map<string, MagicCredential>();
let nextId = 1;

export const memoryMagic: MagicStore = {
  async insert(credential: NewMagicCredential): Promise<void> {
    credentials.set(credential.tokenHash, {
      id: String(nextId++),
      email: credential.email,
      codeHash: credential.codeHash,
      attempts: 0,
      returnTo: credential.returnTo,
      expiresAt: credential.expiresAt.toISOString(),
      consumedAt: null,
      voidedAt: null
    });
  },

  async findByTokenHash(tokenHash: string): Promise<MagicCredential | null> {
    return credentials.get(tokenHash) ?? null;
  },

  async findLiveByEmail(email: string): Promise<MagicCredential | null> {
    for (const credential of credentials.values()) {
      if (
        credential.email === email.toLowerCase() &&
        !credential.consumedAt &&
        !credential.voidedAt
      ) {
        return credential;
      }
    }
    return null;
  },

  async markConsumed(id: string, at: Date): Promise<void> {
    for (const credential of credentials.values()) {
      if (credential.id === id) credential.consumedAt = at.toISOString();
    }
  },

  async bumpAttempts(id: string): Promise<void> {
    for (const credential of credentials.values()) {
      if (credential.id === id) credential.attempts += 1;
    }
  },

  async voidAllForEmail(email: string, at: Date): Promise<void> {
    for (const credential of credentials.values()) {
      if (
        credential.email === email.toLowerCase() &&
        !credential.consumedAt &&
        !credential.voidedAt
      ) {
        credential.voidedAt = at.toISOString();
      }
    }
  }
};

/** Test-only: forget every issued credential. */
export function resetMemoryMagic(): void {
  credentials.clear();
  nextId = 1;
}
