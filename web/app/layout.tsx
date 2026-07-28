import Link from 'next/link';
import type { ReactNode } from 'react';
import { Provider, renderAccountBadge } from '@/auth/active';
import './globals.css';

export const metadata = {
  title: 'Chassis',
  description: 'A Next.js front end wired to the Chassis API.'
};

export default async function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <Provider>
      <html lang="en">
        <body>
          {/* Decorative backdrop: drifting light, grid, grain. See globals.css. */}
          <div className="fx" aria-hidden="true">
            <span className="fx-blob fx-blob-a" />
            <span className="fx-blob fx-blob-b" />
            <span className="fx-blob fx-blob-c" />
            <span className="fx-grid" />
            <span className="fx-noise" />
          </div>

          <header className="site-header">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                🏎️
              </span>
              Chassis
            </Link>
            <nav className="site-nav">
              <Link href="/account">Account</Link>
              {await renderAccountBadge()}
            </nav>
          </header>

          <main>{children}</main>

          <footer className="site-footer">
            Pages are server components; they reach the API through{' '}
            <code>lib/api.ts</code>.
          </footer>
        </body>
      </html>
    </Provider>
  );
}
