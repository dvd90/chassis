import { Auth0Client } from '@auth0/nextjs-auth0/server';

let client: Auth0Client | undefined;

/**
 * Built lazily so importing this module never throws on missing env vars.
 *
 * `audience` is the load-bearing option: without it Auth0 returns an ID
 * token, and the API's express-oauth2-jwt-bearer check rejects every
 * request. It must match AUTH0_AUDIENCE on the API side exactly.
 */
export function auth0(): Auth0Client {
  client ??= new Auth0Client({
    authorizationParameters: {
      audience: process.env.AUTH0_AUDIENCE,
      scope: 'openid profile email offline_access'
    }
  });
  return client;
}
