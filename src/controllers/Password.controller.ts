import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, ERROR_CODES, Routable, route, validate } from '../core';
import { userStore } from '../db/users';
import { passwordStore } from '../db/passwords';
import { hashPassword, verifyPassword } from '../utils/password';
import { setRefreshCookie, signingKey, startSession } from '../services/session';

/**
 * Register and sign in with a password — the classic half of local auth.
 *
 * Sessions are not this module's business: both endpoints hand off to
 * src/services/session.ts, the same layer every other sign-in method uses, so
 * a project with several flows has one session implementation, not several.
 */
const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

type Credentials = z.infer<typeof credentials>;

export class PasswordController extends Routable {
  constructor() {
    super('/auth');
  }

  /**
   * @desc   Create an account and start a session
   * @access Public
   */
  @route('post', '/register', [validate({ body: credentials })])
  async register(req: Request, res: Response): Promise<Response> {
    signingKey();
    const { email, password } = req.body as Credentials;
    const users = userStore();

    if (await users.findByEmail(email)) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email already registered');
    }

    const user = await users.create(email);
    await passwordStore().set(user.id, await hashPassword(password));

    const session = await startSession(user);
    setRefreshCookie(res, session.refreshToken);

    return req.resHandler.created({
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn
    });
  }

  /**
   * @desc   Exchange credentials for a session
   * @access Public
   */
  @route('post', '/login', [validate({ body: credentials })])
  async login(req: Request, res: Response): Promise<Response> {
    signingKey();
    const { email, password } = req.body as Credentials;
    const stored = await userStore().findByEmail(email);
    const hash = stored ? await passwordStore().get(stored.id) : null;

    // One branch for every failure mode — unknown address, an identity that
    // never set a password, wrong password — so none of them can be told
    // apart from outside.
    if (!stored || !hash || !(await verifyPassword(password, hash))) {
      return req.resHandler.wrongToken('Invalid email or password');
    }

    const session = await startSession({ id: stored.id, email: stored.email });
    setRefreshCookie(res, session.refreshToken);

    return req.resHandler.ok({
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn
    });
  }
}
