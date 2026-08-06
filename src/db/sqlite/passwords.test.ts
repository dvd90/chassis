import { beforeAll, describe, expect, it } from 'vitest';
import { sqlitePasswords } from './passwords';
import { sqliteUsers } from './users';
import { createUsersTable } from './users.test';

/**
 * The password half of the identity row. In its own file so that scaffolding
 * without the password module prunes it — ./users.test.ts must keep passing on
 * its own.
 */
beforeAll(() => {
  createUsersTable();
});

describe('sqlitePasswords', () => {
  it('round-trips a hash for an identity', async () => {
    const user = await sqliteUsers.create('pw@example.com');
    expect(await sqlitePasswords.get(user.id)).toBeNull();

    await sqlitePasswords.set(user.id, 'scrypt$aa$bb');
    expect(await sqlitePasswords.get(user.id)).toBe('scrypt$aa$bb');
  });

  it('returns null for an identity that never had one', async () => {
    const user = await sqliteUsers.create('no-credential@example.com');
    expect(await sqlitePasswords.get(user.id)).toBeNull();
  });
});
