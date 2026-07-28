import { Request, Response } from 'express';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { AppError, ERROR_CODES, Routable, route, validate } from '../core';
import { config } from '../config';
import { AuthUser, userStore } from '../db/users';
import { hashPassword, verifyPassword } from '../utils/password';

/**
 * Register/login for the local-JWT provider — the one auth option that has
 * no hosted user directory behind it (Auth0 and Clerk issue their own
 * tokens, so they ship no controller). Tokens are signed with the same
 * JWT_SECRET that src/integrations/jwt.ts verifies, so a token minted here
 * is accepted by every `@protectedRoute`.
 *
 * ponytail: access tokens only, no refresh rotation — clients re-login when
 * a token expires. Add a refresh endpoint here if sessions need to outlive
 * TOKEN_TTL without a password prompt.
 */
const TOKEN_TTL = '1h';

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

type Credentials = z.infer<typeof credentials>;

/** The signing key, or a 501 when the module is present but unconfigured. */
function signingKey(): Uint8Array {
  if (!config.jwt.secret) {
    throw new AppError(
      ERROR_CODES.NOT_IMPLEMENTED,
      'Local JWT auth is not configured. Set JWT_SECRET (see .env.example).'
    );
  }
  return new TextEncoder().encode(config.jwt.secret);
}

function issueToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(signingKey());
}

export class AuthController extends Routable {
  constructor() {
    super('/auth');
  }

  /**
   * @desc   Create an account and return a bearer token
   * @access Public
   */
  @route('post', '/register', [validate({ body: credentials })])
  async register(req: Request): Promise<Response> {
    signingKey();
    const { email, password } = req.body as Credentials;
    const store = userStore();

    if (await store.findByEmail(email)) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email already registered');
    }

    const user = await store.create(email, await hashPassword(password));
    return req.resHandler.created({ user, token: await issueToken(user) });
  }

  /**
   * @desc   Exchange credentials for a bearer token
   * @access Public
   */
  @route('post', '/login', [validate({ body: credentials })])
  async login(req: Request): Promise<Response> {
    signingKey();
    const { email, password } = req.body as Credentials;
    const stored = await userStore().findByEmail(email);

    // One branch for both failure modes: never reveal which emails exist.
    if (!stored || !(await verifyPassword(password, stored.passwordHash))) {
      return req.resHandler.wrongToken('Invalid email or password');
    }

    const user: AuthUser = { id: stored.id, email: stored.email };
    return req.resHandler.ok({ user, token: await issueToken(user) });
  }
}
