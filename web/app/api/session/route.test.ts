import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_COOKIE } from '@/auth/providers/jwt.shared';
import { DELETE, POST } from './route';

/**
 * The security-critical half of local-JWT auth: the token is exchanged
 * server-side and must reach the browser only as an httpOnly cookie, never
 * in a response body a script could read.
 */
function post(body: unknown) {
  return POST(
    new Request('http://localhost:3000/api/session', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  );
}

const credentials = { email: 'dev@example.com', password: 'correct-horse-42' };

function apiReturns(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  );
}

describe('POST /api/session', () => {
  beforeEach(() => {
    apiReturns({
      user: { id: '1', email: credentials.email },
      token: 'tok-123'
    });
  });

  it('exchanges credentials at the API and stores the token in a cookie', async () => {
    const res = await post(credentials);
    expect(res.status).toBe(200);

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${TOKEN_COOKIE}=tok-123`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
  });

  it('never returns the token in the response body', async () => {
    const body = await (await post(credentials)).json();
    expect(body.user).toEqual({ id: '1', email: credentials.email });
    expect(body.token).toBeUndefined();
  });

  it('calls the API login endpoint, not anything else', async () => {
    await post(credentials);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/auth/login');
    expect(init.method).toBe('POST');
  });

  it('passes the API status through on bad credentials, and sets no cookie', async () => {
    apiReturns({ message: 'Invalid email or password' }, 401);
    const res = await post(credentials);
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a malformed body with 400 without calling the API', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/session', () => {
  it('clears the cookie on the path it was set on', async () => {
    const res = await DELETE();
    const cookie = res.headers.get('set-cookie') ?? '';

    // Next clears a cookie by blanking it and back-dating the expiry.
    expect(cookie).toContain(`${TOKEN_COOKIE}=;`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('Path=/');
  });
});
