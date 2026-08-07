/**
 * The one sign-in email: a link to click, and a code to type if the link was
 * opened on a different device than the one waiting to be signed in.
 *
 * Deliberately plain. No images, no external stylesheet, no web fonts — it has
 * to be legible in a text-only client and must not depend on remote content
 * that a privacy-conscious client will block anyway.
 */
export interface MagicEmailInput {
  link: string;
  code: string;
  /** Human-readable lifetime, e.g. "15m". */
  expiresIn: string;
}

export function magicEmail(input: MagicEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Your sign-in link';

  const text = [
    'Sign in by opening this link:',
    '',
    input.link,
    '',
    `On another device? Enter this code instead: ${input.code}`,
    '',
    `Both expire in ${input.expiresIn}. If you did not request this, ignore`,
    'this email — nothing has changed on your account.'
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,sans-serif;line-height:1.5">',
    '<p>Sign in by opening this link:</p>',
    `<p><a href="${escapeHtml(input.link)}">Sign in</a></p>`,
    '<p>On another device? Enter this code instead:</p>',
    `<p style="font-size:1.5rem;letter-spacing:0.2em"><strong>${input.code}</strong></p>`,
    `<p>Both expire in ${input.expiresIn}. If you did not request this,`,
    ' ignore this email — nothing has changed on your account.</p>',
    '</div>'
  ].join('');

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
