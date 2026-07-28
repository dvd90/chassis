import Link from 'next/link';
import { AUTH_ID, getAccessToken } from '@/auth/active';
import { apiFetch } from '@/lib/api';

interface Status {
  status: string;
  uptime: number;
}

function formatUptime(seconds: number) {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function Home() {
  const [status, token] = await Promise.all([
    apiFetch<Status>('/status').catch(() => null),
    getAccessToken()
  ]);

  return (
    <>
      <section className="hero rise">
        <span className="eyebrow">
          <span className={`dot`} style={{ color: 'var(--accent)' }} />
          Express&nbsp;5 · TypeScript · Next.js
        </span>
        <h1>Your API, already wired up.</h1>
        <p className="lede">
          This page rendered on the server, called the Chassis API, and attached
          your token if you have one. Everything below is live.
        </p>
      </section>

      <div className="grid">
        <section className="card rise" style={{ animationDelay: '60ms' }}>
          <div className="card-head">
            <h2>API</h2>
            <span className={`pill ${status ? 'is-up' : 'is-down'}`}>
              <span className="dot" />
              {status ? status.status : 'unreachable'}
            </span>
          </div>

          {status ? (
            <dl className="rows">
              <div className="row">
                <dt>Uptime</dt>
                <dd>{formatUptime(status.uptime)}</dd>
              </div>
              <div className="row">
                <dt>Endpoint</dt>
                <dd>/status</dd>
              </div>
            </dl>
          ) : (
            <>
              <p className="hint">
                Nothing answered at the configured API URL.
              </p>
              <p className="hint">
                Start it with <code>npm run dev</code>, then check{' '}
                <code>API_URL</code> in <code>.env.local</code>.
              </p>
            </>
          )}
        </section>

        <section className="card rise" style={{ animationDelay: '120ms' }}>
          <div className="card-head">
            <h2>Auth</h2>
            <span className={`pill ${token ? 'is-up' : ''}`}>
              {token && <span className="dot" />}
              {token ? 'signed in' : 'signed out'}
            </span>
          </div>

          <dl className="rows">
            <div className="row">
              <dt>Provider</dt>
              <dd>{AUTH_ID}</dd>
            </div>
            <div className="row">
              <dt>Bearer token</dt>
              <dd>{token ? 'attached' : 'none'}</dd>
            </div>
          </dl>

          {AUTH_ID === 'none' ? (
            <p className="hint">
              Scaffolded without a provider — every request goes out
              unauthenticated.
            </p>
          ) : (
            !token && (
              <Link href="/sign-in" className="button">
                Sign in
              </Link>
            )
          )}
        </section>

        <section className="card rise" style={{ animationDelay: '180ms' }}>
          <div className="card-head">
            <h2>Next</h2>
          </div>
          <dl className="rows">
            <div className="row">
              <dt>Add an endpoint</dt>
              <dd>npm run gen</dd>
            </div>
            <div className="row">
              <dt>Call it from here</dt>
              <dd>lib/api.ts</dd>
            </div>
            <div className="row">
              <dt>Swap auth provider</dt>
              <dd>auth/active.ts</dd>
            </div>
          </dl>
          <p className="hint">
            One re-export line picks the provider — nothing else in the app
            names one.
          </p>
        </section>
      </div>
    </>
  );
}
