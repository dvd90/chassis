import {
  clerkMiddleware,
  requireAuth as clerkRequireAuth
} from '@clerk/express';
import { setAuthProvider } from '../core/auth';
import { logger } from '../utils/logger';

/**
 * Enabled when CLERK_SECRET_KEY is set (read from the env by Clerk itself).
 * Registers Clerk's middleware as the provider used by @protectedRoute.
 */
export function initClerk(): void {
  setAuthProvider([clerkMiddleware(), clerkRequireAuth()]);
  logger.info('✅ Clerk authentication enabled');
}
