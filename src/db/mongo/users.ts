import { Model, Schema, model, models } from 'mongoose';

/**
 * Mongo-backed user store for local-JWT auth, model included — the Mongo
 * equivalent of the Drizzle `users` table. Shape-compatible with `UserStore`
 * in ../users.ts, which imports it by feature flag; nothing here depends on
 * that file, so it stands alone when a different auth provider is scaffolded.
 */
export interface User {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

const userSchema = new Schema<User>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Reuse an already-compiled model rather than registering twice: this
// module is re-imported on dev-server reloads and between tests, and
// Mongoose throws `OverwriteModelError` on a duplicate registration.
export const UserModel: Model<User> =
  (models.User as Model<User>) ?? model<User>('User', userSchema);

export const mongoUsers = {
  async findByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    return doc
      ? {
          id: String(doc._id),
          email: doc.email,
          passwordHash: doc.passwordHash
        }
      : null;
  },

  async create(email: string, passwordHash: string) {
    const doc = await UserModel.create({
      email: email.toLowerCase(),
      passwordHash
    });
    return { id: String(doc._id), email: doc.email };
  }
};
