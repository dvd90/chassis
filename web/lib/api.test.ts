import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';

/**
 * The auth provider is mocked so this holds for whichever one a project was
 * scaffolded with — apiFetch's contract is the same either way: attach the
 * token when there is one, never cache, turn a non-2xx into an ApiError.
 */
const mocks = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('@/auth/active', () => ({ getAccessToken: mocks.getAccessToken }));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** The (url, init) the code under test passed to fetch. */
function lastCall() {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, init };
}

describe('apiFetch', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    );
  });

  it('attaches the bearer token when signed in', async () => {
    mocks.getAccessToken.mockResolvedValue('tok-123');
    await apiFetch('/status');
    expect(lastCall().headers.authorization).toBe('Bearer tok-123');
  });

  it('sends no Authorization header when signed out', async () => {
    mocks.getAccessToken.mockResolvedValue(null);
    await apiFetch('/status');
    expect(lastCall().headers.authorization).toBeUndefined();
  });

  it('targets the API base URL and never caches', async () => {
    mocks.getAccessToken.mockResolvedValue(null);
    await apiFetch('/status');
    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:8000/status');
    expect(init.cache).toBe('no-store');
  });

  it('returns the parsed body', async () => {
    mocks.getAccessToken.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'up' }))
    );
    await expect(apiFetch('/status')).resolves.toEqual({ status: 'up' });
  });

  it('throws ApiError carrying the status on a failed response', async () => {
    mocks.getAccessToken.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(apiFetch('/secret')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/secret')).rejects.toMatchObject({ status: 401 });
  });

  it('lets the caller override headers', async () => {
    mocks.getAccessToken.mockResolvedValue(null);
    await apiFetch('/things', {
      method: 'POST',
      headers: { 'x-call-id': 'abc' }
    });
    expect(lastCall().headers['x-call-id']).toBe('abc');
  });
});
