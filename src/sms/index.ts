import type { AuthUser } from '../db/users';

/**
 * The SMS seam — the same shape as the mail seam, and just as empty of
 * providers. Twilio, Vonage, SNS and MessageBird are ten-line bindings
 * documented in docs/guides/transports.md; none of them ships here.
 *
 * Two things are unbound by default, and either one left unbound means SMS
 * silently does nothing:
 *
 *  - the transport, because Chassis cannot know your gateway, and
 *  - the recipient resolver, because Chassis has no phone number to send to.
 *
 * That second seam is why the magic module adds no `phone` column and no
 * channel switch: where a number comes from is a product's question, and a
 * product that never answers it never sends an SMS.
 */
export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsTransport {
  send(message: SmsMessage): Promise<void>;
}

let bound: SmsTransport | undefined;
let resolveRecipient: (identity: AuthUser) => string | null = () => null;

/** Bind a gateway. Called with no argument, unbinds it. */
export function setSmsTransport(transport?: SmsTransport): void {
  bound = transport;
}

/** Teach Chassis where an identity's phone number lives. */
export function setSmsRecipient(
  resolver: (identity: AuthUser) => string | null
): void {
  resolveRecipient = resolver;
}

/**
 * Deliver the fallback code by SMS, if — and only if — a product bound both a
 * transport and a recipient. A no-op otherwise.
 */
export async function sendCodeBySms(
  identity: AuthUser | null,
  text: string
): Promise<void> {
  if (!bound || !identity) return;
  const to = resolveRecipient(identity);
  if (!to) return;
  await bound.send({ to, text });
}
