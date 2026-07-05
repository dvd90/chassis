import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Enabled when MONGODB_URI is set. */
export async function initMongo(): Promise<void> {
  await mongoose.connect(config.mongo.uri as string);
  logger.info('✅ MongoDB connected');
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function closeMongo(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
