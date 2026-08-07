import { Model, Schema, model, models } from 'mongoose';

/**
 * Mongo-backed magic-link credentials, model included. Shape-compatible with
 * `MagicStore` in ../magic.ts, which imports it by feature flag; nothing here
 * depends on that file, so it stands alone when a different auth provider is
 * scaffolded.
 */
export interface MagicCredentialDoc {
  email: string;
  tokenHash: string;
  codeHash: string;
  attempts: number;
  returnTo: string | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  voidedAt: Date | null;
}

const magicCredentialSchema = new Schema<MagicCredentialDoc>({
  email: { type: String, required: true, lowercase: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  returnTo: { type: String, default: null },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  voidedAt: { type: Date, default: null }
});

// Reuse an already-compiled model rather than registering twice: this module
// is re-imported on dev-server reloads and between tests, and Mongoose throws
// `OverwriteModelError` on a duplicate registration.
export const MagicCredentialModel: Model<MagicCredentialDoc> =
  (models.MagicCredential as Model<MagicCredentialDoc>) ??
  model<MagicCredentialDoc>('MagicCredential', magicCredentialSchema);

function toCredential(doc: MagicCredentialDoc & { _id: unknown }) {
  return {
    id: String(doc._id),
    email: doc.email,
    codeHash: doc.codeHash,
    attempts: doc.attempts,
    returnTo: doc.returnTo,
    expiresAt: doc.expiresAt.toISOString(),
    consumedAt: doc.consumedAt?.toISOString() ?? null,
    voidedAt: doc.voidedAt?.toISOString() ?? null
  };
}

export const mongoMagic = {
  async insert(credential: {
    email: string;
    tokenHash: string;
    codeHash: string;
    returnTo: string | null;
    createdAt: Date;
    expiresAt: Date;
  }) {
    await MagicCredentialModel.create(credential);
  },

  async findByTokenHash(tokenHash: string) {
    const doc = await MagicCredentialModel.findOne({ tokenHash }).lean();
    return doc ? toCredential(doc) : null;
  },

  async findLiveByEmail(email: string) {
    const doc = await MagicCredentialModel.findOne({
      email: email.toLowerCase(),
      consumedAt: null,
      voidedAt: null
    }).lean();

    return doc ? toCredential(doc) : null;
  },

  async markConsumed(id: string, at: Date) {
    await MagicCredentialModel.updateOne(
      { _id: id },
      { $set: { consumedAt: at } }
    );
  },

  async bumpAttempts(id: string) {
    await MagicCredentialModel.updateOne({ _id: id }, { $inc: { attempts: 1 } });
  },

  async voidAllForEmail(email: string, at: Date) {
    await MagicCredentialModel.updateMany(
      { email: email.toLowerCase(), consumedAt: null, voidedAt: null },
      { $set: { voidedAt: at } }
    );
  }
};
