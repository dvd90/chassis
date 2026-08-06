import { Request, Response } from 'express';
import { AppError, ERROR_CODES, Routable, protectedRoute, route } from '../core';
import { sameOrigin } from '../middleware/sameOrigin';
import { readCookie } from '../utils/cookies';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  endSession,
  refreshSession,
  revokeAllSessions,
  setRefreshCookie
} from '../services/session';

/**
 * Session lifecycle: exchange a refresh token for a new access token, sign out
 * of one device, or sign out of all of them.
 *
 * The refresh token arrives either in the httpOnly cookie (browsers) or in the
 * body (API clients and mobile apps). Cookie-bearing routes go through
 * `sameOrigin`, because a cookie is ambient credentials; the body path is
 * unaffected by CSRF and unaffected by that check.
 */
function presentedToken(req: Request): string | undefined {
  const body = req.body as { refreshToken?: string } | undefined;
  return body?.refreshToken ?? readCookie(req, REFRESH_COOKIE);
}

export class SessionController extends Routable {
  constructor() {
    super('/auth');
  }

  /**
   * @desc   Rotate the refresh token and mint a new access token
   * @access Public (the refresh token is the credential)
   */
  @route('post', '/refresh', [sameOrigin])
  async refresh(req: Request, res: Response): Promise<Response> {
    const presented = presentedToken(req);
    if (!presented) {
      throw new AppError(ERROR_CODES.WRONG_TOKEN, 'No refresh token supplied');
    }

    const session = await refreshSession(presented);
    setRefreshCookie(res, session.refreshToken);

    return req.resHandler.ok({
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn
    });
  }

  /**
   * @desc   Sign out of this device
   * @access Public — idempotent, so an already-dead session is still a 204
   */
  @route('post', '/logout', [sameOrigin])
  async logout(req: Request, res: Response): Promise<Response> {
    await endSession(presentedToken(req));
    clearRefreshCookie(res);
    return req.resHandler.noContent();
  }

  /**
   * @desc   Sign out of every device for this identity
   * @access Private
   */
  @protectedRoute('post', '/revoke-all', [sameOrigin])
  async revokeAll(req: Request, res: Response): Promise<Response> {
    if (!req.identityId) {
      throw new AppError(ERROR_CODES.WRONG_TOKEN, 'Unidentified token');
    }

    await revokeAllSessions(req.identityId);
    clearRefreshCookie(res);
    return req.resHandler.noContent();
  }
}
