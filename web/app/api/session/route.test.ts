import { describe, expect, it } from 'vitest';
import { REFRESH_COOKIE, TOKEN_COOKIE } from '@/auth/providers/jwt.shared';
import { DELETE } from './route';

/**
 * What every sign-in method shares: signing out has to clear both cookies, on
 * the path they were set on. A logout that misses one leaves a usable refresh
 * token in the browser.
 */
describe('DELETE /api/session', () => {
  it('clears both cookies on the path they were set on', async () => {
    const res = await DELETE();
    const cookie = res.headers.get('set-cookie') ?? '';

    // Next clears a cookie by blanking it and back-dating the expiry.
    expect(cookie).toContain(`${TOKEN_COOKIE}=;`);
    expect(cookie).toContain(`${REFRESH_COOKIE}=;`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('Path=/');
  });
});
