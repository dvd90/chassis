import { config } from '../config';
import { logger } from '../utils/logger';
import { smtpTransport } from './smtp';

/**
 * The mail seam.
 *
 * Chassis binds no email service provider, ever — that choice belongs to the
 * product, and a template that picks one for you is a template you have to
 * fight. Two implementations ship: a console logger (the default, so the magic
 * flow works with zero configuration) and SMTP (so it works against mailpit in
 * development). Everything else — Resend, SendGrid, SES, Postmark — is a
 * ten-line `setMailTransport()` call documented in docs/guides/transports.md.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * The zero-configuration default. Prints the message — including the link and
 * the code — so that a developer with no mail server can still complete a
 * sign-in from the terminal.
 */
const consoleTransport: MailTransport = {
  async send(message: MailMessage): Promise<void> {
    logger.info(`📧 mail to ${message.to} — ${message.subject}`, {
      body: message.text
    });
  }
};

let bound: MailTransport | undefined;

/** Bind a product's provider. Called with no argument, restores the default. */
export function setMailTransport(transport?: MailTransport): void {
  bound = transport;
}

let warned = false;

export function mailTransport(): MailTransport {
  if (bound) return bound;
  if (config.mail.smtpUrl) return smtpTransport(config.mail.smtpUrl);

  // The console transport prints the link and the code — that is the whole
  // point of it, and why the logger's redaction deliberately leaves the mail
  // body alone. In production it means live sign-in credentials land in
  // stdout, so say so once rather than failing a boot that may be deliberate.
  if (config.env === 'production' && !warned) {
    warned = true;
    logger.warn(
      'No SMTP_URL and no bound transport: sign-in links and codes are being ' +
        'written to the log. Set SMTP_URL or call setMailTransport().'
    );
  }

  return consoleTransport;
}
