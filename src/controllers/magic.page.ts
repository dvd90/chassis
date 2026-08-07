/**
 * The confirmation page.
 *
 * ponytail: one inline HTML string, no view engine, no template directory, no
 * client-side JavaScript. It exists to turn a prefetchable GET into a
 * deliberate POST, and a form does that on its own. Products with a front end
 * point MAGIC_LINK_BASE_URL at their own page instead and never see this one.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    // Scanners and previewers must not be encouraged to fetch anything here.
    '<meta name="robots" content="noindex,nofollow">',
    `<title>${title}</title>`,
    '<style>',
    'body{font-family:system-ui,sans-serif;line-height:1.5;margin:0;',
    'display:grid;place-items:center;min-height:100vh;background:#f6f7f9}',
    'main{max-width:26rem;padding:2rem;background:#fff;border-radius:12px;',
    'box-shadow:0 1px 3px rgba(0,0,0,.12);text-align:center}',
    'button{font:inherit;padding:.75rem 1.5rem;border:0;border-radius:8px;',
    'background:#111;color:#fff;cursor:pointer}',
    'p{color:#444}',
    '</style></head><body><main>',
    body,
    '</main></body></html>'
  ].join('');
}

/**
 * Note there is no `returnTo` field: the destination was validated and stored
 * when the link was issued, and redemption re-reads it from there. A value
 * posted back from this page would be attacker-controlled, which is exactly
 * how a redemption endpoint becomes an open redirect.
 */
export function confirmPage(token: string): string {
  return page(
    'Confirm sign-in',
    [
      '<h1>Confirm sign-in</h1>',
      '<p>Click below to finish signing in on this device.</p>',
      '<form method="post" action="/auth/magic/redeem">',
      `<input type="hidden" name="token" value="${escapeHtml(token)}">`,
      '<button type="submit">Sign in</button>',
      '</form>'
    ].join('')
  );
}

export function resultPage(message: string): string {
  return page(
    'Sign-in link',
    [
      '<h1>This link no longer works</h1>',
      `<p>${escapeHtml(message)}</p>`,
      '<p>Request a new one and it will arrive in a moment.</p>'
    ].join('')
  );
}
