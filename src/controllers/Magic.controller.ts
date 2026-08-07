import { Request, Response } from 'express';
import { z } from 'zod';
import { Routable, route, validate } from '../core';
import { logger } from '../utils/logger';
import { rateLimit } from '../middleware/rateLimit';
import {
  deliver,
  probe,
  redeemCode,
  redeemToken,
  validateReturnTo,
  type Redemption
} from '../services/magic';
import { setRefreshCookie, startSession } from '../services/session';
import { confirmPage, resultPage } from './magic.page';

/**
 * Sign in by emailed link, with a typed code as the cross-device fallback.
 * See docs/guides/magic-link.md.
 */
const requestBody = z.object({
  email: z.string().email(),
  returnTo: z.string().optional()
});

const codeBody = z.object({
  email: z.string().email(),
  code: z.string()
});

const redeemBody = z.object({ token: z.string() });

/**
 * ponytail: constants, not environment variables. Nobody tunes these per
 * deployment, and two more env vars would be two more things to document,
 * validate and get wrong. Separate buckets on purpose — an attacker
 * enumerating many addresses from one IP and one hammering a single address
 * are different attacks, and one limit cannot catch both.
 */
const PER_EMAIL = { limit: 3, window: '15m' };
const PER_IP = { limit: 20, window: '15m' };

function wantsJson(req: Request): boolean {
  return req.accepts(['html', 'json']) === 'json';
}

/** Establish the session and answer in whichever shape the caller wants. */
async function completeSignIn(
  req: Request,
  res: Response,
  redemption: Redemption
): Promise<Response> {
  const session = await startSession(redemption.user);
  setRefreshCookie(res, session.refreshToken);

  if (wantsJson(req)) {
    return req.resHandler.ok({
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      returnTo: redemption.returnTo
    });
  }

  return req.resHandler.seeOther(redemption.returnTo ?? '/');
}

export class MagicController extends Routable {
  constructor() {
    super('/auth/magic');
  }

  /**
   * @desc   Email a sign-in link and code
   * @access Public
   */
  @route('post', '/request', [
    validate({ body: requestBody }),
    rateLimit({
      ...PER_EMAIL,
      key: (req) => `email:${String(req.body?.email).toLowerCase()}`,
      message: 'Too many sign-in requests for that address.'
    }),
    rateLimit({ ...PER_IP, key: (req) => `ip:${req.ip}` })
  ])
  async request(req: Request): Promise<Response> {
    const { email, returnTo } = req.body as z.infer<typeof requestBody>;
    const destination = validateReturnTo(returnTo);

    // Answer before doing any work, and answer the same way every time.
    // Whether this address exists is not something a caller gets to learn —
    // not from the body, and not from how long the reply took. Issuing and
    // sending happen after the response has already gone out.
    const response = req.resHandler.accepted({
      status: 'sent',
      message: 'If that address can sign in, a link is on its way.'
    });

    void deliver(email, destination).catch((error: Error) => {
      // Never log the address itself — an error log is not a place to leak a
      // user directory.
      logger.error('Failed to deliver magic link', { error: error.message });
    });

    return response;
  }

  /**
   * @desc   Show the confirmation page for a link — never consumes it
   * @access Public
   *
   * GET and HEAD are safe by contract, and here that is load-bearing rather
   * than pedantic: mail security scanners prefetch links, and a single-use
   * token spent by a scanner is the classic way this flow breaks. Nothing is
   * consumed until the person clicks, which is a POST.
   */
  @route('get', '/:token')
  async confirm(req: Request): Promise<Response> {
    const token = String(req.params.token);
    const { status, returnTo } = await probe(token);

    if (wantsJson(req)) return req.resHandler.ok({ status, returnTo });

    return req.resHandler.html(
      status === 'valid'
        ? confirmPage(token)
        : resultPage(
            status === 'expired'
              ? 'That link has expired.'
              : 'That link has already been used.'
          )
    );
  }

  /**
   * @desc   Redeem a link token and start a session
   * @access Public — the token is the credential, which is also why this is
   *         exempt from the same-origin check: it arrives by a cross-site
   *         navigation out of a mail client, by design.
   */
  @route('post', '/redeem', [validate({ body: redeemBody })])
  async redeem(req: Request, res: Response): Promise<Response> {
    const { token } = req.body as z.infer<typeof redeemBody>;
    return completeSignIn(req, res, await redeemToken(token));
  }

  /**
   * @desc   Redeem the six-digit code instead of the link
   * @access Public
   */
  @route('post', '/code', [
    validate({ body: codeBody }),
    rateLimit({
      ...PER_IP,
      key: (req) => `code-ip:${req.ip}`,
      message: 'Too many code attempts.'
    })
  ])
  async code(req: Request, res: Response): Promise<Response> {
    const { email, code } = req.body as z.infer<typeof codeBody>;
    return completeSignIn(req, res, await redeemCode(email, code));
  }
}
