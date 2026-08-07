import { Model, Schema, model, models } from 'mongoose';

/**
 * Mongo-backed identity store for local auth, model included — the Mongo
 * equivalent of the Drizzle `users` table. Shape-compatible with `UserStore`
 * in ../users.ts, which imports it by feature flag; nothing here depends on
 * that file, so it stands alone when a different auth provider is scaffolded.
 */
export interface User {
  email: string;
  passwordHash?: string | null; // chassis:password
  verifiedAt: Date | null;
  createdAt: Date;
}

const userSchema = new Schema<User>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, default: null }, // chassis:password
  verifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Reuse an already-compiled model rather than registering twice: this
// module is re-imported on dev-server reloads and between tests, and
// Mongoose throws `OverwriteModelError` on a duplicate registration.
export const UserModel: Model<User> =
  (models.User as Model<User>) ?? model<User>('User', userSchema);

function toStored(doc: { _id: unknown; email: string; verifiedAt: Date | null }) {
  return {
    id: String(doc._id),
    email: doc.email,
    verifiedAt: doc.verifiedAt?.toISOString() ?? null
  };
}

export const mongoUsers = {
  async findByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    return doc ? toStored(doc) : null;
  },

  async findById(id: string) {
    const doc = await UserModel.findById(id).lean();
    return doc ? toStored(doc) : null;
  },

  async create(email: string) {
    const doc = await UserModel.create({ email: email.toLowerCase() });
    return { id: String(doc._id), email: doc.email };
  },

  async markVerified(id: string, at: Date) {
    await UserModel.updateOne({ _id: id }, { $set: { verifiedAt: at } });
  }
};
