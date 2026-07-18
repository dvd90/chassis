import { Schema, model } from 'mongoose';

/**
 * Example Mongoose model — the Mongo equivalent of the Drizzle `examples`
 * table. Replace or extend with your own. Mongoose has no separate `db`
 * handle: the connection lives in src/integrations/mongo.ts and models
 * register themselves on import.
 */
export interface Example {
  name: string;
  createdAt: Date;
}

const exampleSchema = new Schema<Example>({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const ExampleModel = model<Example>('Example', exampleSchema);
