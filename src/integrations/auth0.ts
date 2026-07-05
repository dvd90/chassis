import { auth } from 'express-oauth2-jwt-bearer';
import { setAuthProvider } from '../core/auth';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Enabled when AUTH0_DOMAIN and AUTH0_AUDIENCE are both set.
 * Registers an Auth0 JWT validator as the auth provider used by
 * @protectedRoute. Swap this file out to use any other IdP — just call
 * setAuthProvider() with your own middleware chain.
 */
export function initAuth0(): void {
  setAuthProvider([
    auth({
      issuerBaseURL: `https://${config.auth0.domain}/`,
      audience: config.auth0.audience
    })
  ]);

  logger.info('✅ Auth0 authentication enabled');
}
