import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Pluggable payment gate, mirroring src/core/auth.ts. A payments integration
 * (e.g. x402) registers a gate factory at boot; `@paidRoute` uses
 * `requirePayment(price)`, which resolves the gate at request time — so route
 * decorators can run before any integration has initialized.
 */
export type PaymentGate = (price: string) => RequestHandler;

let gate: PaymentGate | undefined;

export function setPaymentGate(factory: PaymentGate): void {
  gate = factory;
}

export function requirePayment(price: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!gate) {
      return req.resHandler.notImplemented(
        'This route requires payment but no payment provider is configured. ' +
          'Set the x402 environment variables (see .env.example) or register ' +
          'your own gate with setPaymentGate().'
      );
    }
    return gate(price)(req, res, next);
  };
}
