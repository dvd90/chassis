import type { AuthModule } from '../types';
import * as none from './none';
import * as noneEdge from './none.middleware';
import * as jwt from './jwt'; // chassis:session
import * as jwtEdge from './jwt.middleware'; // chassis:session
import * as auth0 from './auth0'; // chassis:auth0
import * as auth0Edge from './auth0.middleware'; // chassis:auth0
import * as clerk from './clerk'; // chassis:clerk
import * as clerkEdge from './clerk.middleware'; // chassis:clerk

/**
 * Typecheck-only: every provider must be a drop-in for every other, because
 * create-chassis picks one by rewriting `auth/active.ts`. Nothing imports
 * this file at runtime — it exists so a provider that drifts out of shape
 * fails `npm run verify` here rather than in someone's generated project.
 */
void (none satisfies AuthModule);
void noneEdge.middleware;
void (jwt satisfies AuthModule); // chassis:session
void jwtEdge.middleware; // chassis:session
void (auth0 satisfies AuthModule); // chassis:auth0
void auth0Edge.middleware; // chassis:auth0
void (clerk satisfies AuthModule); // chassis:clerk
void clerkEdge.middleware; // chassis:clerk
