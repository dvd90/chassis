import { redirect } from 'next/navigation';
import { AUTH_ID, getAccessToken } from '@/auth/active';
import { apiFetch } from '@/lib/api';

interface Status {
  status: string;
}

export const metadata = { title: 'Account · Chassis' };

/**
 * The proof that the whole chain works: a page that only renders with a
 * token, and an API call carrying that token as a bearer credential.
 * Middleware redirects most unauthenticated visits before this runs — this
 * check is the backstop, because middleware alone is never the guard.
 */
export default async function AccountPage() {
  const token = await getAccessToken();
  if (!token) redirect('/sign-in');

  const status = await apiFetch<Status>('/status').catch(() => null);

  return (
    <>
      <section className="hero rise">
        <span className="eyebrow">
          <span className="dot" style={{ color: 'var(--success)' }} />
          Protected route
        </span>
        <h1>Account</h1>
        <p className="lede">
          You reached this page with a token, and that token went to the API
          with the request below.
        </p>
      </section>

      <div className="grid">
        <section className="card rise" style={{ animationDelay: '60ms' }}>
          <div className="card-head">
            <h2>Session</h2>
            <span className="pill is-up">
              <span className="dot" />
              {AUTH_ID}
            </span>
          </div>
          <dl className="rows">
            <div className="row">
              <dt>Token</dt>
              <dd>{token.slice(0, 14)}…</dd>
            </div>
            <div className="row">
              <dt>Length</dt>
              <dd>{token.length} chars</dd>
            </div>
          </dl>
        </section>

        <section className="card rise" style={{ animationDelay: '120ms' }}>
          <div className="card-head">
            <h2>Authenticated call</h2>
            <span className={`pill ${status ? 'is-up' : 'is-down'}`}>
              <span className="dot" />
              {status ? status.status : 'failed'}
            </span>
          </div>
          <dl className="rows">
            <div className="row">
              <dt>Request</dt>
              <dd>GET /status</dd>
            </div>
            <div className="row">
              <dt>Header</dt>
              <dd>Authorization: Bearer</dd>
            </div>
          </dl>
          <p className="hint">
            Point <code>apiFetch</code> at a <code>@protectedRoute</code> to
            watch the API enforce it.
          </p>
        </section>
      </div>
    </>
  );
}
