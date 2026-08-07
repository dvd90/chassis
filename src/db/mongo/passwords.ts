import { UserModel } from './users';

/**
 * Mongo-backed password hashes. The hash lives on the identity document, but
 * reaching it goes through this file so that scaffolding without the password
 * module removes every reference to it — see ../passwords.ts.
 */
export const mongoPasswords = {
  async get(userId: string) {
    const doc = await UserModel.findById(userId).select('passwordHash').lean();
    return doc?.passwordHash ?? null;
  },

  async set(userId: string, hash: string) {
    await UserModel.updateOne({ _id: userId }, { $set: { passwordHash: hash } });
  }
};
