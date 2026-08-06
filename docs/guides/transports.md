# Transports

How sign-in emails — and, if you want them, SMS codes — actually leave the
building.

**Chassis binds no email or SMS provider, and never will.** That choice belongs
to the product: it depends on your deliverability history, your data-residency
rules and your invoice. A template that picks one for you is a template you
spend an afternoon fighting. What ships instead is the seam, plus enough of an
implementation to develop against.

| Seam             | Ships                                              |
| ---------------- | -------------------------------------------------- |
| `MailTransport`  | console logger (default) and SMTP (`SMTP_URL`)     |
| `SmsTransport`   | nothing — unbound, and therefore silent            |

## Mail

```ts
export interface MailTransport {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}
```

With no configuration, the message is written to the log — the flow works on a
laptop with nothing installed. Set `SMTP_URL` and it goes over SMTP, which is
what makes the mailpit setup in [Magic link](magic-link.md) work.

For production, bind your provider at boot, next to the other integrations:

```ts
// src/integrations/mail.ts
import { Resend } from 'resend';
import { setMailTransport } from '../mail';

export function initResend(): void {
  const resend = new Resend(process.env.RESEND_API_KEY);
  setMailTransport({
    async send({ to, subject, html, text }) {
      await resend.emails.send({ from: 'you@example.com', to, subject, html, text });
    }
  });
}
```

Then call `initResend()` from `src/integrations/index.ts` behind a feature flag,
exactly like the built-ins. The shape is identical for every provider:

| Provider     | Package                  | The one call                                          |
| ------------ | ------------------------ | ----------------------------------------------------- |
| **Resend**   | `resend`                 | `resend.emails.send({ from, to, subject, html, text })` |
| **SendGrid** | `@sendgrid/mail`         | `sgMail.send({ from, to, subject, html, text })`       |
| **Postmark** | `postmark`               | `client.sendEmail({ From, To, Subject, HtmlBody, TextBody })` |
| **SES**      | `@aws-sdk/client-ses`    | `ses.send(new SendEmailCommand({ ... }))`              |
| **SMTP**     | `nodemailer` _(shipped)_ | already wired — just set `SMTP_URL`                    |

Whatever you bind, keep it fast or keep it queued: delivery runs after the
request has already been answered, but a transport that hangs still holds a
connection open.

## SMS

Optional, off, and silent until you wire two things:

```ts
export interface SmsTransport {
  send(message: { to: string; text: string }): Promise<void>;
}
```

```ts
import twilio from 'twilio';
import { setSmsTransport, setSmsRecipient } from '../sms';

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

setSmsTransport({
  async send({ to, text }) {
    await client.messages.create({ from: '+15550000000', to, body: text });
  }
});

// Chassis has no phone number to send to — this is where yours lives.
setSmsRecipient((identity) => phoneBook.get(identity.id) ?? null);
```

| Provider        | Package                  | The one call                                   |
| --------------- | ------------------------ | ---------------------------------------------- |
| **Twilio**      | `twilio`                 | `client.messages.create({ from, to, body })`   |
| **Vonage**      | `@vonage/server-sdk`     | `vonage.sms.send({ to, from, text })`          |
| **AWS SNS**     | `@aws-sdk/client-sns`    | `sns.send(new PublishCommand({ PhoneNumber, Message }))` |
| **MessageBird** | `messagebird`            | `mb.messages.create({ originator, recipients, body })`   |

### Why a recipient resolver rather than a `phone` column

Because the alternative is worse. A column would mean a migration nobody asked
for, a verification flow for the number itself, and a channel-selection setting
— all to support a feature most projects will not switch on. The resolver keeps
that entirely in the product: unbound, it returns `null`, and SMS silently does
nothing. There is no `MAGIC_CHANNEL` variable for the same reason — the
channels are simply whichever transports you bound.

## Testing against them

Bind a capture transport and assert on what would have been sent:

```ts
const inbox: MailMessage[] = [];
setMailTransport({
  async send(message) {
    inbox.push(message);
  }
});
```

That is exactly how `src/__tests__/magic.test.ts` checks that one email leaves
carrying both credentials. Call `setMailTransport()` with no argument to put
the default back.
