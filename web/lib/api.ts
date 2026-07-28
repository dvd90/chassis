import { getAccessToken } from '@/auth/active';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Server-side fetch against the Chassis API. It attaches the active
 * provider's bearer token when there is one, so every page and route
 * handler talks to the API the same way regardless of which auth provider
 * this project was scaffolded with.
 *
 * Server-side only: it reads the token from cookies/session, which are not
 * available (and must not be exposed) in the browser.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!res.ok) {
    throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} failed`);
  }

  return (await res.json()) as T;
}
