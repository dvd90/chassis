import { Model, Schema, model, models } from 'mongoose';

/**
 * Mongo-backed refresh tokens, model included. Shape-compatible with
 * `RefreshTokenStore` in ../sessions.ts, which imports it by feature flag;
 * nothing here depends on that file, so it stands alone when a different auth
 * provider is scaffolded.
 */
export interface RefreshTokenDoc {
  familyId: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  familyCreatedAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>({
  familyId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  familyCreatedAt: { type: Date, required: true },
  rotatedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
});

// Reuse an already-compiled model rather than registering twice: this module
// is re-imported on dev-server reloads and between tests, and Mongoose throws
// `OverwriteModelError` on a duplicate registration.
export const RefreshTokenModel: Model<RefreshTokenDoc> =
  (models.RefreshToken as Model<RefreshTokenDoc>) ??
  model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);

export const mongoSessions = {
  async insert(token: {
    familyId: string;
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    familyCreatedAt: Date;
  }) {
    await RefreshTokenModel.create(token);
  },

  async findByHash(tokenHash: string) {
    const doc = await RefreshTokenModel.findOne({ tokenHash }).lean();
    return doc
      ? {
          id: String(doc._id),
          familyId: doc.familyId,
          userId: doc.userId,
          expiresAt: doc.expiresAt.toISOString(),
          familyCreatedAt: doc.familyCreatedAt.toISOString(),
          rotatedAt: doc.rotatedAt?.toISOString() ?? null,
          revokedAt: doc.revokedAt?.toISOString() ?? null
        }
      : null;
  },

  async markRotated(id: string, at: Date) {
    await RefreshTokenModel.updateOne({ _id: id }, { $set: { rotatedAt: at } });
  },

  async revokeFamily(familyId: string, at: Date) {
    await RefreshTokenModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: at } }
    );
  },

  async revokeAllForUser(userId: string, at: Date) {
    await RefreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: at } }
    );
  }
};
