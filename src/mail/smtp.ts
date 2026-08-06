import { createTransport } from 'nodemailer';
import { config } from '../config';
import type { MailMessage, MailTransport } from './index';

/**
 * SMTP delivery, active when SMTP_URL is set.
 *
 * This exists for development and tests — point it at mailpit
 * (`SMTP_URL=smtp://localhost:1025`) and every sign-in email lands in a web
 * inbox you can read. It is a working transport rather than a stub, so it
 * would also drive a real relay, but a production system should bind its
 * provider's SDK through `setMailTransport()` instead.
 */
export function smtpTransport(url: string): MailTransport {
  const transport = createTransport(url);

  return {
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({
        from: config.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
    }
  };
}
