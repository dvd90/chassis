/**
 * Every Routable class exported from this file is auto-registered by the
 * app factory. Add a controller (or run `npm run gen <Name>`) and export
 * it here — that's the whole wiring.
 */
export * from './Status.controller';
export * from './Health.controller';
export * from './Session.controller'; // chassis:session
export * from './Password.controller'; // chassis:password
export * from './Magic.controller'; // chassis:magic
